"""
Telegram gate pass (remote release): one-time Telegram links, sending to gatekeepers, callback
authorization, double-use prevention, expiry, cancel, reject notes, the web Gate screen, the
public verify page (no private data, 404, rate limit) and the webhook secret.

Telegram is never called: gate_pass.tg is replaced by a recorder.
Run on a COPY of the DB:
    SUPERADMIN_PHONE="251900061300,251918032065" python test_gate_pass.py
"""
import json
import os
import sys
import uuid
from datetime import datetime, timedelta
from unittest import mock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import gate_pass
import models
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones
from routers import gate as gate_router

client = TestClient(app)
OWNER = superadmin_phones()[0]
DOCS = "/api/superadmin/documents"
CALLS = []
_msg_id = [1000]


def fake_tg(method, payload):
    CALLS.append((method, payload))
    _msg_id[0] += 1
    return {"message_id": _msg_id[0]} if method == "sendMessage" else {}


PATCHES = [
    mock.patch.object(gate_pass, "tg", fake_tg),
    mock.patch.object(gate_pass, "bot_token", lambda: "123:TEST"),
    mock.patch.object(gate_pass, "bot_username", lambda: "TestGateBot"),
]


def calls(method, chat=None):
    return [p for m, p in CALLS if m == method and (chat is None or str(p.get("chat_id")) == str(chat))]


def answers():
    return [p["text"] for m, p in CALLS if m == "answerCallbackQuery"]


def _headers(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": u.phone_number, "role": u.role})}


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        return u.id, _headers(u)
    finally:
        db.close()


def _user(perms, chat=None, active=True, name="Gate Keeper"):
    db = SessionLocal()
    try:
        u = models.User(phone_number=f"25197{uuid.uuid4().int % 10**7:07d}", full_name=name, role="dealer_admin",
                        dealership_id=1, is_active=active, permissions_json=models.encode_permissions(perms),
                        telegram_chat_id=chat)
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id, _headers(u)
    finally:
        db.close()


def _set(model, rid, **fields):
    db = SessionLocal()
    try:
        r = db.query(model).filter(model.id == rid).first()
        for k, v in fields.items():
            setattr(r, k, v)
        db.commit()
    finally:
        db.close()


def _get(model, rid):
    db = SessionLocal()
    try:
        r = db.query(model).filter(model.id == rid).first()
        db.expunge(r)
        return r
    finally:
        db.close()


def _chat():
    return str(7_000_000 + uuid.uuid4().int % 1_000_000)


def _only_my_gatekeepers(keep_ids):
    """Other test runs may have left linked gatekeepers: unlink everyone else for a clean recipient list."""
    db = SessionLocal()
    try:
        for u in db.query(models.User).filter(models.User.telegram_chat_id.isnot(None)).all():
            if u.id not in keep_ids and not u.is_superadmin:
                u.telegram_chat_id = None
        db.commit()
    finally:
        db.close()


def _pass(owner_h, **extra):
    plate = f"3-G{uuid.uuid4().int % 10**5:05d}"
    it = client.post(f"{DOCS}/intake", headers=owner_h, json={"data": {
        "vehicle_name": "Toyota Corolla", "year_of_production": 2018, "plate_number": plate,
        "owner_name": "Secret Owner Name", "owner_phone": "0911999888"}}).json()
    data = {"lot_intake_id": it["id"], "driver_name": "Driver Dawit", "driver_phone": "0911223344",
            "release_reason": "የተሸጠ (Sold)", "color": "Silver", **extra}
    r = client.post(f"{DOCS}/gatepass", headers=owner_h, json={"data": data})
    assert r.status_code == 201, r.text
    return r.json(), it


def _callback(chat, action, gp_id):
    gate_pass.process_update_standalone({"update_id": 1, "callback_query": {
        "id": f"cb{uuid.uuid4().hex[:6]}", "from": {"id": int(chat)}, "data": f"gp:{action}:{gp_id}",
        "message": {"chat": {"id": int(chat)}, "message_id": 1}}})


def _start(chat, payload):
    gate_pass.process_update_standalone({"update_id": 2, "message": {"chat": {"id": int(chat)}, "text": f"/start {payload}".strip()}})


def test_token_link_flow():
    _, owner_h = _owner()
    staff_id, staff_h = _user(["vehicles", "gate"], name="Linky")
    # Staff can't make links; owner can.
    assert client.post(f"/api/superadmin/staff/{staff_id}/telegram-link", headers=staff_h).status_code == 403
    r = client.post(f"/api/superadmin/staff/{staff_id}/telegram-link", headers=owner_h)
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    token = url.split("start=link_")[1]
    assert url.startswith("https://t.me/TestGateBot?start=link_") and len(token) >= 20
    phone = _get(models.User, staff_id).phone_number
    assert phone not in url and phone[-9:] not in url, "the link must not carry the phone number"

    chat_a, chat_b = _chat(), _chat()
    _start(chat_a, f"link_{token}")
    assert _get(models.User, staff_id).telegram_chat_id == chat_a
    _start(chat_b, f"link_{token}")                       # one-time: a second chat can't reuse it
    assert _get(models.User, staff_id).telegram_chat_id == chat_a
    assert "invalid" in calls("sendMessage", chat_b)[-1]["text"]

    # Expired token
    r2 = client.post(f"/api/superadmin/staff/{staff_id}/telegram-link", headers=owner_h).json()
    tok2 = r2["url"].split("start=link_")[1]
    db = SessionLocal()
    db.query(models.TelegramLinkToken).filter(models.TelegramLinkToken.token == tok2).update(
        {models.TelegramLinkToken.expires_at: datetime.utcnow() - timedelta(minutes=1)})
    db.commit(); db.close()
    _start(chat_b, f"link_{tok2}")
    assert _get(models.User, staff_id).telegram_chat_id == chat_a

    # The old phone-number link and the old dealership-id connect link do nothing any more.
    victim_id, _ = _user(["vehicles"], name="Victim")
    victim_phone = _get(models.User, victim_id).phone_number
    attacker = _chat()
    _start(attacker, f"link_{victim_phone}")
    _start(attacker, "connect_1")
    assert _get(models.User, victim_id).telegram_chat_id is None
    assert (_get(models.Dealership, 1).telegram_chat_id or "") != attacker
    for p in calls("sendMessage", attacker):
        assert "OTP" not in p["text"] and "code" not in p["text"].lower()

    staff = [s for s in client.get("/api/superadmin/staff", headers=owner_h).json() if s["id"] == staff_id][0]
    assert staff["telegram_linked"] is True and "gate" in staff["permissions"]
    assert client.delete(f"/api/superadmin/staff/{staff_id}/telegram", headers=owner_h).json()["telegram_linked"] is False
    print("✓ one-time token links (no phone in link, single use, expiry); old link_<phone> / connect_<id> disabled")


def test_send_and_callback_auth():
    owner_id, owner_h = _owner()
    owner_chat = _chat()
    _set(models.User, owner_id, telegram_chat_id=owner_chat)
    gk_chat = _chat()
    gk_id, _ = _user(["gate"], chat=gk_chat, name="Gate Abebe")
    _user(["vehicles"], chat=_chat(), name="Not a gatekeeper")
    _user(["gate"], chat=_chat(), active=False, name="Inactive gatekeeper")
    _only_my_gatekeepers({gk_id})
    gp, it = _pass(owner_h)
    assert gp["extra"]["pass_status"] == "valid" and gp["extra"]["verify_token"]

    CALLS.clear()
    r = client.post(f"/api/superadmin/gate-passes/{gp['id']}/send", headers=owner_h)
    assert r.status_code == 200, r.text
    assert r.json()["recipients"] == ["Gate Abebe"], r.json()
    sent = calls("sendMessage", gk_chat)[-1]
    kb = sent["reply_markup"]["inline_keyboard"][0]
    assert kb[0]["callback_data"] == f"gp:ok:{gp['id']}" and kb[1]["callback_data"] == f"gp:no:{gp['id']}"
    for needle in (gp["number"], "Toyota Corolla", gp["plate_number"], "Silver", "Driver Dawit", "0911223344", "/verify/"):
        assert needle in sent["text"], needle
    assert not calls("sendMessage", owner_chat), "owners get notices, not the pass with buttons"

    # Unauthorized chats: a stranger, and the deactivated gatekeeper.
    CALLS.clear()
    _callback(_chat(), "ok", gp["id"])
    assert "Not authorized" in answers()[-1]
    gk2_chat = _chat()
    gk2_id, _ = _user(["gate"], chat=gk2_chat, name="Soon inactive")
    _set(models.User, gk2_id, is_active=False)
    _callback(gk2_chat, "ok", gp["id"])
    assert "Not authorized" in answers()[-1]
    assert _get(models.GatePass, gp["id"]).exited_at is None

    # Authorized gatekeeper confirms.
    CALLS.clear()
    _callback(gk_chat, "ok", gp["id"])
    p = _get(models.GatePass, gp["id"])
    assert p.exited_at is not None and p.confirmed_by == "Gate Abebe"
    assert "Exit recorded" in answers()[-1]
    edits = calls("editMessageText", gk_chat)
    assert edits and "Exited" in edits[-1]["text"] and edits[-1]["reply_markup"] == {"inline_keyboard": []}
    assert any("confirmed by Gate Abebe" in m["text"] for m in calls("sendMessage", owner_chat)), "owner notified"
    intake = client.get(f"{DOCS}/intake/{it['id']}", headers=owner_h).json()
    assert intake["extra"]["exited_at"] and intake["extra"]["is_in_lot"] is False

    # Double use
    CALLS.clear()
    _callback(gk_chat, "ok", gp["id"])
    assert "Already used" in answers()[-1]
    assert _get(models.GatePass, gp["id"]).confirmed_by == "Gate Abebe"
    assert client.post(f"/api/superadmin/gate-passes/{gp['id']}/cancel", headers=owner_h).status_code == 409
    print("✓ send to linked active gatekeepers only; unauthorized/inactive chats rejected; confirm, edit, notify; double use blocked")


def test_expiry_cancel_reject():
    _, owner_h = _owner()
    gk_chat = _chat()
    gk_id, gk_h = _user(["vehicles", "gate"], chat=gk_chat, name="Gate Kebede")
    _only_my_gatekeepers({gk_id})

    # Default validity: 23:59 Addis time on the pass date.
    gp, _ = _pass(owner_h)
    vu = _get(models.GatePass, gp["id"]).valid_until
    assert gate_pass.to_local(vu).strftime("%H:%M") == "23:59"

    # Expired
    _set(models.GatePass, gp["id"], valid_until=datetime.utcnow() - timedelta(minutes=1))
    CALLS.clear()
    _callback(gk_chat, "ok", gp["id"])
    assert "Expired" in answers()[-1] and _get(models.GatePass, gp["id"]).exited_at is None
    assert client.post(f"/api/superadmin/gate-passes/{gp['id']}/send", headers=owner_h).status_code == 409
    ids = [x["id"] for x in client.get("/api/gate/passes", headers=gk_h).json()["valid"]]
    assert gp["id"] not in ids

    # Custom validity from the form (Addis time)
    gp2, it2 = _pass(owner_h, valid_until="2099-01-01T18:30")
    assert gate_pass.fmt_local(_get(models.GatePass, gp2["id"]).valid_until) == "01/01/2099 18:30"

    # Reject + note, stays valid
    owner_id, _ = _owner()
    owner_chat = _chat()
    _set(models.User, owner_id, telegram_chat_id=owner_chat)
    CALLS.clear()
    _callback(gk_chat, "no", gp2["id"])
    p = _get(models.GatePass, gp2["id"])
    assert p.rejected_by == "Gate Kebede" and gate_pass.pass_status(p) == "valid"
    prompt = calls("sendMessage", gk_chat)[-1]
    assert prompt["reply_markup"] == {"force_reply": True}
    gate_pass.process_update_standalone({"update_id": 3, "message": {
        "chat": {"id": int(gk_chat)}, "text": "Buyer has no ID", "reply_to_message": {"text": prompt["text"]}}})
    assert _get(models.GatePass, gp2["id"]).reject_note == "Buyer has no ID"
    assert any("Buyer has no ID" in m["text"] for m in calls("sendMessage", owner_chat))

    # Cancel: buttons say cancelled; car back in the lot
    r = client.post(f"/api/superadmin/gate-passes/{gp2['id']}/cancel", headers=owner_h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert client.get(f"{DOCS}/intake/{it2['id']}", headers=owner_h).json()["extra"]["is_in_lot"] is True
    CALLS.clear()
    _callback(gk_chat, "ok", gp2["id"])
    assert "Cancelled" in answers()[-1]
    print("✓ default 23:59 validity, custom validity, expired/cancelled refuse release, reject keeps it valid + note to owner")


def test_gate_screen():
    _, owner_h = _owner()
    gk_id, gk_h = _user(["appointments", "gate"], name="Web Gate")
    _, other_h = _user(["vehicles"])
    gp, _ = _pass(owner_h)
    assert client.get("/api/gate/passes", headers=other_h).status_code == 403
    data = client.get("/api/gate/passes", headers=gk_h).json()
    assert any(x["id"] == gp["id"] for x in data["valid"])
    assert client.post(f"/api/gate/passes/{gp['id']}/reject", headers=gk_h, json={"note": "wrong plate"}).status_code == 200
    assert client.post(f"/api/gate/passes/{gp['id']}/confirm", headers=gk_h).status_code == 200
    again = client.post(f"/api/gate/passes/{gp['id']}/confirm", headers=gk_h)
    assert again.status_code == 409 and "Already used" in again.json()["detail"]
    data = client.get("/api/gate/passes", headers=gk_h).json()
    assert any(x["id"] == gp["id"] and x["confirmed_by"] == "Web Gate" for x in data["exited"])
    # Gatekeeper permission doesn't open other sections
    assert client.get("/api/admin/vehicles", headers=gk_h).status_code == 403
    print("✓ Gate screen: gate permission only, confirm/reject from the web, recent exits, no other sections")


def test_verify_page_privacy_and_limits():
    _, owner_h = _owner()
    gp, _ = _pass(owner_h)
    token = _get(models.GatePass, gp["id"]).verify_token
    gate_router._HITS.clear()
    r = client.get(f"/api/public/verify/{token}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"status", "number", "car", "plate", "color", "valid_until", "driver_phone"}, body
    assert body["status"] == "valid" and body["driver_phone"] == "09** *** 344" and body["color"] == "Silver"
    raw = r.text
    for secret in ("0911223344", "Secret Owner Name", "0911999888", "Driver Dawit", token):
        assert secret not in raw, secret
    assert client.get(f"/api/public/verify/{'x' * 24}").status_code == 404
    assert client.get("/api/public/verify/short").status_code == 404

    # Used: shows when and who, still nothing private
    gk_id, gk_h = _user(["vehicles", "gate"], name="Verify Gate")
    client.post(f"/api/gate/passes/{gp['id']}/confirm", headers=gk_h)
    used = client.get(f"/api/public/verify/{token}").json()
    assert used["status"] == "used" and used["confirmed_by"] == "Verify Gate" and used["exited_at"]

    gate_router._HITS.clear()
    codes = [client.get(f"/api/public/verify/{token}").status_code for _ in range(gate_router.VERIFY_LIMIT + 1)]
    assert codes[-1] == 429 and codes[0] == 200
    gate_router._HITS.clear()
    print("✓ verify page: only status/car/plate/color/valid-until/masked phone; 404 unknown; 429 rate limit")


def test_webhook_secret_and_shared_handler():
    _, owner_h = _owner()
    gk_chat = _chat()
    gk_id, _ = _user(["gate"], chat=gk_chat, name="Webhook Gate")
    gp, _ = _pass(owner_h)
    update = {"update_id": 9, "callback_query": {"id": "cbw", "from": {"id": int(gk_chat)}, "data": f"gp:ok:{gp['id']}"}}
    with mock.patch.dict(os.environ, {"TELEGRAM_WEBHOOK_SECRET": "s3cret"}):
        assert client.post("/api/telegram/webhook", json=update).status_code == 403
        assert client.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "bad"}).status_code == 403
        assert _get(models.GatePass, gp["id"]).exited_at is None
        r = client.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
        assert r.status_code == 200
    assert _get(models.GatePass, gp["id"]).confirmed_by == "Webhook Gate"
    print("✓ webhook: wrong/missing secret 403; with the secret the same handler confirms the exit")


if __name__ == "__main__":
    for p in PATCHES:
        p.start()
    try:
        test_token_link_flow()
        test_send_and_callback_auth()
        test_expiry_cancel_reject()
        test_gate_screen()
        test_verify_page_privacy_and_limits()
        test_webhook_secret_and_shared_handler()
        print("\nAll gate pass tests passed.")
    finally:
        for p in PATCHES:
            p.stop()
