"""
Company stamp: superadmin-only image endpoint, never under a static mount, and the
stamped / stamped_by record on final documents (drafts refused).

Run (uses whatever DATABASE_URL points at; use a copy of the DB):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_stamp.py
"""
import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from starlette.routing import Mount

import models
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones
from routers.stamp import PRIVATE_DIR, STAMP_PATH

client = TestClient(app)
OWNER = superadmin_phones()[0]
BASE = "/api/superadmin/documents"
TYPES = ("intake", "gatepass", "handover", "downpayment", "rental")


def _token(u: models.User) -> dict:
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": u.phone_number, "role": u.role})}


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        assert u is not None, "migrate.py should have created the owner row"
        return _token(u)
    finally:
        db.close()


def _staff(role="dealer_admin"):
    phone = f"25197{uuid.uuid4().int % 10**7:07d}"
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role=role, dealership_id=1, is_active=True,
                        permissions_json=models.encode_permissions(models.STAFF_PERMISSIONS))
        db.add(u)
        db.commit()
        db.refresh(u)
        return _token(u)
    finally:
        db.close()


def _plate():
    return f"3-S{uuid.uuid4().int % 10**5:05d} AA"


def test_stamp_endpoint_superadmin_only():
    assert STAMP_PATH.is_file(), f"stamp image missing at {STAMP_PATH}"
    r = client.get("/api/superadmin/stamp", headers=_owner())
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert "no-store" in r.headers.get("cache-control", "")
    assert len(r.content) < 600_000, "served stamp should be the resized copy"

    # Staff (even with every staff permission, and a fake 'superadmin' role on an unlisted phone)
    # and anonymous callers never get the image.
    for h in (_staff(), _staff("superadmin")):
        r = client.get("/api/superadmin/stamp", headers=h)
        assert r.status_code == 403, (r.status_code, r.text[:80])
        assert not r.content.startswith(b"\x89PNG")
    r = client.get("/api/superadmin/stamp")
    assert r.status_code in (401, 403) and not r.content.startswith(b"\x89PNG")
    print("✓ GET /api/superadmin/stamp: PNG for the owner, 403 for staff, 401/403 anonymous")


def test_private_dir_not_statically_served():
    private = PRIVATE_DIR.resolve()
    for route in app.routes:
        if isinstance(route, Mount) and hasattr(route.app, "directory") and route.app.directory:
            d = Path(route.app.directory).resolve()
            # The mount must not be the private folder, inside it, or a parent of it.
            assert d != private and private not in d.parents and d not in private.parents, \
                f"{route.path} serves {d}, which exposes {private}"
    for url in ("/static/../private/ac-wale-stamp.png", "/static/%2e%2e/private/ac-wale-stamp.png",
                "/uploads/../private/ac-wale-stamp.png", "/private/ac-wale-stamp.png",
                "/static/ac-wale-stamp.png", "/ac-wale-stamp.png"):
        r = client.get(url)
        assert not (r.status_code == 200 and r.content.startswith(b"\x89PNG")), f"{url} served the stamp"
    print("✓ backend/private is not under any static mount; traversal URLs don't return the stamp")


def _create(h, t, status, plate):
    data = {
        "intake": {"vehicle_name": "Stamp Test", "plate_number": plate, "owner_name": "O", "owner_phone": "0911"},
        "gatepass": {"plate_number": plate, "driver_name": "D", "release_reason": "Test", "vehicle_name": "Stamp Test"},
        "handover": {"owner_full_name": "O", "owner_phone": "0911", "vehicle_type": "Stamp Test", "plate_number": plate},
        "downpayment": {"buyer_name": "B", "plate_number": plate, "amount": 1000},
        "rental": {"renter_name": "R", "plate_number": plate, "pickup_date": "2026-11-27"},
    }[t]
    r = client.post(f"{BASE}/{t}", headers=h, json={"status": status, "data": data})
    assert r.status_code == 201, r.text
    return r.json()


def test_mark_stamped_final_only():
    h = _owner()
    for t in TYPES:
        final = _create(h, t, "final", _plate())
        assert final["stamped"] is False and final["stamped_by"] is None
        r = client.post(f"{BASE}/{t}/{final['id']}/stamped", headers=h)
        assert r.status_code == 200, (t, r.text)
        body = r.json()
        assert body["stamped"] is True and body["stamped_by"] and body["stamped_at"], (t, body)
        again = client.get(f"{BASE}/{t}/{final['id']}", headers=h).json()
        assert again["stamped"] is True and again["stamped_by"] == body["stamped_by"]

        draft = _create(h, t, "draft", _plate())
        r = client.post(f"{BASE}/{t}/{draft['id']}/stamped", headers=h)
        assert r.status_code == 409, (t, r.status_code, r.text)
        assert client.get(f"{BASE}/{t}/{draft['id']}", headers=h).json()["stamped"] is False

        client.post(f"{BASE}/{t}/{final['id']}/archive", headers=h)
        assert client.post(f"{BASE}/{t}/{final['id']}/stamped", headers=h).status_code == 409

        r = client.post(f"{BASE}/{t}/{final['id']}/stamped", headers=_staff())
        assert r.status_code == 403
    print("✓ stamped=true + stamped_by recorded on final documents of all 5 types; drafts/archived refused; staff 403")


if __name__ == "__main__":
    test_stamp_endpoint_superadmin_only()
    test_private_dir_not_statically_served()
    test_mark_stamped_final_only()
    print("\nAll stamp tests passed.")
