"""
Superadmin-only: Tasks board, Telegram status / webhook, team alert toggles.

  GET    /api/superadmin/tasks                 ?status=&user_id=&date=YYYY-MM-DD (Addis date)
  POST   /api/superadmin/tasks                 create (+ send to Telegram unless send=false)
  GET    /api/superadmin/tasks/{id}
  PUT    /api/superadmin/tasks/{id}            edit (resend=true sends a fresh copy)
  POST   /api/superadmin/tasks/{id}/send       re-send
  POST   /api/superadmin/tasks/{id}/cancel
  POST   /api/superadmin/tasks/{id}/status     owner override {status, note}
  GET    /api/superadmin/telegram/status       getMe + getWebhookInfo + where the config comes from
  POST   /api/superadmin/telegram/set-webhook  {url?} with secret_token + [message, callback_query]
  GET/PUT /api/superadmin/telegram/alerts      {appointments, rentals} team alerts (default on)
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import gate_pass as gp_core
import models
import tasks as core
import tg_config
from auth import get_current_superadmin
from database import get_db

router = APIRouter(tags=["tasks"])


class TaskIn(BaseModel):
    task_type: Optional[str] = None
    vehicle_id: Optional[int] = None
    vehicle_label: Optional[str] = None
    assigned_user_id: Optional[int] = None
    scheduled_at: Optional[str] = None       # "2026-11-28T10:00" Addis time
    location: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    rental_booking_id: Optional[int] = None
    send: bool = True                         # create: send to Telegram right away
    resend: bool = False                      # edit: send a fresh copy


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = ""


class WebhookIn(BaseModel):
    url: Optional[str] = None


class AlertsIn(BaseModel):
    appointments: Optional[bool] = None
    rentals: Optional[bool] = None


def _name(u: models.User) -> str:
    return u.full_name or u.phone_number


def _q(db: Session):
    return db.query(models.Task).options(joinedload(models.Task.assigned_user), joinedload(models.Task.vehicle),
                                         joinedload(models.Task.events))


def _task_or_404(db: Session, task_id: int) -> models.Task:
    t = _q(db).filter(models.Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found.")
    return t


def _person_or_400(db: Session, user_id: Optional[int]) -> Optional[models.User]:
    if user_id is None:
        return None
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=400, detail="Assigned person not found.")
    if not u.is_active:
        raise HTTPException(status_code=400, detail=f"{_name(u)} is deactivated.")
    return u


def _apply(db: Session, t: models.Task, body: TaskIn, creating: bool):
    data = body.model_dump(exclude_unset=not creating)
    if "task_type" in data and data["task_type"] is not None:
        if data["task_type"] not in models.TASK_TYPES:
            raise HTTPException(status_code=400, detail="Unknown task type.")
        t.task_type = data["task_type"]
    if "vehicle_id" in data:
        if data["vehicle_id"] is not None and not db.query(models.Vehicle).filter(models.Vehicle.id == data["vehicle_id"]).first():
            raise HTTPException(status_code=400, detail="Vehicle not found.")
        t.vehicle_id = data["vehicle_id"]
    if "assigned_user_id" in data:
        _person_or_400(db, data["assigned_user_id"])
        t.assigned_user_id = data["assigned_user_id"]
    if "scheduled_at" in data:
        raw = (data["scheduled_at"] or "").strip()
        if raw:
            when = gp_core.parse_local_datetime(raw)
            if when is None:
                raise HTTPException(status_code=400, detail="Date/time must look like 2026-11-28T10:00.")
            t.scheduled_at = when
        else:
            t.scheduled_at = None
    for f, n in (("vehicle_label", 200), ("location", 255), ("customer_name", 150), ("customer_phone", 50), ("notes", 4000)):
        if f in data:
            setattr(t, f, ((data[f] or "").strip()[:n]) or None)
    if "rental_booking_id" in data:
        rb_id = data["rental_booking_id"]
        booking = db.query(models.RentalBooking).filter(models.RentalBooking.id == rb_id).first() if rb_id else None
        if rb_id and not booking:
            raise HTTPException(status_code=400, detail="Rental booking not found.")
        t.rental_booking_id = rb_id
        if booking:
            if not data.get("task_type"):
                t.task_type = "rental_delivery"
            _fill_from_booking(t, booking)


def _fill_from_booking(t: models.Task, b: models.RentalBooking):
    """Blank fields come from the linked rental booking."""
    t.vehicle_id = t.vehicle_id or b.vehicle_id
    t.customer_name = t.customer_name or b.customer_name
    t.customer_phone = t.customer_phone or b.customer_phone
    if not t.location:
        t.location = b.delivery_address or ("ከሾውሩም / Showroom pickup" if b.delivery_type != "doorstep_delivery" else None)
    if not t.scheduled_at:
        t.scheduled_at = b.end_date if t.task_type == "rental_pickup" else b.start_date


def _sync_booking_driver(db: Session, t: models.Task):
    """A rental delivery/pickup task assigned to a driver also sets the booking's driver."""
    b = t.rental_booking
    u = t.assigned_user
    if b and u and u.has_role("driver") and t.task_type in ("rental_delivery", "rental_pickup"):
        b.assigned_user_id = u.id
        if t.task_type == "rental_delivery" and b.status in ("pending", "confirmed"):
            b.status = "driver_assigned"


def _out(t: models.Task, telegram: Optional[dict] = None):
    out = core.serialize(t)
    if telegram is not None:
        out["telegram"] = telegram
    return out


# ------------------------------------------------------------------ tasks

@router.get("/api/superadmin/tasks")
def list_tasks(status: Optional[str] = None, user_id: Optional[int] = None,
               date: Optional[str] = Query(None, description="Addis date YYYY-MM-DD"),
               db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    q = _q(db)
    if status and status != "all":
        if status == "open":
            q = q.filter(models.Task.status.in_(("new", "accepted", "in_progress", "problem")))
        else:
            q = q.filter(models.Task.status == status)
    if user_id:
        q = q.filter(models.Task.assigned_user_id == user_id)
    if date:
        start = gp_core.parse_local_datetime(f"{date}T00:00")
        if start is None:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
        q = q.filter(models.Task.scheduled_at >= start, models.Task.scheduled_at < start + timedelta(days=1))
    rows = q.order_by(models.Task.id.desc()).limit(300).all()
    rows = list({t.id: t for t in rows}.values())  # joinedload(events) can repeat parents
    open_first = {"problem": 0, "new": 1, "accepted": 2, "in_progress": 3, "done": 4, "cancelled": 5}
    rows.sort(key=lambda t: (open_first.get(t.status, 9), t.scheduled_at or datetime.max, -t.id))
    return [_out(t) for t in rows]


@router.post("/api/superadmin/tasks", status_code=201)
def create_task(body: TaskIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    t = models.Task(status="new", task_type=body.task_type or "other", created_by=_name(user),
                    dealership_id=user.dealership_id, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    _apply(db, t, body, creating=True)
    db.add(t)
    db.flush()
    _sync_booking_driver(db, t)
    core.log(db, t, _name(user), "created", status="new")
    db.commit()
    t = _task_or_404(db, t.id)
    telegram = core.send(db, t, _name(user)) if body.send else {"sent": False, "reason": "Saved without sending."}
    return _out(_task_or_404(db, t.id), telegram)


@router.get("/api/superadmin/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    return _out(_task_or_404(db, task_id))


@router.put("/api/superadmin/tasks/{task_id}")
def update_task(task_id: int, body: TaskIn, db: Session = Depends(get_db),
                user: models.User = Depends(get_current_superadmin)):
    t = _task_or_404(db, task_id)
    before_person = t.assigned_user_id
    _apply(db, t, body, creating=False)
    t.updated_at = datetime.utcnow()
    db.flush()
    _sync_booking_driver(db, t)
    core.log(db, t, _name(user), "edited")
    db.commit()
    t = _task_or_404(db, task_id)
    telegram = None
    if body.resend or (t.assigned_user_id != before_person and t.assigned_user_id):
        telegram = core.send(db, t, _name(user))
    else:
        core.refresh_messages(db, t)  # same person: update the message they already have
    return _out(_task_or_404(db, task_id), telegram)


@router.post("/api/superadmin/tasks/{task_id}/send")
def resend_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    t = _task_or_404(db, task_id)
    if t.status in core.TERMINAL:
        raise HTTPException(status_code=409, detail=f"This task is {t.status}; it can't be sent.")
    telegram = core.send(db, t, _name(user))
    return _out(_task_or_404(db, task_id), telegram)


@router.post("/api/superadmin/tasks/{task_id}/cancel")
def cancel_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    t = _task_or_404(db, task_id)
    try:
        core.cancel(db, t, _name(user))
    except core.TaskError as ex:
        raise HTTPException(status_code=409, detail=str(ex))
    return _out(_task_or_404(db, task_id))


@router.post("/api/superadmin/tasks/{task_id}/status")
def override_status(task_id: int, body: StatusIn, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_superadmin)):
    t = _task_or_404(db, task_id)
    if body.status == "cancelled":
        return cancel_task(task_id, db, user)
    ok, msg = core.set_status(db, t, body.status, f"{_name(user)} (owner)", note=(body.note or "").strip())
    if not ok:
        raise HTTPException(status_code=409, detail=msg)
    return _out(_task_or_404(db, task_id))


# ------------------------------------------------------------------ telegram settings

def _dealer(db: Session) -> Optional[models.Dealership]:
    return db.query(models.Dealership).order_by(models.Dealership.id).first()


def _alerts(d: Optional[models.Dealership]) -> dict:
    return {"appointments": d is None or d.alert_appointments_team is not False,
            "rentals": d is None or d.alert_rentals_team is not False}


@router.get("/api/superadmin/telegram/status")
def telegram_status(db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    out = tg_config.status(db)
    people = db.query(models.User).filter(models.User.is_active.is_(True)).all()
    out["linked_members"] = sum(1 for u in people if not u.is_superadmin and u.telegram_linked)
    out["alerts"] = _alerts(_dealer(db))
    return out


@router.post("/api/superadmin/telegram/set-webhook")
def telegram_set_webhook(body: WebhookIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    url = (body.url or "").strip() or tg_config.default_webhook_url()
    if not url:
        raise HTTPException(status_code=400, detail="No webhook URL: set PUBLIC_API_URL (or TELEGRAM_WEBHOOK_URL) in .env, or type it in.")
    res = tg_config.set_webhook(url, db)
    if not res["ok"]:
        raise HTTPException(status_code=502, detail=f"Telegram refused: {res['description'] or 'unknown error'}")
    return {**res, "url": url}


@router.get("/api/superadmin/telegram/alerts")
def get_alerts(db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    return _alerts(_dealer(db))


@router.put("/api/superadmin/telegram/alerts")
def put_alerts(body: AlertsIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    d = _dealer(db)
    if not d:
        raise HTTPException(status_code=404, detail="Dealership not found.")
    if body.appointments is not None:
        d.alert_appointments_team = body.appointments
    if body.rentals is not None:
        d.alert_rentals_team = body.rentals
    db.commit()
    return _alerts(d)
