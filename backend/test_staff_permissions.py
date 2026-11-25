"""
Staff & permissions: login lock, per-permission 403/200, instant deactivation, staff CRUD
(never hard-deleted), superadmin-only dealership delete, and the migrate.py name/permission rules.

Run (uses whatever DATABASE_URL points at; creates its own test users/dealership):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_staff_permissions.py
"""
import os
import sys
import uuid
from unittest import mock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import auth
import models
from main import app
from database import SessionLocal
from auth import create_access_token, rate_limiter
from settings import settings, superadmin_phones
from migrate import run_migrations

client = TestClient(app)
OWNER = superadmin_phones()[0]


def _phone():
    """Fresh, unregistered Ethiopian number for each scenario."""
    return f"25197{uuid.uuid4().int % 10**7:07d}"


def _staff(phone, perms, active=True):
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == phone).first()
        if not u:
            u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1)
            db.add(u)
        u.permissions_json = models.encode_permissions(perms)
        u.is_active = active
        db.commit()
        db.refresh(u)
        return u.id, {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": phone, "role": u.role})}
    finally:
        db.close()


def _owner_headers():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        assert u is not None, "migrate.py should have created the owner row"
        return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": OWNER, "role": "superadmin"})}
    finally:
        db.close()


def _otp_rows(phone):
    db = SessionLocal()
    try:
        return db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == phone).count()
    finally:
        db.close()


def test_login_lock():
    sent = []

    async def fake_sms(phone, code):
        sent.append(phone)
        return True

    with mock.patch.object(auth, "send_otp_sms", fake_sms):
        # Unknown number: clear message, no OTP stored, no SMS, no user created.
        unknown = _phone()
        rate_limiter.reset_for_phone(unknown)
        r = client.post("/api/auth/request-otp", json={"phone_number": "0" + unknown[3:]})
        assert r.status_code == 403, r.text
        assert "not registered" in r.json()["detail"].lower()
        assert sent == [] and _otp_rows(unknown) == 0
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.phone_number == unknown).first() is None
        finally:
            db.close()

        # verify-otp can't be used to self-register either (even with a planted OTP row).
        db = SessionLocal()
        try:
            from datetime import datetime, timedelta
            db.add(models.OTPVerification(phone_number=unknown, otp_code="123456",
                                          expires_at=datetime.utcnow() + timedelta(minutes=3), is_used=False))
            db.commit()
        finally:
            db.close()
        r = client.post("/api/auth/verify-otp", json={"phone_number": unknown, "otp_code": "123456"})
        assert r.status_code == 403, r.text
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.phone_number == unknown).first() is None
        finally:
            db.close()

        # Deactivated staff: refused, no SMS.
        inactive = _phone()
        _staff(inactive, ["vehicles"], active=False)
        r = client.post("/api/auth/request-otp", json={"phone_number": inactive})
        assert r.status_code == 403 and "deactivated" in r.json()["detail"].lower(), r.text
        assert sent == []

        # Active staff and owners get a code by SMS.
        active = _phone()
        _staff(active, ["appointments"])
        r = client.post("/api/auth/request-otp", json={"phone_number": active})
        assert r.status_code == 200, r.text
        rate_limiter.reset_for_phone(OWNER)
        r = client.post("/api/auth/request-otp", json={"phone_number": OWNER})
        assert r.status_code == 200, r.text
        assert sent == [active, OWNER], sent
        assert "otp_code" not in r.json() or r.json().get("otp_code") is None, "OTP must never leak in the API"
    print("✓ login lock: unknown/deactivated numbers get 403 and no SMS; staff and owners get an OTP")


def test_full_login_returns_permissions():
    phone = _phone()
    _staff(phone, ["rentals"])
    with mock.patch.object(auth, "send_otp_sms", mock.AsyncMock(return_value=True)):
        assert client.post("/api/auth/request-otp", json={"phone_number": phone}).status_code == 200
    db = SessionLocal()
    try:
        code = db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == phone) \
            .order_by(models.OTPVerification.id.desc()).first().otp_code
    finally:
        db.close()
    r = client.post("/api/auth/verify-otp", json={"phone_number": phone, "otp_code": code})
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["permissions"] == ["rentals"] and user["is_superadmin"] is False
    me = client.get("/api/admin/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["permissions"] == ["rentals"]
    print("✓ verify-otp and /api/admin/me report the staff member's permissions")


# (permission, method, path) — every staff endpoint guarded by a permission.
GUARDED = [
    ("vehicles", "get", "/api/admin/vehicles"),
    ("vehicles", "post", "/api/admin/vehicles"),
    ("vehicles", "post", "/api/vehicles"),
    ("vehicles", "put", "/api/admin/vehicles/999999"),
    ("vehicles", "patch", "/api/admin/vehicles/999999/status"),
    ("vehicles", "delete", "/api/admin/vehicles/999999"),
    ("vehicles", "delete", "/api/vehicles/999999"),
    ("vehicles", "post", "/api/admin/upload-images"),
    ("appointments", "get", "/api/admin/appointments"),
    ("rentals", "get", "/api/admin/rentals"),
    ("rentals", "put", "/api/admin/rentals/999999/assign-driver"),
    ("rentals", "put", "/api/admin/rentals/999999/status"),
    ("rentals", "get", "/api/admin/drivers"),
    ("rentals", "post", "/api/admin/drivers"),
    ("rentals", "get", "/api/admin/drivers/999999"),
    ("rentals", "put", "/api/admin/drivers/999999"),
    ("rentals", "delete", "/api/admin/drivers/999999"),
]


def test_each_permission():
    holders = {p: _staff(_phone(), [p])[1] for p in models.STAFF_PERMISSIONS}
    _, nobody = _staff(_phone(), [])
    owner = _owner_headers()
    for perm, method, path in GUARDED:
        for other, headers in list(holders.items()) + [("none", nobody)]:
            r = getattr(client, method)(path, headers=headers)
            if other == perm:
                assert r.status_code != 403, f"{perm} holder got 403 on {method.upper()} {path}"
            else:
                assert r.status_code == 403, f"'{other}' staff on {method.upper()} {path}: {r.status_code} {r.text}"
        r = getattr(client, method)(path, headers=owner)
        assert r.status_code != 403, f"owner got 403 on {method.upper()} {path}"
        print(f"  ✓ {method.upper():6} {path:44} only '{perm}' (and owners) pass")

    # Reads return 200 for the holder.
    assert client.get("/api/admin/vehicles", headers=holders["vehicles"]).status_code == 200
    assert client.get("/api/admin/appointments", headers=holders["appointments"]).status_code == 200
    assert client.get("/api/admin/rentals", headers=holders["rentals"]).status_code == 200
    assert client.get("/api/admin/drivers", headers=holders["rentals"]).status_code == 200
    # Common endpoints stay open to every active staff member, even with no permissions.
    for path in ("/api/admin/me", "/api/admin/dealership"):
        assert client.get(path, headers=nobody).status_code == 200, path
    # Owner-only areas stay owner-only regardless of permissions.
    _, all_perms = _staff(_phone(), list(models.STAFF_PERMISSIONS))
    for path in ("/api/admin/lot-intakes", "/api/admin/handovers", "/api/superadmin/staff"):
        assert client.get(path, headers=all_perms).status_code == 403, path
    assert client.put("/api/admin/dealership", json={}, headers=all_perms).status_code == 403
    print("✓ each permission: 200 for holders and owners, 403 for everyone else; owner areas stay owner-only")


def test_deactivation_is_immediate():
    staff_id, headers = _staff(_phone(), ["vehicles"])
    assert client.get("/api/admin/vehicles", headers=headers).status_code == 200
    r = client.patch(f"/api/superadmin/staff/{staff_id}/status", json={"is_active": False}, headers=_owner_headers())
    assert r.status_code == 200 and r.json()["is_active"] is False, r.text
    r = client.get("/api/admin/vehicles", headers=headers)  # same, still unexpired token
    assert r.status_code == 401 and "deactivated" in r.json()["detail"].lower(), r.text
    assert client.get("/api/admin/me", headers=headers).status_code == 401
    print("✓ deactivated staff are blocked on their very next request (valid token, 401)")


def test_staff_crud_never_deletes():
    owner = _owner_headers()
    phone = _phone()
    r = client.post("/api/superadmin/staff", headers=owner,
                    json={"full_name": " Test Seller ", "phone_number": "0" + phone[3:], "permissions": ["vehicles", "rentals"]})
    assert r.status_code == 200, r.text
    staff = r.json()
    assert staff["phone_number"] == phone and staff["full_name"] == "Test Seller"
    assert staff["permissions"] == ["vehicles", "rentals"] and staff["is_active"] is True

    r = client.put(f"/api/superadmin/staff/{staff['id']}", headers=owner, json={"permissions": ["appointments"], "full_name": "Renamed"})
    assert r.status_code == 200 and r.json()["permissions"] == ["appointments"] and r.json()["full_name"] == "Renamed", r.text
    assert client.post("/api/superadmin/staff", headers=owner, json={"phone_number": phone, "permissions": ["bogus"]}).status_code == 400

    r = client.delete(f"/api/superadmin/staff/{staff['id']}", headers=owner)
    assert r.status_code == 200 and r.json()["is_active"] is False, r.text
    db = SessionLocal()
    try:
        assert db.query(models.User).filter(models.User.id == staff["id"]).first() is not None, "staff must never be hard-deleted"
        owner_id = db.query(models.User).filter(models.User.phone_number == OWNER).first().id
    finally:
        db.close()
    listed = {u["id"]: u for u in client.get("/api/superadmin/staff", headers=owner).json()}
    assert listed[staff["id"]]["is_active"] is False

    # Owners can't be edited, deactivated or re-added as staff.
    assert client.put(f"/api/superadmin/staff/{owner_id}", headers=owner, json={"is_active": False}).status_code == 400
    assert client.delete(f"/api/superadmin/staff/{owner_id}", headers=owner).status_code == 400
    assert client.post("/api/superadmin/staff", headers=owner, json={"phone_number": OWNER, "permissions": []}).status_code == 400
    # Staff can't manage staff.
    _, staff_headers = _staff(_phone(), list(models.STAFF_PERMISSIONS))
    assert client.post("/api/superadmin/staff", headers=staff_headers, json={"phone_number": _phone()}).status_code == 403
    print("✓ owner adds / edits / deactivates staff; rows are never deleted; owners are protected")


def test_delete_dealership_is_superadmin_only():
    db = SessionLocal()
    try:
        temp = models.Dealership(name="Temp Delete Test", slug=f"temp-del-{uuid.uuid4().hex[:6]}", is_active=True)
        db.add(temp)
        db.commit()
        temp_id = temp.id
    finally:
        db.close()
    # Staff of that very dealership (the old self-delete path) and of the primary dealership: 403.
    own_id, own_staff = _staff(_phone(), list(models.STAFF_PERMISSIONS))
    db = SessionLocal()
    try:
        db.query(models.User).filter(models.User.id == own_id).first().dealership_id = temp_id
        db.commit()
    finally:
        db.close()
    _, primary_staff = _staff(_phone(), list(models.STAFF_PERMISSIONS))
    for path in (f"/api/admin/dealerships/{temp_id}", f"/api/superadmin/dealerships/{temp_id}", "/api/admin/dealerships/1"):
        for headers in (own_staff, primary_staff):
            r = client.delete(path, headers=headers)
            assert r.status_code == 403, f"{path}: {r.status_code} {r.text}"
    r = client.delete(f"/api/superadmin/dealerships/{temp_id}", headers=_owner_headers())
    assert r.status_code == 200, r.text
    print("✓ DELETE dealership: 403 for all staff (incl. its own), 200 for the superadmin")


def test_migration_keeps_settings_name_and_backfills_permissions():
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).filter(models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG).first()
        original = d.name
        d.name = "Renamed In Settings"
        legacy = models.User(phone_number=_phone(), role="sales_agent", dealership_id=d.id, is_active=True)
        db.add(legacy)
        db.commit()
        legacy_id = legacy.id
    finally:
        db.close()

    run_migrations()
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).filter(models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG).first()
        assert d.name == "Renamed In Settings", d.name
        legacy = db.query(models.User).filter(models.User.id == legacy_id).first()
        # The three original sections; the newer "gate" permission is never granted implicitly.
        assert legacy.permissions == ["vehicles", "appointments", "rentals"] and legacy.is_active
        d.name = ""
        db.commit()
    finally:
        db.close()

    run_migrations()
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).filter(models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG).first()
        assert d.name == settings.PLATFORM_NAME, d.name
        d.name = original
        db.commit()
    finally:
        db.close()
    print("✓ migrate.py keeps a name set in Settings (fills only an empty one) and backfills old staff with all permissions")


if __name__ == "__main__":
    test_login_lock()
    test_full_login_returns_permissions()
    test_each_permission()
    test_deactivation_is_immediate()
    test_staff_crud_never_deletes()
    test_delete_dealership_is_superadmin_only()
    test_migration_keeps_settings_name_and_backfills_permissions()
    print("\n🎉 STAFF & PERMISSION TESTS PASSED")
