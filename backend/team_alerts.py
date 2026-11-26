"""
Optional Telegram alerts to the team (Settings -> Telegram, both on by default):
  - a new appointment  -> active, linked members with the Appointments permission
  - a new rental booking -> active, linked members with the Rentals permission
Owners are not included: they already get the dealership alert. Never raises.
"""
import html
import logging
from typing import List

from sqlalchemy.orm import Session

import gate_pass as gp_core
import models

logger = logging.getLogger(__name__)
e = html.escape


def enabled(db: Session, kind: str) -> bool:
    d = db.query(models.Dealership).order_by(models.Dealership.id).first()
    if d is None:
        return True
    flag = d.alert_appointments_team if kind == "appointments" else d.alert_rentals_team
    return flag is not False


def recipients(db: Session, permission: str) -> List[models.User]:
    out, seen = [], set()
    for u in db.query(models.User).filter(models.User.is_active.is_(True), models.User.telegram_chat_id.isnot(None)).all():
        chat = (u.telegram_chat_id or "").strip()
        if chat and chat not in seen and not u.is_superadmin and permission in u.web_permissions:
            seen.add(chat)
            out.append(u)
    return out


def _send(db: Session, kind: str, permission: str, text_html: str) -> int:
    try:
        if not enabled(db, kind) or not gp_core.bot_token():
            return 0
        n = 0
        for u in recipients(db, permission):
            if gp_core._say(u.telegram_chat_id, text_html):
                n += 1
        return n
    except Exception:
        logger.exception("[alerts] team alert failed")
        return 0


def appointment_alert(db: Session, a: models.Appointment, vehicle_title: str) -> int:
    text = (f"📅 <b>አዲስ ቀጠሮ / New appointment</b> #{a.id}\n"
            f"👤 {e(a.customer_name)} ({e(a.phone_number)})\n"
            f"🚗 {e(vehicle_title)}\n"
            f"🕒 {e(a.date)} {e(a.time_slot)} · {e(str(getattr(a.appointment_type, 'value', a.appointment_type) or ''))}")
    if a.notes:
        text += f"\n📝 {e(a.notes)}"
    return _send(db, "appointments", "appointments", text)


def rental_alert(db: Session, b: models.RentalBooking, vehicle_title: str) -> int:
    where = b.delivery_address if b.delivery_type == "doorstep_delivery" else "ከሾውሩም / Showroom pickup"
    text = (f"🔑 <b>አዲስ ኪራይ / New rental booking</b> #{b.id}\n"
            f"👤 {e(b.customer_name)} ({e(b.customer_phone)})\n"
            f"🚗 {e(vehicle_title)} · {b.total_days} ቀን / days\n"
            f"📅 {e(gp_core.fmt_local(b.start_date))} → {e(gp_core.fmt_local(b.end_date))}\n"
            f"📍 {e(where or '—')}")
    return _send(db, "rentals", "rentals", text)


def send_standalone(fn_name: str, model: str, row_id: int, vehicle_title: str):
    """For background tasks: fresh session, reload the row by id."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        cls = models.Appointment if model == "appointment" else models.RentalBooking
        row = db.query(cls).filter(cls.id == row_id).first()
        if row is not None:
            globals()[fn_name](db, row, vehicle_title)
    finally:
        db.close()
