"""
Remote release: Telegram gate passes.

One module used by every entry point, so the rules can't drift apart:
  - the production webhook (/api/telegram/webhook) and the dev long-poller -> process_update()
  - the /admin Gate screen and the owner's Document Center -> confirm_exit(), reject_pass(), ...

A pass has a random verify token, a validity window (default 23:59 Addis Ababa time on its date)
and a derived status: draft / valid / used / expired / cancelled.
"""
import html
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

import models
from settings import settings, superadmin_phones

logger = logging.getLogger(__name__)

ET = timezone(timedelta(hours=3))          # Ethiopia: UTC+3, no daylight saving
LINK_TOKEN_TTL = timedelta(hours=48)

CONFIRM_LABEL = "✅ Confirm exit / መውጣቱን አረጋግጥ"
REJECT_LABEL = "❌ Reject / አትልቀቅ"


# ------------------------------------------------------------------ time & tokens

def new_token() -> str:
    """24 URL-safe characters (~144 bits). Fits Telegram's 64-char /start parameter with a prefix."""
    return secrets.token_urlsafe(18)


def to_local(dt: Optional[datetime]) -> Optional[datetime]:
    return dt.replace(tzinfo=timezone.utc).astimezone(ET) if dt else None


def fmt_local(dt: Optional[datetime], date: bool = True) -> str:
    d = to_local(dt)
    if not d:
        return ""
    return d.strftime("%d/%m/%Y %H:%M") if date else d.strftime("%H:%M")


def default_valid_until(issued: Optional[datetime]) -> datetime:
    """23:59 Addis time on the (local) day the pass is dated, as naive UTC."""
    local = to_local(issued or datetime.utcnow())
    end = local.replace(hour=23, minute=59, second=0, microsecond=0)
    return end.astimezone(timezone.utc).replace(tzinfo=None)


def parse_local_datetime(value: str) -> Optional[datetime]:
    """'2026-11-25T18:00' (Addis time, from a datetime-local input) -> naive UTC. Bad input -> None."""
    if not value:
        return None
    try:
        local = datetime.fromisoformat(str(value).strip().replace("Z", ""))
    except ValueError:
        return None
    if local.tzinfo is None:
        local = local.replace(tzinfo=ET)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def local_input_value(dt: Optional[datetime]) -> str:
    """naive UTC -> '2026-11-25T23:59' for a datetime-local input (Addis time)."""
    d = to_local(dt)
    return d.strftime("%Y-%m-%dT%H:%M") if d else ""


def ensure_pass_fields(gp: models.GatePass):
    """Token + validity on a new pass (or an old one missing them)."""
    if not gp.verify_token:
        gp.verify_token = new_token()
    if not gp.valid_until:
        gp.valid_until = default_valid_until(gp.date or datetime.utcnow())


# ------------------------------------------------------------------ status & facts

def pass_status(gp: models.GatePass, now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    if gp.cancelled_at:
        return "cancelled"
    if gp.exited_at:
        return "used"
    if (gp.doc_status or "final") == "draft":
        return "draft"
    until = gp.valid_until or default_valid_until(gp.date)
    if now > until:
        return "expired"
    return "valid"


def mask_phone(phone: Optional[str]) -> str:
    """'0911223344' / '+251911223344' -> '09** *** 344'."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("251") and len(digits) == 12:
        digits = "0" + digits[3:]
    if len(digits) < 6:
        return ""
    return f"{digits[:2]}** *** {digits[-3:]}"


def _vehicle_of(db: Session, gp: models.GatePass) -> Optional[models.Vehicle]:
    vid = gp.vehicle_id or (gp.lot_intake.published_vehicle_id if gp.lot_intake else None)
    return db.query(models.Vehicle).filter(models.Vehicle.id == vid).first() if vid else None


def car_facts(db: Session, gp: models.GatePass) -> Dict[str, str]:
    v = _vehicle_of(db, gp)
    if v:
        car = " ".join(str(x) for x in (v.make, v.model, v.year) if x)
    else:
        year = gp.lot_intake.year_of_production if gp.lot_intake else None
        name = gp.vehicle_name or (gp.lot_intake.vehicle_name if gp.lot_intake else "")
        car = f"{name} {year}".strip() if year and str(year) not in (name or "") else (name or "")
    color = gp.color or (v.exterior_color if v and v.exterior_color else "")
    return {"car": car or "—", "plate": gp.plate_number or "—", "color": color or "—"}


def verify_url(gp: models.GatePass) -> str:
    return f"{settings.PUBLIC_SITE_URL}/verify/{gp.verify_token}"


def bot_token() -> str:
    return (settings.TELEGRAM_PLATFORM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN or "").strip()


def bot_username() -> str:
    return (settings.TELEGRAM_PLATFORM_BOT_USERNAME or settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")


def driver_start_link(gp: models.GatePass) -> str:
    return f"https://t.me/{bot_username()}?start=gp_{gp.verify_token}"


def public_view(db: Session, gp: models.GatePass) -> Dict:
    """The ONLY fields the public verify page gets."""
    st = pass_status(gp)
    out = {
        "status": st,
        "number": gp.slip_number,
        **car_facts(db, gp),
        "valid_until": fmt_local(gp.valid_until or default_valid_until(gp.date)),
        "driver_phone": mask_phone(gp.driver_phone),
    }
    if st == "used":
        out["exited_at"] = fmt_local(gp.exited_at)
        out["confirmed_by"] = gp.confirmed_by or ""
    return out


# ------------------------------------------------------------------ Telegram API

def tg(method: str, payload: dict) -> Optional[dict]:
    """Call the Bot API (sync). Returns the result, or None when off/failed (never raises)."""
    token = bot_token()
    if not token or "your_" in token:
        logger.info(f"[gate] Telegram off: skipped {method}")
        return None
    try:
        r = httpx.post(f"https://api.telegram.org/bot{token}/{method}", json=payload, timeout=12.0)
        data = r.json()
        if not data.get("ok"):
            logger.warning(f"[gate] Telegram {method} failed: {data.get('description')}")
            return None
        return data.get("result") or {}
    except Exception as e:  # network errors must never break a request
        logger.warning(f"[gate] Telegram {method} error: {e}")
        return None


def _say(chat_id, text_html: str, **extra) -> Optional[dict]:
    return tg("sendMessage", {"chat_id": chat_id, "text": text_html, "parse_mode": "HTML",
                              "disable_web_page_preview": True, **extra})


def pass_message(db: Session, gp: models.GatePass, for_driver: bool = False) -> str:
    f = car_facts(db, gp)
    e = html.escape
    driver = e(gp.driver_name or "—")
    if gp.driver_phone:
        driver += f" ({e(mask_phone(gp.driver_phone) if for_driver else gp.driver_phone)})"
    lines = [
        f"🚗 <b>መውጫ ፓስ / Gate pass {e(gp.slip_number)}</b>",
        "",
        f"መኪና / Car: <b>{e(f['car'])}</b>",
        f"ሰሌዳ / Plate: <b>{e(f['plate'])}</b>",
        f"ቀለም / Color: {e(f['color'])}",
        f"ሹፌር / Driver: {driver}",
        f"የፈቀደው / Issued by: {e(gp.issued_by or gp.authorized_by or '—')}",
        f"የሚያገለግለው እስከ / Valid until: <b>{e(fmt_local(gp.valid_until))}</b>",
    ]
    if gp.release_reason:
        lines.append(f"ምክንያት / Reason: {e(gp.release_reason)}")
    lines += ["", f"🔗 {e(verify_url(gp))}"]
    if for_driver:
        lines += ["", "ይህንን መልእክት በበሩ ላይ ያሳዩ። / Show this message at the gate."]
    return "\n".join(lines)


def _buttons(gp: models.GatePass) -> dict:
    return {"inline_keyboard": [[
        {"text": CONFIRM_LABEL, "callback_data": f"gp:ok:{gp.id}"},
        {"text": REJECT_LABEL, "callback_data": f"gp:no:{gp.id}"},
    ]]}


def _messages(gp: models.GatePass) -> List[dict]:
    try:
        v = json.loads(gp.telegram_messages or "[]")
        return v if isinstance(v, list) else []
    except (TypeError, ValueError):
        return []


def _edit_all(db: Session, gp: models.GatePass, footer_html: str):
    """Rewrite every gate message of this pass with a status line and no buttons."""
    body = pass_message(db, gp) + "\n\n" + footer_html
    for m in _messages(gp):
        tg("editMessageText", {"chat_id": m.get("chat_id"), "message_id": m.get("message_id"), "text": body,
                               "parse_mode": "HTML", "disable_web_page_preview": True,
                               "reply_markup": {"inline_keyboard": []}})


# ------------------------------------------------------------------ people

def gate_recipients(db: Session) -> List[models.User]:
    """Active staff with the Gate permission and a linked Telegram (owners excluded: they get notices)."""
    out, seen = [], set()
    for u in db.query(models.User).filter(models.User.is_active.is_(True), models.User.telegram_chat_id.isnot(None)).all():
        chat = (u.telegram_chat_id or "").strip()
        if not chat or chat in seen or u.is_superadmin or not u.has_permission("gate"):
            continue
        seen.add(chat)
        out.append(u)
    return out


def owner_chats(db: Session) -> List[str]:
    chats: List[str] = []
    owners = set(superadmin_phones())
    for u in db.query(models.User).filter(models.User.telegram_chat_id.isnot(None)).all():
        if u.is_active and re.sub(r"\D", "", u.phone_number or "") in owners:
            chats.append(u.telegram_chat_id.strip())
    if settings.TELEGRAM_CHAT_ID:
        chats.append(settings.TELEGRAM_CHAT_ID.strip())
    dealer = db.query(models.Dealership).order_by(models.Dealership.id).first()
    if dealer and (dealer.telegram_chat_id or "").strip():
        chats.append(dealer.telegram_chat_id.strip())
    return [c for i, c in enumerate(chats) if c and c not in chats[:i]]


def actor_for_chat(db: Session, chat_id: str) -> Optional[str]:
    """Name of an ACTIVE gatekeeper or owner using this Telegram chat; None = not authorized."""
    chat_id = str(chat_id)
    for u in db.query(models.User).filter(models.User.telegram_chat_id == chat_id).all():
        if u.is_active and (u.is_superadmin or u.has_permission("gate")):
            return u.full_name or u.phone_number
    if settings.TELEGRAM_CHAT_ID and chat_id == settings.TELEGRAM_CHAT_ID.strip():
        return "Owner"
    return None


def notify_owners(db: Session, text_html: str):
    for chat in owner_chats(db):
        _say(chat, text_html)


# ------------------------------------------------------------------ actions

class GateError(Exception):
    pass


def send_pass(db: Session, gp: models.GatePass) -> Dict:
    """Send (or re-send) a valid pass to every linked gatekeeper, with Confirm / Reject buttons."""
    st = pass_status(gp)
    if st != "valid":
        raise GateError(f"This pass is {st}; only a valid pass can be sent.")
    if not bot_token():
        raise GateError("Telegram is not configured (no bot token).")
    people = gate_recipients(db)
    if not people:
        raise GateError("No gatekeeper has Telegram linked. In Staff, tick Gate and tap Link Telegram.")
    text_html = pass_message(db, gp)
    msgs = _messages(gp)
    sent, failed = [], []
    for u in people:
        res = _say(u.telegram_chat_id, text_html, reply_markup=_buttons(gp))
        name = u.full_name or u.phone_number
        if res and res.get("message_id"):
            msgs.append({"chat_id": u.telegram_chat_id, "message_id": res["message_id"]})
            sent.append(name)
        else:
            failed.append(name)
    gp.telegram_messages = json.dumps(msgs)
    if sent:
        gp.sent_at = datetime.utcnow()
    db.commit()
    return {"sent": len(sent), "recipients": sent, "failed": failed}


def confirm_exit(db: Session, gp_id: int, actor: str) -> Tuple[bool, str]:
    gp = db.query(models.GatePass).filter(models.GatePass.id == gp_id).first()
    if not gp:
        return False, "Pass not found."
    st = pass_status(gp)
    if st == "used":
        return False, f"Already used at {fmt_local(gp.exited_at)} ({gp.confirmed_by}). / ቀድሞ ወጥቷል።"
    if st in ("expired", "cancelled", "draft"):
        label = {"expired": "Expired / ጊዜው አልፏል", "cancelled": "Cancelled / ተሰርዟል", "draft": "Not issued (draft)"}[st]
        return False, f"{label}: do not release. / አይልቀቁ።"
    # Atomic: only one confirmation can win, even if two gatekeepers tap at the same moment.
    now = datetime.utcnow()
    won = db.query(models.GatePass).filter(
        models.GatePass.id == gp_id, models.GatePass.exited_at.is_(None), models.GatePass.cancelled_at.is_(None)
    ).update({models.GatePass.exited_at: now, models.GatePass.confirmed_by: actor[:150]}, synchronize_session=False)
    db.commit()
    db.refresh(gp)
    if not won:
        return False, f"Already used at {fmt_local(gp.exited_at)} ({gp.confirmed_by}). / ቀድሞ ወጥቷል።"
    if gp.lot_intake is not None and gp.lot_intake.is_in_lot:
        gp.lot_intake.is_in_lot = False
        db.commit()
    e = html.escape
    _edit_all(db, gp, f"✅ <b>Exited {fmt_local(gp.exited_at, date=False)}</b> – confirmed by {e(actor)}")
    notify_owners(db, f"✅ <b>{e(gp.slip_number)}</b> {e(gp.plate_number or '')} exited at "
                      f"{fmt_local(gp.exited_at, date=False)} – confirmed by {e(actor)}")
    logger.info(f"[gate] {gp.slip_number} exit confirmed by {actor}")
    return True, f"✅ Exit recorded {fmt_local(gp.exited_at, date=False)}. / መውጣቱ ተመዝግቧል።"


def reject_pass(db: Session, gp_id: int, actor: str, note: str = "") -> Tuple[bool, str]:
    """The car is NOT released; the pass stays valid but is flagged and the owner is told why."""
    gp = db.query(models.GatePass).filter(models.GatePass.id == gp_id).first()
    if not gp:
        return False, "Pass not found."
    st = pass_status(gp)
    if st != "valid":
        return False, "This pass is not valid any more." if st != "used" else "Already used; nothing to reject."
    gp.rejected_at = datetime.utcnow()
    gp.rejected_by = actor[:150]
    if note.strip():
        gp.reject_note = note.strip()[:1000]
    db.commit()
    e = html.escape
    notify_owners(db, f"❌ <b>{e(gp.slip_number)}</b> {e(gp.plate_number or '')} was <b>not released</b> by {e(actor)}"
                      + (f"\nNote: {e(gp.reject_note)}" if gp.reject_note else ""))
    return True, "Rejected; the owner was told. / ለባለቤቱ ተነግሯል።"


def cancel_pass(db: Session, gp: models.GatePass, actor: str) -> models.GatePass:
    st = pass_status(gp)
    if st == "used":
        raise GateError(f"Already used at {fmt_local(gp.exited_at)}; it can't be cancelled.")
    if gp.cancelled_at:
        return gp
    gp.cancelled_at = datetime.utcnow()
    gp.cancelled_by = actor[:150]
    # The car never left: put it back in the lot unless another pass already took it out.
    intake = gp.lot_intake
    if intake is not None and not any(p.exited_at for p in intake.gate_passes if p.id != gp.id):
        intake.is_in_lot = True
    db.commit()
    _edit_all(db, gp, f"🚫 <b>Cancelled</b> by {html.escape(actor)} – do not release. / ተሰርዟል፤ አይልቀቁ።")
    return gp


# ------------------------------------------------------------------ links (one-time tokens)

def create_link_token(db: Session, purpose: str, user_id: Optional[int] = None, dealership_id: Optional[int] = None) -> models.TelegramLinkToken:
    rec = models.TelegramLinkToken(token=new_token(), purpose=purpose, user_id=user_id, dealership_id=dealership_id,
                                   created_at=datetime.utcnow(), expires_at=datetime.utcnow() + LINK_TOKEN_TTL)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def _use_link_token(db: Session, token: str, purpose: str, chat_id: str) -> Optional[models.TelegramLinkToken]:
    rec = db.query(models.TelegramLinkToken).filter(models.TelegramLinkToken.token == token,
                                                    models.TelegramLinkToken.purpose == purpose).first()
    if not rec or rec.used_at is not None or rec.expires_at < datetime.utcnow():
        return None
    rec.used_at = datetime.utcnow()
    rec.used_chat_id = str(chat_id)
    return rec


# ------------------------------------------------------------------ updates (webhook + poller)

def _handle_start(db: Session, chat_id: str, payload: str):
    if payload.startswith("link_"):
        rec = _use_link_token(db, payload[5:], "staff_link", chat_id)
        user = db.query(models.User).filter(models.User.id == rec.user_id).first() if rec else None
        if not user:
            db.rollback()
            _say(chat_id, "⚠️ ይህ ሊንክ ጊዜው ያለፈበት ወይም ጥቅም ላይ የዋለ ነው። ከባለቤቱ አዲስ ይጠይቁ።\n"
                          "This link is invalid, used or expired. Ask the owner for a new one.")
            return
        user.telegram_chat_id = str(chat_id)
        db.commit()
        _say(chat_id, f"✅ <b>{html.escape(user.full_name or user.phone_number)}</b>: Telegram linked.\n"
                      "የመውጫ ፓሶች እዚህ ይደርሱዎታል። / Gate passes will arrive here.")
        logger.info(f"[gate] Telegram linked for user #{user.id}")
        return
    if payload.startswith("connect_"):
        rec = _use_link_token(db, payload[8:], "dealer_connect", chat_id)
        dealer = db.query(models.Dealership).filter(models.Dealership.id == rec.dealership_id).first() if rec else None
        if not dealer:
            db.rollback()
            _say(chat_id, "⚠️ This connect link is invalid or expired. Open /superadmin and tap Connect Bot again.")
            return
        dealer.telegram_chat_id = str(chat_id)
        owner = db.query(models.User).filter(models.User.id == rec.user_id).first() if rec.user_id else None
        if owner:
            owner.telegram_chat_id = str(chat_id)
        db.commit()
        _say(chat_id, "✅ ሰላም! የቴሌግራም አካውንትዎ ተገናኝቷል። አዳዲስ ደንበኞችና የመውጫ ማሳወቂያዎች እዚህ ይደርሱዎታል።\n"
                      "Connected: new leads and gate notices will arrive here.")
        return
    if payload.startswith("gp_"):
        gp = db.query(models.GatePass).filter(models.GatePass.verify_token == payload[3:]).first() if payload[3:] else None
        if not gp:
            _say(chat_id, "⚠️ Pass not found. / ፓሱ አልተገኘም።")
            return
        gp.driver_chat_id = str(chat_id)
        db.commit()
        st = pass_status(gp)
        status_line = {"valid": "✅ VALID / የሚሰራ", "used": f"Used {fmt_local(gp.exited_at)}",
                       "expired": "⛔ EXPIRED / ጊዜው አልፏል", "cancelled": "⛔ CANCELLED / ተሰርዟል",
                       "draft": "⛔ Not issued yet"}[st]
        _say(chat_id, pass_message(db, gp, for_driver=True) + f"\n\n<b>{status_line}</b>")
        return
    _say(chat_id, "👋 AC WALE MARKET bot.\nStaff: ask the owner for your personal link. / ሊንክዎን ከባለቤቱ ይጠይቁ።")


def _handle_callback(db: Session, cq: dict):
    cq_id = cq.get("id")
    chat_id = str((cq.get("from") or {}).get("id", ""))
    data = cq.get("data") or ""
    m = re.match(r"^gp:(ok|no):(\d+)$", data)
    if not m:
        tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": "Unknown action."})
        return
    actor = actor_for_chat(db, chat_id)
    if not actor:
        logger.warning(f"[gate] unauthorized callback from chat {chat_id}")
        tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": "⛔ Not authorized. / አልተፈቀደልዎትም።", "show_alert": True})
        return
    action, gp_id = m.group(1), int(m.group(2))
    if action == "ok":
        ok, msg = confirm_exit(db, gp_id, actor)
        tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": msg, "show_alert": not ok})
        return
    ok, msg = reject_pass(db, gp_id, actor)
    tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": msg, "show_alert": not ok})
    if ok:
        gp = db.query(models.GatePass).filter(models.GatePass.id == gp_id).first()
        _say(chat_id, f"✍️ Why was {html.escape(gp.slip_number)} rejected? Reply to this message with a short note. "
                      f"/ ምክንያቱን ይጻፉ። (pass #{gp.id})", reply_markup={"force_reply": True})


def _handle_reject_note(db: Session, chat_id: str, text: str, replied_to: str) -> bool:
    m = re.search(r"\(pass #(\d+)\)", replied_to or "")
    if not m:
        return False
    actor = actor_for_chat(db, chat_id)
    gp = db.query(models.GatePass).filter(models.GatePass.id == int(m.group(1))).first()
    if not actor or not gp:
        return True
    gp.reject_note = text.strip()[:1000]
    db.commit()
    notify_owners(db, f"📝 Note on <b>{html.escape(gp.slip_number)}</b> from {html.escape(actor)}: {html.escape(gp.reject_note)}")
    _say(chat_id, "Thanks, the owner has your note. / ማስታወሻዎ ተልኳል።")
    return True


def process_update(db: Session, update: dict):
    """Single handler for webhook and long-polling updates."""
    try:
        if update.get("callback_query"):
            _handle_callback(db, update["callback_query"])
            return
        msg = update.get("message") or {}
        chat_id = str((msg.get("chat") or {}).get("id", ""))
        text = (msg.get("text") or "").strip()
        if not chat_id or not text:
            return
        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            _handle_start(db, chat_id, parts[1].strip() if len(parts) > 1 else "")
            return
        reply = msg.get("reply_to_message") or {}
        if reply:
            _handle_reject_note(db, chat_id, text, reply.get("text") or "")
    except Exception:
        db.rollback()
        logger.exception("[gate] failed to process Telegram update")


def process_update_standalone(update: dict):
    """For threads (webhook / poller): own DB session."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        process_update(db, update)
    finally:
        db.close()
