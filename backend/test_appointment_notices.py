"""
New appointment -> Telegram notice to every owner chat (and to linked members with Appointments
when the team alert is on); new Team members start without Appointments; owners set their own
display name (permissions untouchable). Telegram is never called (recorders).

Run: SUPERADMIN_PHONE="251900061300,251918032065" python test_appointment_notices.py
"""
import os
import sys
import time
import uuid
from unittest import mock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import appointments
import gate_pass
import models
import telegram
import tg_config
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones
from migrate import run_migrations

client = TestClient(app)
OWNER = superadmin_phones()[0]


def _chat():
    return str(7_100_000_000 + uuid.uuid4().int % 10**9)


def _phone():
    return f"25197{uuid.uuid4().int % 10**7:07d}"


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        if not u.telegram_chat_id:
            u.telegram_chat_id = _chat()
            db.commit()
        return u.id, u.telegram_chat_id, {"Authorization": "Bearer " + create_access_token(
            {"sub": str(u.id), "phone_number": OWNER, "role": "superadmin"})}
    finally:
        db.close()


def _member(perms, linked=True):
    phone = _phone()
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1, full_name="M", is_active=True,
                        permissions_json=models.encode_permissions(perms), telegram_chat_id=_chat() if linked else None)
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id, u.telegram_chat_id, {"Authorization": "Bearer " + create_access_token(
            {"sub": str(u.id), "phone_number": phone, "role": "dealer_admin"})}
    finally:
        db.close()


def _set_dealer_chat(chat):
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).order_by(models.Dealership.id).first()
        old = d.telegram_chat_id
        d.telegram_chat_id = chat
        db.commit()
        return old
    finally:
        db.close()


def _book(name="Abebe `Kebede` [VIP]", notes="call *after* 5"):
    return client.post("/api/public/appointments", json={
        "customer_name": name, "phone_number": "0911223344", "preferred_channel": "Telegram",
        "appointment_type": "In-Person Test Drive", "date": "2099-01-05", "time_slot": "10:00 AM",
        "notes": notes, "dealership_id": 1})


def test_new_appointment_reaches_owner_chats_and_team():
    _, owner_chat, owner = _owner()
    _, appt_chat, _ = _member(["appointments"])
    _, rent_chat, _ = _member(["rentals"])
    dealer_chat = _chat()
    old = _set_dealer_chat(dealer_chat)
    leads, team = [], []

    async def fake_lead(bot_token, chat_id, booking, vehicle_title=None, vehicle_price=0.0, dealer_name=None):
        text, _ = telegram.format_booking_lead_caption(booking, vehicle_title, vehicle_price, dealer_name)
        leads.append((chat_id, text))
        return True, "ok"

    def fake_tg(method, payload):
        if method == "sendMessage":
            team.append(str(payload["chat_id"]))
            return {"message_id": 1}
        return {}

    try:
        with mock.patch.object(appointments, "send_telegram_lead", fake_lead), \
             mock.patch.object(tg_config, "token", lambda db=None: "123:TEST"), \
             mock.patch.object(gate_pass, "tg", fake_tg), \
             mock.patch.object(gate_pass, "bot_token", lambda: "123:TEST"):
            client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": True})
            r = _book()
            assert r.status_code == 201, r.text
            chats = {c for c, _ in leads}
            # The dealership chat AND the owner's own linked chat both get the lead.
            assert dealer_chat in chats and owner_chat in chats, chats
            text = leads[0][1]
            assert "`Kebede`" not in text and "[VIP]" not in text and "*after*" not in text
            # Team alert runs in the background: members with Appointments only.
            for _ in range(30):
                if appt_chat in team:
                    break
                time.sleep(0.1)
            assert appt_chat in team and rent_chat not in team and owner_chat not in team

            # Toggle off -> owners still told, members not.
            client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": False})
            leads.clear(); team.clear()
            assert _book(name="Second Lead", notes="").status_code == 201
            time.sleep(1.0)
            assert {c for c, _ in leads} >= {dealer_chat, owner_chat}
            assert appt_chat not in team
    finally:
        client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": True})
        _set_dealer_chat(old)


def test_new_member_starts_without_appointments_and_existing_unchanged():
    _, _, owner = _owner()
    r = client.post("/api/superadmin/staff", headers=owner, json={"full_name": "New Hire", "phone_number": "0" + _phone()[3:],
                                                                  "field_roles": ["driver"]})
    assert r.status_code == 200, r.text
    assert "appointments" not in r.json()["web_permissions"] and r.json()["web_permissions"] == []
    db = SessionLocal()
    try:
        raw = db.get(models.User, r.json()["id"]).permissions_json
        assert raw == "[]", raw  # explicit, so the legacy NULL backfill never applies
    finally:
        db.close()
    # An existing member keeps exactly what they had across a restart (migrations).
    mid, _, _ = _member(["vehicles", "appointments"])
    run_migrations()
    db = SessionLocal()
    try:
        assert db.get(models.User, mid).web_permissions == ["vehicles", "appointments"]
    finally:
        db.close()


def test_owner_sets_own_display_name():
    owner_id, _, owner = _owner()
    r = client.put("/api/superadmin/me", headers=owner, json={"full_name": "  Ato Wale  "})
    assert r.status_code == 200 and r.json()["full_name"] == "Ato Wale" and r.json()["is_superadmin"] is True
    listed = {u["id"]: u for u in client.get("/api/superadmin/staff", headers=owner).json()}
    assert listed[owner_id]["full_name"] == "Ato Wale"
    assert client.put("/api/superadmin/me", headers=owner, json={"full_name": "   "}).status_code == 400
    # Permissions stay out of reach through the staff endpoints.
    assert client.put(f"/api/superadmin/staff/{owner_id}", headers=owner, json={"permissions": []}).status_code == 400
    _, _, staff = _member(["vehicles", "appointments", "rentals"])
    assert client.put("/api/superadmin/me", headers=staff, json={"full_name": "Hacker"}).status_code == 403


if __name__ == "__main__":
    run_migrations()
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as ex:
            failed += 1
            import traceback
            print(f"FAIL {t.__name__}: {ex!r}")
            traceback.print_exc(limit=3)
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
