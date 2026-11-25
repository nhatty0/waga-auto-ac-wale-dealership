"""
Remote release endpoints.

  Owner (superadmin):   send / re-send a pass to the gatekeepers, cancel it, driver & share links,
                        one-time Telegram link for a staff member, unlink, owner "Connect Bot" link.
  Gatekeeper ("gate"):  /api/gate/passes (today's valid passes + recent exits), confirm, reject.
  Public:               /api/public/verify/{token} -> minimal pass status (rate limited, 404 if unknown).
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Deque, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

import gate_pass as core
import models
from auth import get_current_superadmin, require_permission
from database import get_db
from routers.lot_operations import get_target_dealership_id

router = APIRouter(tags=["gate"])
require_gate = require_permission("gate")


def _pass_or_404(db: Session, pass_id: int) -> models.GatePass:
    gp = db.query(models.GatePass).filter(models.GatePass.id == pass_id).first()
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found.")
    return gp


def _name(u: models.User) -> str:
    return u.full_name or u.phone_number or f"user #{u.id}"


def _gate_item(db: Session, gp: models.GatePass) -> Dict:
    f = core.car_facts(db, gp)
    return {
        "id": gp.id, "number": gp.slip_number, "status": core.pass_status(gp), **f,
        "driver_name": gp.driver_name, "driver_phone": gp.driver_phone or "",
        "reason": gp.release_reason, "issued_by": gp.issued_by or gp.authorized_by,
        "valid_until": core.fmt_local(gp.valid_until), "exited_at": core.fmt_local(gp.exited_at),
        "confirmed_by": gp.confirmed_by, "rejected_by": gp.rejected_by, "reject_note": gp.reject_note,
    }


# ------------------------------------------------------------------ owner

def _links(db: Session, gp: models.GatePass) -> Dict:
    f = core.car_facts(db, gp)
    share = (f"መውጫ ፓስ / Gate pass {gp.slip_number}\n{f['car']} · {f['plate']}\n"
             f"Valid until {core.fmt_local(gp.valid_until)}\nVerify: {core.verify_url(gp)}")
    return {
        "status": core.pass_status(gp),
        "verify_url": core.verify_url(gp),
        "driver_link": core.driver_start_link(gp) if core.bot_username() else None,
        "share_text": share,
        "telegram_ready": bool(core.bot_token()),
        "gatekeepers": [_name(u) for u in core.gate_recipients(db)],
        "sent_at": core.fmt_local(gp.sent_at),
    }


@router.get("/api/superadmin/gate-passes/{pass_id}/links")
def gate_pass_links(pass_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    return _links(db, _pass_or_404(db, pass_id))


@router.post("/api/superadmin/gate-passes/{pass_id}/send")
def send_gate_pass(pass_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    gp = _pass_or_404(db, pass_id)
    core.ensure_pass_fields(gp)
    try:
        return core.send_pass(db, gp)
    except core.GateError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/api/superadmin/gate-passes/{pass_id}/cancel")
def cancel_gate_pass(pass_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    gp = _pass_or_404(db, pass_id)
    try:
        core.cancel_pass(db, gp, _name(user))
    except core.GateError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": core.pass_status(gp)}


def _staff_or_404(db: Session, user_id: int) -> models.User:
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return u


@router.post("/api/superadmin/staff/{user_id}/telegram-link")
def staff_telegram_link(user_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    """One-time link (48 h). Opening it in Telegram stores that chat on this staff member."""
    staff = _staff_or_404(db, user_id)
    if not core.bot_username():
        raise HTTPException(status_code=409, detail="Telegram bot username is not configured.")
    rec = core.create_link_token(db, "staff_link", user_id=staff.id)
    return {"url": f"https://t.me/{core.bot_username()}?start=link_{rec.token}",
            "expires_at": core.fmt_local(rec.expires_at), "bot_username": core.bot_username(),
            "telegram_ready": bool(core.bot_token())}


@router.delete("/api/superadmin/staff/{user_id}/telegram")
def staff_telegram_unlink(user_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    staff = _staff_or_404(db, user_id)
    staff.telegram_chat_id = None
    db.commit()
    return {"telegram_linked": False}


@router.post("/api/superadmin/telegram/connect-link")
def owner_connect_link(db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    """Replaces the old forgeable t.me/<bot>?start=connect_<dealership id> link."""
    if not core.bot_username():
        raise HTTPException(status_code=409, detail="Telegram bot username is not configured.")
    rec = core.create_link_token(db, "dealer_connect", user_id=user.id,
                                 dealership_id=get_target_dealership_id(db, user))
    return {"url": f"https://t.me/{core.bot_username()}?start=connect_{rec.token}",
            "expires_at": core.fmt_local(rec.expires_at)}


# ------------------------------------------------------------------ gatekeeper

@router.get("/api/gate/passes")
def gate_passes(db: Session = Depends(get_db), user: models.User = Depends(require_gate)):
    now = datetime.utcnow()
    open_rows = db.query(models.GatePass).filter(
        models.GatePass.exited_at.is_(None), models.GatePass.cancelled_at.is_(None),
        models.GatePass.archived_at.is_(None), models.GatePass.valid_until >= now,
    ).order_by(models.GatePass.valid_until.asc(), models.GatePass.id.desc()).limit(100).all()
    valid = [_gate_item(db, g) for g in open_rows if core.pass_status(g, now) == "valid"]
    exited = db.query(models.GatePass).filter(models.GatePass.exited_at >= now - timedelta(hours=48)) \
        .order_by(models.GatePass.exited_at.desc()).limit(30).all()
    return {"valid": valid, "exited": [_gate_item(db, g) for g in exited], "now": core.fmt_local(now)}


class RejectBody(BaseModel):
    note: Optional[str] = ""


@router.post("/api/gate/passes/{pass_id}/confirm")
def gate_confirm(pass_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_gate)):
    _pass_or_404(db, pass_id)
    ok, msg = core.confirm_exit(db, pass_id, _name(user))
    if not ok:
        raise HTTPException(status_code=409, detail=msg)
    return {"ok": True, "message": msg}


@router.post("/api/gate/passes/{pass_id}/reject")
def gate_reject(pass_id: int, body: RejectBody, db: Session = Depends(get_db), user: models.User = Depends(require_gate)):
    _pass_or_404(db, pass_id)
    ok, msg = core.reject_pass(db, pass_id, _name(user), body.note or "")
    if not ok:
        raise HTTPException(status_code=409, detail=msg)
    return {"ok": True, "message": msg}


# ------------------------------------------------------------------ public verify

_HITS: Dict[str, Deque[float]] = defaultdict(deque)
VERIFY_LIMIT, VERIFY_WINDOW = 30, 60.0


def _rate_limit(request: Request):
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "?")
    q = _HITS[ip]
    now = time.monotonic()
    while q and now - q[0] > VERIFY_WINDOW:
        q.popleft()
    if len(q) >= VERIFY_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")
    q.append(now)


@router.get("/api/public/verify/{token}")
def verify_pass(token: str, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request)
    if not token or len(token) < 16 or len(token) > 64:
        raise HTTPException(status_code=404, detail="Not found")
    gp = db.query(models.GatePass).filter(models.GatePass.verify_token == token).first()
    if not gp or gp.archived_at is not None:
        raise HTTPException(status_code=404, detail="Not found")
    return core.public_view(db, gp)
