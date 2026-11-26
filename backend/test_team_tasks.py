"""
Team (web permissions + field roles), login lock, Team-member drivers on rentals, Tasks with
Telegram buttons (callback auth), gate pass recipients, team alerts and the Telegram config.

Telegram is never called: gate_pass.tg is replaced by a recorder.
Run (uses whatever DATABASE_URL points at; creates its own rows):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_team_tasks.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta
from unittest import mock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import auth
import gate_pass
import models
import tasks
import team_alerts
import tg_config
from main import app
from database import SessionLocal
from auth import create_access_token, rate_limiter
from settings import superadmin_phones
from migrate import run_migrations

client = TestClient(app)
OWNER = superadmin_phones()[0]


class Recorder:
    """Stands in for gate_pass.tg: records calls, answers like Telegram."""
    def __init__(self):
        self.calls = []
        self.n = 1000

    def __call__(self, method, payload):
        self.calls.append((method, payload))
        if method == "sendMessage":
            self.n += 1
            return {"message_id": self.n}
        return {}

    def sent_to(self, chat):
        return [p for m, p in self.calls if m == "sendMessage" and str(p.get("chat_id")) == str(chat)]

    def of(self, method):
        return [p for m, p in self.calls if m == method]


def _phone():
    return f"25197{uuid.uuid4().int % 10**7:07d}"


def _chat():
    return str(7_000_000_000 + uuid.uuid4().int % 10**9)


def _user(perms=(), roles=(), linked=True, active=True, name=None):
    phone = _phone()
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1, full_name=name or f"T {phone[-4:]}",
                        is_active=active, permissions_json=models.encode_permissions(perms),
                        field_roles_json=models.encode_field_roles(roles),
                        telegram_chat_id=_chat() if linked else None)
        db.add(u)
        db.commit()
        db.refresh(u)
        h = {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": phone, "role": u.role})}
        return u.id, phone, u.telegram_chat_id, h
    finally:
        db.close()


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


def _task(db_id):
    db = SessionLocal()
    try:
        t = db.query(models.Task).filter(models.Task.id == db_id).first()
        return t.status, t.problem_note, [(ev.action, ev.status, ev.actor) for ev in t.events]
    finally:
        db.close()


def _cq(chat, data):
    return {"callback_query": {"id": uuid.uuid4().hex, "from": {"id": int(chat)}, "data": data}}


def _with_tg():
    rec = Recorder()
    return rec, mock.patch.object(gate_pass, "tg", rec), mock.patch.object(gate_pass, "bot_token", lambda: "TEST")


# ------------------------------------------------------------------ login lock

def test_login_lock_field_only():
    sent = []

    async def fake_sms(phone, code):
        sent.append(phone)
        return True

    with mock.patch.object(auth, "send_otp_sms", fake_sms):
        for roles in (["driver"], ["gatekeeper"], ["driver", "gatekeeper"], []):
            _, phone, _, h = _user(roles=roles)
            rate_limiter.reset_for_phone(phone)
            r = client.post("/api/auth/request-otp", json={"phone_number": "0" + phone[3:]})
            assert r.status_code == 403, (roles, r.text)
            assert "no website access" in r.json()["detail"], r.text
            # An existing session stops working too.
            assert client.get("/api/admin/me", headers=h).status_code == 401
        assert sent == []
        # One web permission is enough, with or without field roles.
        _, phone, _, h = _user(perms=["rentals"], roles=["driver"])
        rate_limiter.reset_for_phone(phone)
        r = client.post("/api/auth/request-otp", json={"phone_number": "0" + phone[3:]})
        assert r.status_code == 200, r.text
        assert client.get("/api/admin/me", headers=h).status_code == 200


def test_team_api_roles_and_legacy_gate():
    _, _, owner = _owner()
    r = client.post("/api/superadmin/staff", headers=owner, json={
        "full_name": "Driver Only", "phone_number": "0" + _phone()[3:], "permissions": [], "field_roles": ["driver"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["field_roles"] == ["driver"] and body["web_permissions"] == [] and body["can_use_website"] is False
    uid = body["id"]
    # Legacy "gate" permission is stored as the Gatekeeper role.
    r = client.put(f"/api/superadmin/staff/{uid}", headers=owner, json={"permissions": ["vehicles", "gate"]})
    assert r.status_code == 200, r.text
    assert set(r.json()["field_roles"]) == {"driver", "gatekeeper"}
    assert r.json()["web_permissions"] == ["vehicles"] and "gate" in r.json()["permissions"]
    r = client.put(f"/api/superadmin/staff/{uid}", headers=owner, json={"field_roles": ["pilot"]})
    assert r.status_code == 400
    # A pre-existing row with "gate" in permissions counts as Gatekeeper.
    db = SessionLocal()
    try:
        u = models.User(phone_number=_phone(), permissions_json='["gate"]', is_active=True)
        assert u.has_role("gatekeeper") and u.has_permission("gate") and not u.can_use_website
    finally:
        db.close()


# ------------------------------------------------------------------ gate pass recipients

def test_gate_pass_goes_to_linked_active_gatekeepers():
    g_id, _, g_chat, _ = _user(roles=["gatekeeper"])
    _user(roles=["gatekeeper"], linked=False)
    _, _, off_chat, _ = _user(roles=["gatekeeper"], active=False)
    _, _, drv_chat, _ = _user(roles=["driver"])
    db = SessionLocal()
    try:
        chats = {u.telegram_chat_id for u in gate_pass.gate_recipients(db)}
        assert g_chat in chats and off_chat not in chats and drv_chat not in chats
        # Field-only gatekeeper may still press the Telegram buttons.
        assert gate_pass.actor_for_chat(db, g_chat)
        assert gate_pass.actor_for_chat(db, drv_chat) is None
    finally:
        db.close()


# ------------------------------------------------------------------ rentals

def _booking(**kw):
    db = SessionLocal()
    try:
        v = db.query(models.Vehicle).first()
        b = models.RentalBooking(vehicle_id=v.id, customer_name="Rent Customer", customer_phone="0911000001",
                                 start_date=datetime.utcnow() + timedelta(days=1), end_date=datetime.utcnow() + timedelta(days=3),
                                 total_days=2, total_price=5000.0, delivery_type="doorstep_delivery",
                                 delivery_address="Bole, near Edna Mall", status="pending", dealership_id=1, **kw)
        db.add(b)
        db.commit()
        return b.id, v.id
    finally:
        db.close()


def test_existing_rentals_still_load():
    db = SessionLocal()
    try:
        legacy = models.Driver(full_name="Legacy Driver", phone_number="0911999000", is_active=True, dealership_id=1)
        db.add(legacy)
        db.commit()
        legacy_id = legacy.id
    finally:
        db.close()
    old_id, _ = _booking(assigned_driver_id=legacy_id)
    plain_id, _ = _booking()
    _, _, _, staff = _user(perms=["rentals"])
    r = client.get("/api/admin/rentals", headers=staff)
    assert r.status_code == 200, r.text
    rows = {b["id"]: b for b in r.json()}
    assert rows[old_id]["assigned_person"]["full_name"] == "Legacy Driver"
    assert rows[old_id]["assigned_person"]["source"] == "legacy"
    assert rows[old_id]["assigned_driver"]["id"] == legacy_id
    assert rows[plain_id]["assigned_person"] is None


def test_assign_rental_to_team_driver():
    bid, _ = _booking()
    d_id, _, _, _ = _user(roles=["driver"], name="Team Driver")
    n_id, _, _, _ = _user(perms=["vehicles"])
    _, _, _, staff = _user(perms=["rentals"])
    drivers = client.get("/api/admin/team/drivers", headers=staff).json()
    assert any(d["id"] == d_id for d in drivers) and not any(d["id"] == n_id for d in drivers)
    assert client.put(f"/api/admin/rentals/{bid}/assign-driver", json={"driver_id": 1}, headers=staff).status_code == 400
    assert client.put(f"/api/admin/rentals/{bid}/assign-driver", json={"user_id": n_id}, headers=staff).status_code == 400
    r = client.put(f"/api/admin/rentals/{bid}/assign-driver", json={"user_id": d_id}, headers=staff)
    assert r.status_code == 200, r.text
    assert r.json()["assigned_user_id"] == d_id and r.json()["status"] == "driver_assigned"
    assert r.json()["assigned_person"] == {"id": d_id, "full_name": "Team Driver", "phone_number": r.json()["assigned_person"]["phone_number"],
                                           "telegram_linked": True, "source": "team"}


# ------------------------------------------------------------------ tasks

def test_tasks_are_superadmin_only():
    _, _, _, staff = _user(perms=["vehicles", "appointments", "rentals"], roles=["driver", "gatekeeper"])
    for m, p in (("get", "/api/superadmin/tasks"), ("post", "/api/superadmin/tasks"), ("put", "/api/superadmin/tasks/1"),
                 ("post", "/api/superadmin/tasks/1/send"), ("post", "/api/superadmin/tasks/1/cancel"),
                 ("post", "/api/superadmin/tasks/1/status"), ("get", "/api/superadmin/telegram/status"),
                 ("post", "/api/superadmin/telegram/set-webhook"), ("put", "/api/superadmin/telegram/alerts")):
        r = client.request(m.upper(), p, headers=staff, json={})
        assert r.status_code == 403, (m, p, r.status_code)


def test_task_sent_and_callback_auth():
    rec, p1, p2 = _with_tg()
    with p1, p2:
        d_id, _, d_chat, _ = _user(roles=["driver"], name="Abel Driver")
        _, _, stranger_chat, _ = _user(roles=["driver"])
        owner_id, owner_chat, owner = _owner()
        r = client.post("/api/superadmin/tasks", headers=owner, json={
            "task_type": "move_car", "assigned_user_id": d_id, "scheduled_at": "2026-12-01T09:30",
            "location": "Lot B", "notes": "Park next to the gate"})
        assert r.status_code == 201, r.text
        t = r.json()
        assert t["telegram"]["sent"] is True and t["scheduled_label"] == "01/12/2026 09:30"
        msg = rec.sent_to(d_chat)[-1]
        assert "መኪና ማዛወር / Move car" in msg["text"] and "Lot B" in msg["text"]
        datas = [b["callback_data"] for row in msg["reply_markup"]["inline_keyboard"] for b in row]
        assert f"tk:acc:{t['id']}" in datas and f"tk:prob:{t['id']}" in datas

        # Someone else's chat: refused, nothing changes.
        gate_pass.process_update(SessionLocal(), _cq(stranger_chat, f"tk:acc:{t['id']}"))
        assert _task(t["id"])[0] == "new"
        assert any(a.get("show_alert") for a in rec.of("answerCallbackQuery"))

        # Assigned person: Accept -> message edited, owner told.
        before = len(rec.sent_to(owner_chat))
        gate_pass.process_update(SessionLocal(), _cq(d_chat, f"tk:acc:{t['id']}"))
        status, _, events = _task(t["id"])
        assert status == "accepted" and ("status", "accepted", "Abel Driver") in events
        assert rec.of("editMessageText") and len(rec.sent_to(owner_chat)) == before + 1

        # Problem asks for a reply; the reply is stored and reaches the owner.
        gate_pass.process_update(SessionLocal(), _cq(d_chat, f"tk:prob:{t['id']}"))
        prompt = rec.sent_to(d_chat)[-1]
        assert f"(task #{t['id']})" in prompt["text"] and prompt["reply_markup"] == {"force_reply": True}
        # A reply from another chat is ignored.
        gate_pass.process_update(SessionLocal(), {"message": {"chat": {"id": int(stranger_chat)}, "text": "fake",
                                                              "reply_to_message": {"text": prompt["text"]}}})
        assert _task(t["id"])[1] is None
        gate_pass.process_update(SessionLocal(), {"message": {"chat": {"id": int(d_chat)}, "text": "Flat tyre",
                                                              "reply_to_message": {"text": prompt["text"]}}})
        status, note, _ = _task(t["id"])
        assert status == "problem" and note == "Flat tyre"
        assert "Flat tyre" in rec.sent_to(owner_chat)[-1]["text"]

        # Superadmin's chat may override.
        gate_pass.process_update(SessionLocal(), _cq(owner_chat, f"tk:done:{t['id']}"))
        status, _, events = _task(t["id"])
        assert status == "done" and events[-1][2].endswith("(owner)")
        # Done is final.
        gate_pass.process_update(SessionLocal(), _cq(d_chat, f"tk:st:{t['id']}"))
        assert _task(t["id"])[0] == "done"


def test_unlinked_person_gets_copy_text():
    rec, p1, p2 = _with_tg()
    with p1, p2:
        d_id, _, _, _ = _user(roles=["driver"], linked=False, name="Offline Driver")
        _, _, owner = _owner()
        r = client.post("/api/superadmin/tasks", headers=owner, json={"task_type": "inspection", "assigned_user_id": d_id,
                                                                      "notes": "Check tyres"})
        assert r.status_code == 201
        t = r.json()
        assert t["telegram"]["sent"] is False and "not linked" in t["telegram"]["reason"]
        assert t["assigned_linked"] is False and "Check tyres" in t["copy_text"] and "<b>" not in t["copy_text"]
        assert not rec.of("sendMessage")


def test_task_from_rental_booking_one_step():
    rec, p1, p2 = _with_tg()
    with p1, p2:
        bid, vid = _booking()
        d_id, _, d_chat, _ = _user(roles=["driver"], name="Delivery Driver")
        _, _, owner = _owner()
        r = client.post("/api/superadmin/tasks", headers=owner, json={"rental_booking_id": bid, "assigned_user_id": d_id})
        assert r.status_code == 201, r.text
        t = r.json()
        assert t["task_type"] == "rental_delivery" and t["vehicle_id"] == vid
        assert t["customer_name"] == "Rent Customer" and t["location"] == "Bole, near Edna Mall" and t["scheduled_at"]
        assert t["telegram"]["sent"] and rec.sent_to(d_chat)
        db = SessionLocal()
        try:
            b = db.query(models.RentalBooking).filter(models.RentalBooking.id == bid).first()
            assert b.assigned_user_id == d_id and b.status == "driver_assigned"
        finally:
            db.close()


def test_owner_edit_resend_cancel_and_filters():
    rec, p1, p2 = _with_tg()
    with p1, p2:
        d_id, _, d_chat, _ = _user(roles=["driver"])
        _, _, owner = _owner()
        t = client.post("/api/superadmin/tasks", headers=owner, json={"task_type": "other", "assigned_user_id": d_id,
                                                                      "scheduled_at": "2026-12-03T08:00"}).json()
        r = client.put(f"/api/superadmin/tasks/{t['id']}", headers=owner, json={"location": "Megenagna"})
        assert r.status_code == 200 and r.json()["location"] == "Megenagna"
        assert "Megenagna" in rec.of("editMessageText")[-1]["text"]      # same person: edited in place
        r = client.post(f"/api/superadmin/tasks/{t['id']}/send", headers=owner)
        assert r.json()["telegram"]["sent"] and len(rec.sent_to(d_chat)) == 2
        assert client.get(f"/api/superadmin/tasks?date=2026-12-03&user_id={d_id}", headers=owner).json()[0]["id"] == t["id"]
        assert all(x["id"] != t["id"] for x in client.get("/api/superadmin/tasks?date=2026-12-04", headers=owner).json())
        r = client.post(f"/api/superadmin/tasks/{t['id']}/status", headers=owner, json={"status": "in_progress"})
        assert r.status_code == 200 and r.json()["status"] == "in_progress"
        r = client.post(f"/api/superadmin/tasks/{t['id']}/cancel", headers=owner)
        assert r.status_code == 200 and r.json()["status"] == "cancelled"
        assert "cancelled" in rec.sent_to(d_chat)[-1]["text"]
        assert client.post(f"/api/superadmin/tasks/{t['id']}/send", headers=owner).status_code == 409
        actions = [e["action"] for e in r.json()["events"]]
        assert actions[0] == "created" and "sent" in actions and "edited" in actions


# ------------------------------------------------------------------ alerts

def test_team_alerts_by_permission_and_toggle():
    rec, p1, p2 = _with_tg()
    with p1, p2:
        _, _, appt_chat, _ = _user(perms=["appointments"])
        _, _, rent_chat, _ = _user(perms=["rentals"])
        _, _, drv_chat, _ = _user(roles=["driver"])
        _, _, owner = _owner()
        client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": True, "rentals": True})
        db = SessionLocal()
        try:
            a = models.Appointment(customer_name="Lead", phone_number="0911", date="2026-12-01", time_slot="10:00 AM",
                                   dealership_id=1)
            db.add(a)
            db.commit()
            team_alerts.appointment_alert(db, a, "Toyota Vitz")
            assert rec.sent_to(appt_chat) and not rec.sent_to(rent_chat) and not rec.sent_to(drv_chat)
            client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": False})
            db.expire_all()
            n = len(rec.of("sendMessage"))
            assert team_alerts.appointment_alert(db, a, "Toyota Vitz") == 0 and len(rec.of("sendMessage")) == n
            b = db.query(models.RentalBooking).first()
            appt_before = len(rec.sent_to(appt_chat))
            team_alerts.rental_alert(db, b, "Car")
            assert rec.sent_to(rent_chat) and len(rec.sent_to(appt_chat)) == appt_before
        finally:
            client.put("/api/superadmin/telegram/alerts", headers=owner, json={"appointments": True, "rentals": True})
            db.close()


# ------------------------------------------------------------------ telegram config

def test_username_normalization():
    n = tg_config.normalize_username
    assert n("@AcWaleBot") == "AcWaleBot" and n("https://t.me/AcWaleBot") == "AcWaleBot"
    assert n(" t.me/AcWaleBot?start=x ") == "AcWaleBot" and n('"AcWaleBot"') == "AcWaleBot"
    assert n("") == "" and n("not a name") == "" and n("ab") == ""


def test_link_never_built_with_empty_username():
    _, _, owner = _owner()
    uid, _, _, _ = _user(perms=["vehicles"])
    db = SessionLocal()
    try:
        d = db.query(models.Dealership).order_by(models.Dealership.id).first()
        saved = (d.telegram_bot_username, d.telegram_bot_token)
        d.telegram_bot_username = None
        db.commit()
    finally:
        db.close()
    try:
        with mock.patch.dict(os.environ, {"TELEGRAM_PLATFORM_BOT_USERNAME": "", "TELEGRAM_BOT_USERNAME": ""}), \
             mock.patch.object(tg_config.settings, "TELEGRAM_PLATFORM_BOT_USERNAME", ""):
            tg_config.invalidate()
            r = client.post(f"/api/superadmin/staff/{uid}/telegram-link", headers=owner)
            assert r.status_code == 409 and "not configured" in r.json()["detail"], r.text
            # Settings value wins over .env.
            r = client.put("/api/admin/dealership", headers=owner, json={"telegram_bot_username": "@AcWaleTestBot"})
            assert r.status_code == 200, r.text
            r = client.post(f"/api/superadmin/staff/{uid}/telegram-link", headers=owner)
            assert r.status_code == 200 and r.json()["url"].startswith("https://t.me/AcWaleTestBot?start=link_"), r.text
            assert client.put("/api/admin/dealership", headers=owner,
                              json={"telegram_bot_username": "not a bot"}).status_code == 400
    finally:
        db = SessionLocal()
        try:
            d = db.query(models.Dealership).order_by(models.Dealership.id).first()
            d.telegram_bot_username, d.telegram_bot_token = saved
            db.commit()
        finally:
            db.close()
        tg_config.invalidate()


def test_set_webhook_payload():
    _, _, owner = _owner()
    calls = []

    def fake_api(method, tok, payload=None):
        calls.append((method, payload))
        return {"ok": True, "description": "Webhook was set"}

    with mock.patch.object(tg_config, "_api", fake_api), mock.patch.dict(os.environ, {"TELEGRAM_WEBHOOK_SECRET": "s3cr3t_abc"}), \
         mock.patch.object(tg_config, "config", lambda db=None, fresh=False: {"token": "123:ABC"}):
        r = client.post("/api/superadmin/telegram/set-webhook", headers=owner, json={"url": "https://api.example.com/v1/api/telegram/webhook"})
        assert r.status_code == 200, r.text
        method, payload = calls[-1]
        assert method == "setWebhook" and payload["url"].endswith("/api/telegram/webhook")
        assert payload["secret_token"] == "s3cr3t_abc" and payload["allowed_updates"] == ["message", "callback_query"]
        assert client.post("/api/superadmin/telegram/set-webhook", headers=owner, json={"url": "http://insecure"}).status_code == 502


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
            traceback.print_exc(limit=2)
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
