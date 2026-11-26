"""
Drivers: the two demo drivers are removed on startup and never re-seeded; staff with Rentals can
read the roster (to assign drivers) but only the owner can add, edit or remove drivers.
Staff removal: the owner can permanently remove a staff account; staff can't; owners can't be removed.

Run (uses whatever DATABASE_URL points at; creates its own test rows):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_drivers_and_staff_removal.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import models
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones
from migrate import run_migrations, _remove_demo_drivers, DEMO_DRIVERS

client = TestClient(app)
OWNER = superadmin_phones()[0]


def _phone():
    return f"25197{uuid.uuid4().int % 10**7:07d}"


def _headers(user_id, phone, role="dealer_admin"):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(user_id), "phone_number": phone, "role": role})}


def _staff(perms):
    phone = _phone()
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1, full_name="Temp Staff",
                        is_active=True, permissions_json=models.encode_permissions(perms))
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id, phone, _headers(u.id, phone)
    finally:
        db.close()


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        return u.id, _headers(u.id, OWNER, "superadmin")
    finally:
        db.close()


# ------------------------------------------------------------------ demo drivers

def test_demo_drivers_removed_and_real_ones_kept():
    db = SessionLocal()
    try:
        demo = [models.Driver(full_name=n, phone_number=p, license_number=l, is_active=True, dealership_id=1)
                for n, p, l in DEMO_DRIVERS]
        # Same name as a demo driver but a different phone: a real person, must survive.
        real = models.Driver(full_name="Abebe Bikila", phone_number="0919999999", license_number=None,
                             is_active=True, dealership_id=1)
        db.add_all(demo + [real])
        db.commit()
        vehicle = db.query(models.Vehicle).first()
        booking_id = None
        if vehicle:
            b = models.RentalBooking(vehicle_id=vehicle.id, customer_name="C", customer_phone="0911",
                                     start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=1),
                                     total_days=1, total_price=1.0, assigned_driver_id=demo[0].id,
                                     dealership_id=1)
            db.add(b)
            db.commit()
            booking_id = b.id
        demo_ids, real_id = [d.id for d in demo], real.id

        _remove_demo_drivers(db)

        assert db.query(models.Driver).filter(models.Driver.id.in_(demo_ids)).count() == 0
        assert db.query(models.Driver).filter(models.Driver.id == real_id).first() is not None
        if booking_id:
            assert db.get(models.RentalBooking, booking_id).assigned_driver_id is None
            db.delete(db.get(models.RentalBooking, booking_id))
        db.delete(db.get(models.Driver, real_id))
        db.commit()
    finally:
        db.close()


def test_migration_no_longer_seeds_drivers():
    run_migrations()
    db = SessionLocal()
    try:
        for n, p, l in DEMO_DRIVERS:
            assert db.query(models.Driver).filter(models.Driver.full_name == n, models.Driver.phone_number == p,
                                                  models.Driver.license_number == l).count() == 0
    finally:
        db.close()


# ------------------------------------------------------------------ driver permissions

def test_rentals_staff_read_only_owner_manages():
    _, _, rentals = _staff(["rentals", "vehicles", "appointments", "gate"])
    _, owner = _owner()

    assert client.get("/api/admin/drivers", headers=rentals).status_code == 200
    body = {"full_name": "Real Driver", "phone_number": "0912121212", "license_number": "AA-1"}
    assert client.post("/api/admin/drivers", json=body, headers=rentals).status_code == 403

    r = client.post("/api/admin/drivers", json=body, headers=owner)
    assert r.status_code == 201, r.text
    did = r.json()["id"]
    assert any(d["id"] == did for d in client.get("/api/admin/drivers", headers=rentals).json())

    assert client.put(f"/api/admin/drivers/{did}", json={"is_active": False}, headers=rentals).status_code == 403
    assert client.delete(f"/api/admin/drivers/{did}", headers=rentals).status_code == 403

    r = client.put(f"/api/admin/drivers/{did}", json={"full_name": "Real Driver 2", "is_active": False}, headers=owner)
    assert r.status_code == 200 and r.json()["full_name"] == "Real Driver 2" and r.json()["is_active"] is False
    assert client.delete(f"/api/admin/drivers/{did}", headers=owner).status_code == 200
    assert client.get(f"/api/admin/drivers/{did}", headers=owner).status_code == 404


# ------------------------------------------------------------------ staff removal

def test_owner_can_permanently_remove_staff():
    uid, phone, staff_h = _staff(["vehicles"])
    _, _, other_staff = _staff(["vehicles", "appointments", "rentals", "gate"])
    owner_id, owner = _owner()

    db = SessionLocal()
    try:
        db.add(models.TelegramLinkToken(token=uuid.uuid4().hex, purpose="staff_link", user_id=uid,
                                        expires_at=datetime.utcnow() + timedelta(hours=1)))
        db.add(models.OTPVerification(phone_number=phone, otp_code="123456",
                                      expires_at=datetime.utcnow() + timedelta(minutes=5)))
        db.commit()
    finally:
        db.close()

    # Staff can't remove anyone, not even themselves.
    assert client.delete(f"/api/superadmin/staff/{uid}/permanent", headers=other_staff).status_code == 403
    assert client.delete(f"/api/superadmin/staff/{uid}/permanent", headers=staff_h).status_code == 403
    # Owners can't be removed.
    assert client.delete(f"/api/superadmin/staff/{owner_id}/permanent", headers=owner).status_code == 400

    assert client.delete(f"/api/superadmin/staff/{uid}/permanent", headers=owner).status_code == 204
    db = SessionLocal()
    try:
        assert db.get(models.User, uid) is None
        assert db.query(models.TelegramLinkToken).filter(models.TelegramLinkToken.user_id == uid).count() == 0
        assert db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == phone).count() == 0
    finally:
        db.close()

    # Their old session stops working immediately, and the list no longer shows them.
    assert client.get("/api/admin/me", headers=staff_h).status_code == 401
    assert all(s["id"] != uid for s in client.get("/api/superadmin/staff", headers=owner).json())
    assert client.delete(f"/api/superadmin/staff/{uid}/permanent", headers=owner).status_code == 404

    # The number can be added again later as a fresh account.
    local = "0" + phone[3:]
    r = client.post("/api/superadmin/staff", json={"full_name": "Back Again", "phone_number": local,
                                                    "permissions": ["vehicles"], "is_active": True}, headers=owner)
    assert r.status_code in (200, 201), r.text
    assert r.json()["id"] != uid


if __name__ == "__main__":
    run_migrations()
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e!r}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
