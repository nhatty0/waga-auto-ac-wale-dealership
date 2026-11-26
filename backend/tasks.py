"""
Tasks for Team members (superadmin only), delivered by Telegram.

  - create / edit / re-send / cancel from /superadmin -> Tasks (routers/tasks.py)
  - the person gets an Amharic + English message with buttons:
        Accept -> Started -> Done, and Problem (asks for a short reply)
  - every change is written to task_events, the Telegram message is edited in place,
    and the owner's chat(s) get a one-line notice.

Who may press the buttons: the assigned person's own linked chat (active account), or a
superadmin's chat (override). Everyone else gets "Not authorized" and nothing changes.
"""
import html
import json
import logging
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

import gate_pass as gp_core
import models

logger = logging.getLogger(__name__)
e = html.escape

TYPE_LABELS = {
    "rental_delivery": ("የኪራይ መኪና ማድረስ", "Rental delivery", "🚚"),
    "rental_pickup": ("የኪራይ መኪና መመለስ", "Rental pickup", "↩️"),
    "inspection": ("የመኪና ፍተሻ", "Car check / inspection", "🔍"),
    "move_car": ("መኪና ማዛወር", "Move car", "🅿️"),
    "other": ("ሌላ ስራ", "Other", "📋"),
}
STATUS_LABELS = {
    "new": ("አዲስ", "New", "🆕"),
    "accepted": ("ተቀብሏል", "Accepted", "👍"),
    "in_progress": ("በሂደት ላይ", "In progress", "🚗"),
    "done": ("ተጠናቋል", "Done", "✅"),
    "problem": ("ችግር አለ", "Problem", "⚠️"),
    "cancelled": ("ተሰርዟል", "Cancelled", "🚫"),
}
TERMINAL = {"done", "cancelled"}
# Telegram button code -> status
BUTTONS = {
    "acc": ("accepted", "👍 ተቀበልኩ / Accept"),
    "st": ("in_progress", "🚗 ጀመርኩ / Started"),
    "done": ("done", "✅ ጨረስኩ / Done"),
    "prob": ("problem", "⚠️ ችግር / Problem"),
}
PROBLEM_MARKER = re.compile(r"\(task #(\d+)\)")


class TaskError(Exception):
    pass


# ------------------------------------------------------------------ labels & text

def type_label(t: str) -> str:
    am, en, icon = TYPE_LABELS.get(t, TYPE_LABELS["other"])
    return f"{icon} {am} / {en}"


def status_label(s: str) -> str:
    am, en, icon = STATUS_LABELS.get(s, STATUS_LABELS["new"])
    return f"{icon} {am} / {en}"


def vehicle_text(task: models.Task) -> str:
    v = task.vehicle
    if v is not None:
        car = " ".join(str(x) for x in (v.make, v.model, v.year) if x)
        color = f" · {v.exterior_color}" if getattr(v, "exterior_color", None) else ""
        return f"{car}{color}"
    return task.vehicle_label or ""


def person_name(u: Optional[models.User]) -> str:
    return (u.full_name or u.phone_number) if u else "—"


def message_html(task: models.Task) -> str:
    lines = [f"<b>{e(type_label(task.task_type))}</b>  · ስራ / Task #{task.id}", ""]
    car = vehicle_text(task)
    if car:
        lines.append(f"🚗 መኪና / Car: <b>{e(car)}</b>")
    if task.scheduled_at:
        lines.append(f"📅 ሰዓት / When: <b>{e(gp_core.fmt_local(task.scheduled_at))}</b>")
    if task.location:
        lines.append(f"📍 ቦታ / Location: {e(task.location)}")
    if task.customer_name or task.customer_phone:
        who = " ".join(x for x in [e(task.customer_name or ""), f"({e(task.customer_phone)})" if task.customer_phone else ""] if x)
        lines.append(f"👤 ደንበኛ / Customer: {who}")
    if task.rental_booking_id:
        lines.append(f"🧾 ኪራይ / Rental booking #{task.rental_booking_id}")
    if task.notes:
        lines.append(f"📝 ማስታወሻ / Notes: {e(task.notes)}")
    lines += ["", f"ሁኔታ / Status: <b>{e(status_label(task.status))}</b>"]
    if task.status == "problem" and task.problem_note:
        lines.append(f"⚠️ {e(task.problem_note)}")
    return "\n".join(lines)


def copy_text(task: models.Task) -> str:
    """Plain text for sending by hand (person not linked to Telegram)."""
    plain = re.sub(r"<[^>]+>", "", message_html(task))
    return html.unescape(plain)


def keyboard(task: models.Task) -> dict:
    if task.status in TERMINAL:
        return {"inline_keyboard": []}
    order = {"new": ["acc", "st"], "accepted": ["st", "done"], "in_progress": ["done"], "problem": ["st", "done"]}
    first = order.get(task.status, ["acc", "st"])
    row1 = [{"text": BUTTONS[c][1], "callback_data": f"tk:{c}:{task.id}"} for c in first]
    row2 = [{"text": BUTTONS["prob"][1], "callback_data": f"tk:prob:{task.id}"}]
    return {"inline_keyboard": [row1, row2]}


# ------------------------------------------------------------------ helpers

def _messages(task: models.Task) -> List[dict]:
    try:
        v = json.loads(task.telegram_messages or "[]")
        return v if isinstance(v, list) else []
    except (TypeError, ValueError):
        return []


def log(db: Session, task: models.Task, actor: str, action: str, status: Optional[str] = None, note: Optional[str] = None):
    db.add(models.TaskEvent(task_id=task.id, at=datetime.utcnow(), actor=(actor or "")[:150], action=action,
                            status=status, note=(note or None)))


def refresh_messages(db: Session, task: models.Task):
    """Edit every Telegram copy of this task to show its current state and buttons."""
    for m in _messages(task):
        gp_core.tg("editMessageText", {"chat_id": m.get("chat_id"), "message_id": m.get("message_id"),
                                        "text": message_html(task), "parse_mode": "HTML",
                                        "disable_web_page_preview": True, "reply_markup": keyboard(task)})


def _notify_owners(db: Session, text_html: str, skip_chat: Optional[str] = None):
    for chat in gp_core.owner_chats(db):
        if skip_chat and str(chat) == str(skip_chat):
            continue
        gp_core._say(chat, text_html)


def serialize(task: models.Task) -> Dict:
    u = task.assigned_user
    return {
        "id": task.id,
        "task_type": task.task_type,
        "type_label": type_label(task.task_type),
        "status": task.status,
        "status_label": status_label(task.status),
        "vehicle_id": task.vehicle_id,
        "vehicle_label": task.vehicle_label,
        "vehicle_text": vehicle_text(task),
        "assigned_user_id": task.assigned_user_id,
        "assigned_name": person_name(u) if u else None,
        "assigned_phone": u.phone_number if u else None,
        "assigned_linked": bool(u and u.telegram_linked and u.is_active),
        "scheduled_at": gp_core.local_input_value(task.scheduled_at),
        "scheduled_label": gp_core.fmt_local(task.scheduled_at),
        "location": task.location,
        "customer_name": task.customer_name,
        "customer_phone": task.customer_phone,
        "notes": task.notes,
        "problem_note": task.problem_note,
        "rental_booking_id": task.rental_booking_id,
        "sent_at": gp_core.fmt_local(task.sent_at),
        "created_by": task.created_by,
        "created_at": gp_core.fmt_local(task.created_at),
        "updated_at": gp_core.fmt_local(task.updated_at),
        "copy_text": copy_text(task),
        "events": [{"at": gp_core.fmt_local(ev.at), "actor": ev.actor, "action": ev.action,
                    "status": ev.status, "status_label": status_label(ev.status) if ev.status else None,
                    "note": ev.note} for ev in task.events],
    }


# ------------------------------------------------------------------ actions

def send(db: Session, task: models.Task, actor: str) -> Dict:
    """Send (or re-send) the task to the assigned person's Telegram. Never raises."""
    u = task.assigned_user
    if u is None:
        return {"sent": False, "reason": "Nobody is assigned."}
    if not u.is_active:
        return {"sent": False, "reason": f"{person_name(u)} is deactivated."}
    if not u.telegram_linked:
        return {"sent": False, "reason": f"{person_name(u)} has not linked Telegram. Copy the message and send it by hand."}
    if not gp_core.bot_token():
        return {"sent": False, "reason": "Telegram is not configured (no bot token)."}
    res = gp_core._say(u.telegram_chat_id, message_html(task), reply_markup=keyboard(task))
    if not (res and res.get("message_id")):
        return {"sent": False, "reason": "Telegram refused the message (has the person pressed Start in the bot?)."}
    # Only the newest copy keeps buttons: strip them from older copies sent to this chat.
    msgs = _messages(task)
    for m in msgs:
        gp_core.tg("editMessageReplyMarkup", {"chat_id": m.get("chat_id"), "message_id": m.get("message_id"),
                                              "reply_markup": {"inline_keyboard": []}})
    task.telegram_messages = json.dumps([{"chat_id": u.telegram_chat_id, "message_id": res["message_id"]}])
    task.sent_at = datetime.utcnow()
    log(db, task, actor, "sent", note=f"to {person_name(u)}")
    db.commit()
    return {"sent": True, "reason": "", "to": person_name(u)}


def set_status(db: Session, task: models.Task, new_status: str, actor: str, note: str = "",
               via_chat: Optional[str] = None) -> Tuple[bool, str]:
    if new_status not in models.TASK_STATUSES:
        return False, "Unknown status."
    if task.status in TERMINAL and new_status != task.status:
        return False, f"This task is already {STATUS_LABELS[task.status][1].lower()}. / {STATUS_LABELS[task.status][0]}"
    if task.status == new_status and new_status != "problem":
        return True, status_label(new_status)
    old = task.status
    task.status = new_status
    task.updated_at = datetime.utcnow()
    if new_status == "problem" and note:
        task.problem_note = note[:1000]
    log(db, task, actor, "status", status=new_status, note=note or None)
    db.commit()
    refresh_messages(db, task)
    line = (f"{STATUS_LABELS[new_status][2]} <b>Task #{task.id}</b> {e(type_label(task.task_type))}"
            f"{(' · ' + e(vehicle_text(task))) if vehicle_text(task) else ''}\n"
            f"{e(STATUS_LABELS[old][1])} → <b>{e(status_label(new_status))}</b> by {e(actor)}")
    if note:
        line += f"\n📝 {e(note)}"
    _notify_owners(db, line, skip_chat=via_chat)
    return True, status_label(new_status)


def cancel(db: Session, task: models.Task, actor: str) -> models.Task:
    if task.status == "done":
        raise TaskError("This task is already done; it can't be cancelled.")
    if task.status != "cancelled":
        task.status = "cancelled"
        task.updated_at = datetime.utcnow()
        log(db, task, actor, "status", status="cancelled")
        db.commit()
        refresh_messages(db, task)
        u = task.assigned_user
        if u and u.telegram_linked and _messages(task):
            gp_core._say(u.telegram_chat_id, f"🚫 Task #{task.id} ተሰርዟል / was cancelled by {e(actor)}.")
    return task


# ------------------------------------------------------------------ Telegram updates

def actor_for(db: Session, task: models.Task, chat_id: str) -> Optional[str]:
    """Name of whoever may act on this task from this chat, else None."""
    chat_id = str(chat_id)
    u = task.assigned_user
    if u is not None and u.is_active and (u.telegram_chat_id or "").strip() == chat_id:
        return person_name(u)
    for owner in db.query(models.User).filter(models.User.telegram_chat_id == chat_id).all():
        if owner.is_active and owner.is_superadmin:
            return f"{person_name(owner)} (owner)"
    return None


def handle_callback(db: Session, cq: dict):
    cq_id = cq.get("id")
    chat_id = str((cq.get("from") or {}).get("id", ""))
    m = re.match(r"^tk:(acc|st|done|prob):(\d+)$", cq.get("data") or "")
    if not m:
        gp_core.tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": "Unknown action."})
        return
    code, task_id = m.group(1), int(m.group(2))
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        gp_core.tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": "Task not found.", "show_alert": True})
        return
    actor = actor_for(db, task, chat_id)
    if not actor:
        logger.warning(f"[tasks] unauthorized callback on task #{task_id} from chat {chat_id}")
        gp_core.tg("answerCallbackQuery", {"callback_query_id": cq_id, "show_alert": True,
                                           "text": "⛔ ይህ ስራ የእርስዎ አይደለም። / This task is not assigned to you."})
        return
    new_status = BUTTONS[code][0]
    ok, msg = set_status(db, task, new_status, actor, via_chat=chat_id)
    gp_core.tg("answerCallbackQuery", {"callback_query_id": cq_id, "text": msg, "show_alert": not ok})
    if ok and code == "prob":
        gp_core._say(chat_id, f"✍️ ምን ችግር ገጠመ? በአጭሩ ይመልሱ። / What's the problem? Reply to this message "
                              f"with a short note. (task #{task.id})", reply_markup={"force_reply": True})


def handle_problem_reply(db: Session, chat_id: str, text: str, replied_to: str) -> bool:
    """A reply to the "What's the problem?" prompt. True when it was one (handled or refused)."""
    m = PROBLEM_MARKER.search(replied_to or "")
    if not m:
        return False
    task = db.query(models.Task).filter(models.Task.id == int(m.group(1))).first()
    actor = actor_for(db, task, chat_id) if task else None
    if not task or not actor:
        return True
    note = text.strip()[:1000]
    task.problem_note = note
    if task.status not in TERMINAL:
        task.status = "problem"
    task.updated_at = datetime.utcnow()
    log(db, task, actor, "note", status=task.status, note=note)
    db.commit()
    refresh_messages(db, task)
    _notify_owners(db, f"⚠️ <b>Task #{task.id}</b> problem from {e(actor)}: {e(note)}", skip_chat=chat_id)
    gp_core._say(chat_id, "ተልኳል፤ እናመሰግናለን። / Sent to the owner, thank you.")
    return True
