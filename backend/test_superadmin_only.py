"""
Owner-only (superadmin) lockdown for lot management, documents and dealership settings,
plus the comma-separated SUPERADMIN_PHONE list and startup promote/demote.

Run (uses whatever DATABASE_URL points at; tests create and archive their own records):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_superadmin_only.py
"""
import io
import os
import sys
from unittest import mock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from main import app
from database import SessionLocal
import models
from auth import create_access_token
from settings import settings, is_superadmin_phone, normalize_phone_digits, parse_phone_list
from migrate import run_migrations

OWNER_A = "251900061300"
OWNER_B = "251918032065"
STAFF = "251977000111"
RETIRED_OWNER = "251911646628"


def _user(db, phone, role, dealership_id):
    u = db.query(models.User).filter(models.User.phone_number == phone).first()
    if not u:
        u = models.User(phone_number=phone, role=role, dealership_id=dealership_id, is_active=True)
        db.add(u)
    u.role = role
    u.is_active = True
    u.dealership_id = dealership_id
    # Staff here hold every staff permission, so a 403 can only come from the owner-only rule.
    u.permissions_json = models.encode_permissions(models.STAFF_PERMISSIONS)
    db.commit()
    db.refresh(u)
    return u


def _auth(u):
    token = create_access_token({"sub": str(u.id), "phone_number": u.phone_number, "role": u.role})
    return {"Authorization": f"Bearer {token}"}


def _png():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 150, 0)).save(buf, format="PNG")
    return buf.getvalue()


def test_phone_helpers():
    assert normalize_phone_digits("+251 918 032 065") == OWNER_B
    assert normalize_phone_digits("0918032065") == OWNER_B
    assert normalize_phone_digits("918032065") == OWNER_B
    assert normalize_phone_digits("+2510918032065") == OWNER_B
    assert parse_phone_list(" 251900061300 , +251 918 032 065,0900061300 ") == [OWNER_A, OWNER_B]
    assert settings.SUPERADMIN_PHONE  # set above
    assert is_superadmin_phone("0900061300") and is_superadmin_phone("+251918032065")
    assert not is_superadmin_phone(RETIRED_OWNER)
    assert not is_superadmin_phone("") and not is_superadmin_phone(None)
    print("✓ phone helpers normalize and match the comma-separated SUPERADMIN_PHONE list")


def test_startup_promotes_listed_and_demotes_others():
    db = SessionLocal()
    try:
        dealer_id = db.query(models.Dealership).order_by(models.Dealership.id).first().id
        _user(db, RETIRED_OWNER, "superadmin", dealer_id)
        stray = db.query(models.User).filter(models.User.phone_number == OWNER_B).first()
        if stray:
            stray.role = "dealer_admin"
            db.commit()
    finally:
        db.close()

    run_migrations()

    db = SessionLocal()
    try:
        retired = db.query(models.User).filter(models.User.phone_number == RETIRED_OWNER).first()
        assert retired is not None, "demotion must never delete a user"
        assert retired.role == "dealer_admin", retired.role
        for phone in (OWNER_A, OWNER_B):
            owner = db.query(models.User).filter(models.User.phone_number == phone).first()
            assert owner is not None and owner.role == "superadmin", (phone, owner and owner.role)
        assert all(
            is_superadmin_phone(u.phone_number)
            for u in db.query(models.User).filter(models.User.role == "superadmin").all()
        ), "only listed phones may keep role superadmin"
    finally:
        db.close()
    print("✓ startup: listed phones are superadmin, 251911646628 demoted to dealer_admin (not deleted)")


def test_owner_only_endpoints():
    client = TestClient(app)
    db = SessionLocal()
    try:
        dealer = db.query(models.Dealership).order_by(models.Dealership.id).first()
        owner = _user(db, OWNER_A, "superadmin", dealer.id)
        staff = _user(db, STAFF, "dealer_admin", dealer.id)
        # role 'superadmin' with an unlisted phone is still staff
        imposter = _user(db, "251977000222", "superadmin", dealer.id)
        saved_bot = (dealer.telegram_bot_token, dealer.telegram_chat_id, dealer.telegram_bot_username)
        saved_brand = (dealer.name, dealer.phone_number, dealer.phone_number_2, dealer.logo_url)
        dealer_id = dealer.id
        H_OWNER, H_STAFF, H_IMPOSTER = _auth(owner), _auth(staff), _auth(imposter)
    finally:
        db.close()

    intake_body = {
        "vehicle_name": "Toyota Vitz (lockdown test)",
        "year_of_production": 2019,
        "plate_number": "2-A99999 AA",
        "owner_name": "Test Owner",
        "owner_phone": "0911000000",
        "received_by_name": "Test",
        "publish_to_showroom": False,
    }
    handover_body = {
        "owner_full_name": "Test Owner",
        "owner_phone": "0911000000",
        "vehicle_type": "Toyota Vitz",
        "plate_number": "2-A99999 AA",
    }
    gate_body = {"driver_name": "Test Driver", "release_reason": "Sold", "authorized_by": "Test"}

    # Owner creates the records the per-record checks run against.
    r = client.post("/api/admin/lot-intakes", json=intake_body, headers=H_OWNER)
    assert r.status_code == 201, r.text
    intake_id = r.json()["id"]
    r = client.post("/api/admin/handovers", json=handover_body, headers=H_OWNER)
    assert r.status_code == 201, r.text
    handover_id = r.json()["id"]

    # (method, path, kwargs, expected owner status)
    cases = [
        ("get", "/api/admin/lot-intakes", {}, 200),
        ("get", "/api/admin/lot-intakes?include_archived=true", {}, 200),
        ("get", f"/api/admin/lot-intakes/{intake_id}", {}, 200),
        ("post", "/api/admin/lot-intakes", {"json": intake_body}, 201),
        ("get", "/api/admin/gate-passes", {}, 200),
        ("post", f"/api/admin/lot-intakes/{intake_id}/gate-pass", {"json": gate_body}, 201),
        ("get", "/api/admin/handovers", {}, 200),
        ("get", "/api/admin/handovers?include_archived=true", {}, 200),
        ("get", f"/api/admin/handovers/{handover_id}", {}, 200),
        ("post", "/api/admin/handovers", {"json": handover_body}, 201),
        ("delete", f"/api/admin/lot-intakes/{intake_id}", {}, 204),
        ("post", f"/api/admin/lot-intakes/{intake_id}/restore", {}, 200),
        ("delete", f"/api/admin/handovers/{handover_id}", {}, 204),
        ("post", f"/api/admin/handovers/{handover_id}/restore", {}, 200),
        ("put", "/api/admin/dealership", {"json": {"name": saved_brand[0]}}, 200),
        ("post", "/api/admin/dealership/logo", {"files": {"file": ("l.png", _png(), "image/png")}}, 200),
        ("post", "/api/admin/dealership/test-telegram",
         {"json": {"telegram_bot_token": "123:abc", "telegram_chat_id": "42"}}, 200),
        ("post", "/api/admin/telegram/test",
         {"json": {"telegram_bot_token": "123:abc", "telegram_chat_id": "42"}}, 200),
        ("post", "/api/admin/dealership/disconnect-telegram", {}, 200),
        ("get", "/api/superadmin/stats", {}, 200),
        ("get", "/api/superadmin/executive-stats", {}, 200),
    ]

    async def fake_post(self, url, *a, **kw):
        return httpx.Response(200, json={"ok": True}, request=httpx.Request("POST", url))

    with mock.patch.object(httpx.AsyncClient, "post", fake_post):
        for method, path, kwargs, owner_status in cases:
            for label, headers in (("dealer_admin", H_STAFF), ("role-only imposter", H_IMPOSTER)):
                res = getattr(client, method)(path, headers=headers, **kwargs)
                assert res.status_code == 403, f"{label} {method.upper()} {path}: {res.status_code} {res.text}"
            res = getattr(client, method)(path, headers=H_OWNER, **kwargs)
            assert res.status_code == owner_status, f"superadmin {method.upper()} {path}: {res.status_code} {res.text}"
            print(f"  ✓ {method.upper():6} {path:58} staff 403 · superadmin {owner_status}")

    # Clean up: archive the test records, restore the dealership's branding and Telegram setup.
    for rec in client.get("/api/admin/lot-intakes", headers=H_OWNER).json():
        if rec["vehicle_name"] == intake_body["vehicle_name"]:
            client.delete(f"/api/admin/lot-intakes/{rec['id']}", headers=H_OWNER)
    for rec in client.get("/api/admin/handovers", headers=H_OWNER).json():
        if rec["owner_full_name"] == handover_body["owner_full_name"] and rec["vehicle_type"] == "Toyota Vitz":
            client.delete(f"/api/admin/handovers/{rec['id']}", headers=H_OWNER)
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).filter(models.Dealership.id == dealer_id).first()
        d.telegram_bot_token, d.telegram_chat_id, d.telegram_bot_username = saved_bot
        d.name, d.phone_number, d.phone_number_2, d.logo_url = saved_brand
        db.commit()
    finally:
        db.close()
    print("✓ every moved endpoint: dealer_admin 403, role-only imposter 403, superadmin 2xx")


def test_staff_keep_their_desk_and_never_see_secrets():
    client = TestClient(app)
    db = SessionLocal()
    try:
        dealer = db.query(models.Dealership).order_by(models.Dealership.id).first()
        staff = _user(db, STAFF, "dealer_admin", dealer.id)
        owner = _user(db, OWNER_B, "superadmin", dealer.id)
        saved = (dealer.telegram_bot_token, dealer.telegram_chat_id)
        dealer.telegram_bot_token, dealer.telegram_chat_id = "999:secret-token", "-100123"
        H_STAFF, H_OWNER = _auth(staff), _auth(owner)
        db.commit()
    finally:
        db.close()

    try:
        for path in ("/api/admin/vehicles", "/api/admin/appointments", "/api/admin/rentals",
                     "/api/admin/drivers", "/api/admin/me", "/api/admin/dealership"):
            res = client.get(path, headers=H_STAFF)
            assert res.status_code == 200, f"staff lost {path}: {res.status_code} {res.text}"

        staff_dealer = client.get("/api/admin/dealership", headers=H_STAFF).json()
        assert staff_dealer["telegram_bot_token"] is None and staff_dealer["telegram_chat_id"] is None
        assert "phone_number_2" in staff_dealer
        me = client.get("/api/admin/me", headers=H_STAFF).json()
        assert me["is_superadmin"] is False
        assert "telegram_bot_token" not in (me.get("dealership") or {})

        owner_dealer = client.get("/api/admin/dealership", headers=H_OWNER).json()
        assert owner_dealer["telegram_bot_token"] == "999:secret-token"
        assert client.get("/api/admin/me", headers=H_OWNER).json()["is_superadmin"] is True

        public = client.get(f"/api/public/dealerships/{staff_dealer['slug']}").json()
        assert "telegram_bot_token" not in public and "phone_number_2" in public
    finally:
        db = SessionLocal()
        try:
            d = db.query(models.Dealership).order_by(models.Dealership.id).first()
            d.telegram_bot_token, d.telegram_chat_id = saved
            db.commit()
        finally:
            db.close()
    print("✓ staff keep vehicles/appointments/rentals/drivers; Telegram secrets reach the owner only")


if __name__ == "__main__":
    test_phone_helpers()
    test_startup_promotes_listed_and_demotes_others()
    test_owner_only_endpoints()
    test_staff_keep_their_desk_and_never_see_secrets()
    print("\n🎉 SUPERADMIN-ONLY LOCKDOWN TESTS PASSED")
