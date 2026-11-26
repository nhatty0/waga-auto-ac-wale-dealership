"""
1. Staff lockdown sweep: every Document Center, gate-pass issuing, lot-ops, settings and
   /api/superadmin/* route returns 403 to staff, even staff with every permission ticked.
   /api/gate/* (the guard desk) is 403 unless the staff member has the Gate permission.
   Routes are enumerated from the app, so a new endpoint can't slip past this test.
2. Appointments clean-up: status dropdown, archive/restore (Appointments permission),
   permanent delete (superadmin only, archived only).

Run (uses whatever DATABASE_URL points at; creates its own test users/appointments):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_appointments_cleanup.py
"""
import os
import re
import sys
import uuid

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import models
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones
from migrate import run_migrations

client = TestClient(app)
OWNER = superadmin_phones()[0]
ALL_BUT_GATE = ["vehicles", "appointments", "rentals"]
ALL = list(models.STAFF_PERMISSIONS)


def _phone():
    return f"25197{uuid.uuid4().int % 10**7:07d}"


def _headers(user_id, phone, role):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(user_id), "phone_number": phone, "role": role})}


def _staff(perms):
    phone = _phone()
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1,
                        full_name="Test Staff", is_active=True,
                        permissions_json=models.encode_permissions(perms))
        db.add(u)
        db.commit()
        db.refresh(u)
        return _headers(u.id, phone, u.role)
    finally:
        db.close()


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        assert u is not None, "migrate.py should have created the owner row"
        return _headers(u.id, OWNER, "superadmin")
    finally:
        db.close()


def _appointment(dealership_id=1, date="2099-01-01"):
    db = SessionLocal()
    try:
        a = models.Appointment(customer_name="Test Customer", phone_number="0911000000",
                               preferred_channel="Telegram", date=date, time_slot="10:00 AM",
                               dealership_id=dealership_id, status="Pending")
        db.add(a)
        db.commit()
        db.refresh(a)
        return a.id
    finally:
        db.close()


# ------------------------------------------------------------------ 1. lockdown sweep

OWNER_ONLY = re.compile(
    r"^/api/superadmin/"                       # documents, gate-pass send/cancel, staff, settings, stats
    r"|^/api/admin/(lot-intakes|gate-passes|handovers)"  # lot operations (paper documents)
)
# Settings writes live under /api/admin/dealership (GET stays open: staff need name/logo/phones).
SETTINGS_WRITES = {("PUT", "/api/admin/dealership"), ("POST", "/api/admin/dealership/disconnect-telegram")}
def _all_routes():
    """(METHOD, path) for every documented route (works with lazily included routers too)."""
    return [(m.upper(), path) for path, ops in app.openapi()["paths"].items()
            for m in ops if m.upper() in ("GET", "POST", "PUT", "PATCH", "DELETE")]


def _owner_only_routes():
    return [(m, p) for m, p in _all_routes() if OWNER_ONLY.search(p) or (m, p) in SETTINGS_WRITES]


def _gate_desk_routes():
    return [(m, p) for m, p in _all_routes() if p.startswith("/api/gate/")]


def _call(method, path, headers):
    url = re.sub(r"\{[^}]+\}", "1", path)
    r = client.request(method, url, headers=headers, json={} if method in ("POST", "PUT", "PATCH") else None)
    if r.status_code == 422:
        # `{}` failed body validation before the handler ran; an empty body reaches the guard.
        r = client.request(method, url, headers=headers)
    return r


def test_staff_locked_out_of_owner_routes():
    routes = _owner_only_routes()
    assert len(routes) > 30, f"route discovery looks broken: {routes}"
    for perms in (ALL_BUT_GATE, ALL, ["vehicles"]):
        h = _staff(perms)
        leaks = [(m, p, _call(m, p, h).status_code) for m, p in routes]
        leaks = [x for x in leaks if x[2] != 403]
        assert not leaks, f"staff {perms} reached owner-only routes: {leaks}"
    print(f"   {len(routes)} owner-only routes -> 403 for staff (vehicles-only, all-but-gate, all)")


def test_gate_desk_needs_gate_permission():
    routes = _gate_desk_routes()
    assert routes, "no /api/gate/ routes found"
    no_gate = _staff(ALL_BUT_GATE)
    for m, p in routes:
        assert _call(m, p, no_gate).status_code == 403, (m, p)
    with_gate = _staff(ALL)
    r = client.get("/api/gate/passes", headers=with_gate)
    assert r.status_code == 200, r.text
    print(f"   {len(routes)} /api/gate/ routes -> 403 without Gate, 200 with Gate")


def test_staff_dealership_read_hides_telegram_credentials():
    r = client.get("/api/admin/dealership", headers=_staff(ALL))
    assert r.status_code == 200, r.text
    assert r.json().get("telegram_bot_token") is None and r.json().get("telegram_chat_id") is None


# ------------------------------------------------------------------ 2. appointments

def test_appointments_need_permission():
    aid = _appointment()
    h = _staff(["vehicles", "rentals", "gate"])
    assert client.get("/api/admin/appointments", headers=h).status_code == 403
    assert client.patch(f"/api/admin/appointments/{aid}/status", json={"status": "Done"}, headers=h).status_code == 403
    assert client.post(f"/api/admin/appointments/{aid}/archive", headers=h).status_code == 403
    assert client.post(f"/api/admin/appointments/{aid}/restore", headers=h).status_code == 403
    assert client.delete(f"/api/admin/appointments/{aid}", headers=h).status_code == 403


def test_staff_status_archive_restore_but_no_hard_delete():
    aid = _appointment()
    h = _staff(["appointments"])

    r = client.patch(f"/api/admin/appointments/{aid}/status", json={"status": "Confirmed"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "Confirmed", r.text
    r = client.patch(f"/api/admin/appointments/{aid}/status", json={"status": "New"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "Pending", r.text  # New is stored as Pending
    for s in ("Done", "Cancelled", "No-show"):
        assert client.patch(f"/api/admin/appointments/{aid}/status", json={"status": s}, headers=h).json()["status"] == s
    assert client.patch(f"/api/admin/appointments/{aid}/status", json={"status": "Deleted"}, headers=h).status_code == 400

    r = client.post(f"/api/admin/appointments/{aid}/archive", headers=h)
    assert r.status_code == 200 and r.json()["archived_at"] and r.json()["archived_by"] == "Test Staff", r.text
    listed = {a["id"]: a for a in client.get("/api/admin/appointments", headers=h).json()}
    assert listed[aid]["archived_at"], "archived rows stay listed (the Archived filter shows them)"

    assert client.delete(f"/api/admin/appointments/{aid}", headers=h).status_code == 403
    assert client.delete(f"/api/admin/appointments/{aid}", headers=_staff(ALL)).status_code == 403

    r = client.post(f"/api/admin/appointments/{aid}/restore", headers=h)
    assert r.status_code == 200 and r.json()["archived_at"] is None, r.text


def test_owner_hard_delete_only_when_archived():
    aid = _appointment()
    owner = _owner()
    assert client.delete(f"/api/admin/appointments/{aid}", headers=owner).status_code == 409
    assert client.post(f"/api/admin/appointments/{aid}/archive", headers=owner).status_code == 200
    assert client.delete(f"/api/admin/appointments/{aid}", headers=owner).status_code == 204
    db = SessionLocal()
    try:
        assert db.query(models.Appointment).filter(models.Appointment.id == aid).first() is None
    finally:
        db.close()


def test_staff_cannot_touch_other_dealership():
    db = SessionLocal()
    try:
        other = models.Dealership(name="Other Lot", slug=f"other-{uuid.uuid4().hex[:8]}", is_active=True)
        db.add(other)
        db.commit()
        other_id = other.id
    finally:
        db.close()
    aid = _appointment(dealership_id=other_id)
    h = _staff(["appointments"])
    assert client.patch(f"/api/admin/appointments/{aid}/status", json={"status": "Done"}, headers=h).status_code == 404
    assert client.post(f"/api/admin/appointments/{aid}/archive", headers=h).status_code == 404


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
            print(f"FAIL {t.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
