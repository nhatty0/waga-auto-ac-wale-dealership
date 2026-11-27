"""
Document Center (/superadmin -> Documents). Superadmin-only.

One API over five document types:
  intake      Daily Intake (የዕለት መኪና መቀበያ)          table lot_intakes        IN-0001
  gatepass    Gate / Release Pass (መውጫ ፓስ)            table gate_passes        AC-00001 (existing series)
  handover    Handover Contract (የርክክብ ውል)           table vehicle_handovers  AC-rec-0001 (existing series)
  downpayment Down-payment Receipt (የቀብድ መቀበያ ፎርም)  table documents         DP-0001
  rental      Car Rental Agreement (የመኪና ኪራይ ውል)     table documents         RA-0001

Every record is numbered on create, has a date and a status (draft / final). Archive is a soft
delete (archived_at) with restore; a permanent delete is only possible for an archived record.
The existing /api/admin/lot-intakes, gate-pass and handovers endpoints keep working unchanged.
"""
import json
import logging
import re
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_superadmin
from database import get_db
import gate_pass as gp_core
from routers.lot_operations import (
    get_target_dealership_id,
    _archiver_name,
    issue_gate_pass,
    next_intake_number,
    next_handover_number,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/superadmin/documents", tags=["documents"])

DOC_TYPES = ("intake", "gatepass", "handover", "downpayment", "rental")
DOC_PREFIX = {"downpayment": "DP", "rental": "RA"}

DEFAULT_SELLER = "ኤሲ ዋለ መኪና መሸጫ"

# Section 6 of the rental agreement template, in template order.
RENTAL_CHECKLIST = [
    "battery", "sun_visor", "left_mirror", "window_winder", "right_mirror", "door_handles",
    "seat_covers", "jack", "floor_mats", "spare_tyre", "tape_recorder", "wheel_wrench",
    "fire_extinguisher", "hubcaps", "wipers", "engine_start", "inside_mirror", "body_condition",
]

REQUIRED_FINAL = {
    "intake": ["vehicle_name", "plate_number", "owner_name", "owner_phone"],
    "gatepass": ["plate_number", "driver_name", "release_reason"],
    "handover": ["owner_full_name", "owner_phone", "vehicle_type", "plate_number"],
    "downpayment": ["buyer_name", "plate_number", "amount"],
    "rental": ["renter_name", "plate_number", "pickup_date"],
}


class DocumentSave(BaseModel):
    status: Optional[str] = None          # "draft" | "final" (default final on create)
    data: Dict[str, Any] = {}


# ------------------------------------------------------------------ helpers

def _check_type(doc_type: str) -> str:
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown document type '{doc_type}'.")
    return doc_type


def _s(v) -> str:
    return "" if v is None else str(v).strip()


def _num(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        raise HTTPException(status_code=422, detail=f"'{v}' is not a number.")


def _int(v) -> Optional[int]:
    n = _num(v)
    return int(n) if n is not None else None


def _parse_dt(v) -> Optional[datetime]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise HTTPException(status_code=422, detail=f"'{v}' is not a valid date (use YYYY-MM-DD).")


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


def _norm_plate(p: Optional[str]) -> str:
    return re.sub(r"[\s\-_.]", "", (p or "")).upper()


def _status_of(raw: Optional[str], archived_at) -> str:
    if archived_at is not None:
        return "archived"
    return "draft" if raw == "draft" else "final"


def _want_status(payload: DocumentSave, current: Optional[str] = None) -> str:
    wanted = (payload.status or current or "final").lower()
    if wanted not in ("draft", "final"):
        raise HTTPException(status_code=422, detail="status must be 'draft' or 'final'.")
    # A final document never goes back to draft (a final gate pass has already released the car).
    if current == "final":
        return "final"
    return wanted


def _require_final_fields(doc_type: str, data: Dict[str, Any]):
    missing = [f for f in REQUIRED_FINAL[doc_type] if not _s(data.get(f)) or (f == "amount" and not (_num(data.get(f)) or 0) > 0)]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"message": "Fill these fields before saving as final (or save a draft).", "missing": missing},
        )


def _dealer_id(db: Session, user: models.User) -> Optional[int]:
    return get_target_dealership_id(db, user)


def _vehicle_label(v: Optional[models.Vehicle]) -> str:
    if not v:
        return ""
    return " ".join(str(x) for x in (v.make, v.model, v.year) if x).strip()


# ------------------------------------------------------------------ serializers

def _item(doc_type: str, rec) -> Dict[str, Any]:
    """Uniform list row for any type (plus whether a stamped copy was printed)."""
    out = _item_base(doc_type, rec)
    out["stamped"] = bool(getattr(rec, "stamped", False))
    out["stamped_by"] = getattr(rec, "stamped_by", None)
    out["stamped_at"] = _iso(getattr(rec, "stamped_at", None))
    return out


def _item_base(doc_type: str, rec) -> Dict[str, Any]:
    if doc_type == "intake":
        return {
            "type": doc_type, "id": rec.id, "number": rec.doc_number or f"IN-{rec.id:04d}",
            "date": _iso(rec.received_date), "status": _status_of(rec.doc_status, rec.archived_at),
            "title": rec.vehicle_name, "plate_number": rec.plate_number,
            "party_name": rec.owner_name, "party_phone": rec.owner_phone,
            "amount": (rec.final_cash_price or 0) + (rec.final_bank_price or 0) or None,
            "vehicle_id": rec.published_vehicle_id,
            "archived_at": _iso(rec.archived_at), "archived_by": rec.archived_by,
            "created_at": _iso(rec.created_at),
            "extra": {"is_in_lot": rec.is_in_lot, "gate_pass_count": len(rec.gate_passes or []),
                      "exited_at": _iso(max((p.exited_at for p in rec.gate_passes or [] if p.exited_at), default=None))},
        }
    if doc_type == "gatepass":
        intake = rec.lot_intake
        return {
            "type": doc_type, "id": rec.id, "number": rec.slip_number,
            "date": _iso(rec.date), "status": _status_of(rec.doc_status, rec.archived_at),
            "title": rec.vehicle_name or (intake.vehicle_name if intake else ""),
            "plate_number": rec.plate_number,
            "party_name": rec.driver_name, "party_phone": intake.owner_phone if intake else None,
            "amount": None,
            "vehicle_id": rec.vehicle_id or (intake.published_vehicle_id if intake else None),
            "archived_at": _iso(rec.archived_at), "archived_by": rec.archived_by,
            "created_at": _iso(rec.created_at),
            "extra": {"release_reason": rec.release_reason, "lot_intake_id": rec.lot_intake_id,
                      "authorized_by": rec.authorized_by, "pass_status": gp_core.pass_status(rec),
                      "valid_until": _iso(rec.valid_until), "valid_until_local": gp_core.fmt_local(rec.valid_until),
                      "exited_at": _iso(rec.exited_at), "exited_local": gp_core.fmt_local(rec.exited_at),
                      "confirmed_by": rec.confirmed_by, "rejected_by": rec.rejected_by,
                      "reject_note": rec.reject_note, "cancelled_at": _iso(rec.cancelled_at),
                      "sent_at": _iso(rec.sent_at), "verify_token": rec.verify_token},
        }
    if doc_type == "handover":
        return {
            "type": doc_type, "id": rec.id, "number": rec.contract_number,
            "date": _iso(rec.date), "status": _status_of(rec.doc_status, rec.archived_at),
            "title": rec.vehicle_type, "plate_number": rec.plate_number,
            "party_name": rec.owner_full_name, "party_phone": rec.owner_phone,
            "amount": rec.agreed_selling_price or None, "vehicle_id": rec.vehicle_id,
            "archived_at": _iso(rec.archived_at), "archived_by": rec.archived_by,
            "created_at": _iso(rec.created_at), "extra": {},
        }
    data = _load(rec.data_json)
    return {
        "type": doc_type, "id": rec.id, "number": rec.doc_number,
        "date": _iso(rec.doc_date), "status": _status_of(rec.status, rec.archived_at),
        "title": data.get("vehicle_type") or "", "plate_number": rec.plate_number,
        "party_name": rec.party_name, "party_phone": rec.party_phone,
        "amount": rec.amount, "vehicle_id": rec.vehicle_id,
        "archived_at": _iso(rec.archived_at), "archived_by": rec.archived_by,
        "created_at": _iso(rec.created_at),
        "extra": {"rental_booking_id": rec.rental_booking_id},
    }


def _load(raw: Optional[str]) -> Dict[str, Any]:
    try:
        d = json.loads(raw or "{}")
        return d if isinstance(d, dict) else {}
    except (TypeError, ValueError):
        return {}


def _data(doc_type: str, rec) -> Dict[str, Any]:
    """The form fields of one record (what the edit form and the print view read)."""
    if doc_type == "intake":
        return {
            "date": _iso(rec.received_date), "vehicle_name": rec.vehicle_name,
            "year_of_production": rec.year_of_production, "plate_number": rec.plate_number,
            "primary_cash_price": rec.primary_cash_price, "primary_bank_price": rec.primary_bank_price,
            "final_cash_price": rec.final_cash_price, "final_bank_price": rec.final_bank_price,
            "owner_name": rec.owner_name, "owner_phone": rec.owner_phone, "remark": rec.remark,
            "received_by_name": rec.received_by_name, "vehicle_id": rec.published_vehicle_id,
            "is_in_lot": rec.is_in_lot,
        }
    if doc_type == "gatepass":
        return {
            "date": _iso(rec.date), "lot_intake_id": rec.lot_intake_id, "vehicle_id": rec.vehicle_id,
            "vehicle_name": rec.vehicle_name or (rec.lot_intake.vehicle_name if rec.lot_intake else ""),
            "plate_number": rec.plate_number, "driver_name": rec.driver_name,
            "release_reason": rec.release_reason, "authorized_by": rec.authorized_by,
            "driver_phone": rec.driver_phone, "color": rec.color,
            "valid_until": gp_core.local_input_value(rec.valid_until),
            "verify_token": rec.verify_token,
        }
    if doc_type == "handover":
        return {
            "date": _iso(rec.date), "owner_full_name": rec.owner_full_name, "owner_phone": rec.owner_phone,
            "owner_subcity": rec.owner_subcity, "owner_woreda": rec.owner_woreda,
            "owner_house_no": rec.owner_house_no, "vehicle_type": rec.vehicle_type,
            "manufacture_year": rec.manufacture_year, "chassis_number": rec.chassis_number,
            "engine_number": rec.engine_number, "horsepower": rec.horsepower, "color": rec.color,
            "plate_number": rec.plate_number, "belongings": _load_list(rec.belongings_json),
            "agreed_selling_price": rec.agreed_selling_price,
            "commission_or_net_payout": rec.commission_or_net_payout, "vehicle_id": rec.vehicle_id,
        }
    d = _load(rec.data_json)
    d["date"] = _iso(rec.doc_date)
    d["vehicle_id"] = rec.vehicle_id
    if doc_type == "rental":
        d["rental_booking_id"] = rec.rental_booking_id
    return d


def _load_list(raw: Optional[str]) -> list:
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except (TypeError, ValueError):
        return []


def _detail(doc_type: str, rec) -> Dict[str, Any]:
    out = _item(doc_type, rec)
    out["data"] = _data(doc_type, rec)
    return out


# ------------------------------------------------------------------ queries

def _model(doc_type: str):
    return {
        "intake": models.LotIntake, "gatepass": models.GatePass, "handover": models.VehicleHandover,
    }.get(doc_type, models.Document)


def _get(db: Session, doc_type: str, doc_id: int):
    M = _model(doc_type)
    q = db.query(M).filter(M.id == doc_id)
    if M is models.Document:
        q = q.filter(models.Document.doc_type == doc_type)
    rec = q.first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Document {doc_type} #{doc_id} not found.")
    return rec


def _date_col(doc_type: str):
    return {
        "intake": models.LotIntake.received_date, "gatepass": models.GatePass.date,
        "handover": models.VehicleHandover.date,
    }.get(doc_type, models.Document.doc_date)


def _status_col(doc_type: str):
    return {
        "intake": models.LotIntake.doc_status, "gatepass": models.GatePass.doc_status,
        "handover": models.VehicleHandover.doc_status,
    }.get(doc_type, models.Document.status)


def _base_query(db: Session, doc_type: str):
    M = _model(doc_type)
    q = db.query(M)
    if M is models.Document:
        q = q.filter(models.Document.doc_type == doc_type)
    if doc_type == "gatepass":
        q = q.outerjoin(models.LotIntake, models.GatePass.lot_intake_id == models.LotIntake.id)
    return q


def _apply_filters(q, doc_type: str, status_filter: str, search: Optional[str],
                   date_from: Optional[str], date_to: Optional[str]):
    M = _model(doc_type)
    sc = _status_col(doc_type)
    if status_filter == "archived":
        q = q.filter(M.archived_at.isnot(None))
    elif status_filter != "all":
        q = q.filter(M.archived_at.is_(None))
        if status_filter == "draft":
            q = q.filter(sc == "draft")
        elif status_filter == "final":
            q = q.filter(or_(sc.is_(None), sc != "draft"))

    dc = _date_col(doc_type)
    if date_from:
        q = q.filter(dc >= _parse_dt(date_from))
    if date_to:
        q = q.filter(dc < _parse_dt(date_to) + timedelta(days=1))

    if search and search.strip():
        term = f"%{search.strip()}%"
        if doc_type == "intake":
            cols = [M.plate_number, M.owner_name, M.owner_phone, M.doc_number, M.vehicle_name]
        elif doc_type == "gatepass":
            cols = [M.plate_number, M.slip_number, M.driver_name, M.vehicle_name, M.authorized_by,
                    models.LotIntake.owner_name, models.LotIntake.owner_phone, models.LotIntake.vehicle_name]
        elif doc_type == "handover":
            cols = [M.plate_number, M.owner_full_name, M.owner_phone, M.contract_number, M.vehicle_type]
        else:
            cols = [M.plate_number, M.party_name, M.party_phone, M.doc_number, M.data_json]
        q = q.filter(or_(*[c.ilike(term) for c in cols]))
    return q


# ------------------------------------------------------------------ numbering

def _next_doc_number(db: Session, doc_type: str) -> str:
    prefix = DOC_PREFIX[doc_type]
    rows = db.query(models.Document.doc_number).filter(models.Document.doc_type == doc_type).all()
    seq = 0
    for (n,) in rows:
        m = re.match(rf"{prefix}-(\d+)$", n or "")
        if m:
            seq = max(seq, int(m.group(1)))
    return f"{prefix}-{seq + 1:04d}"


# ------------------------------------------------------------------ write: per type

def _write_intake(db: Session, user, rec: Optional[models.LotIntake], data: Dict[str, Any], st: str):
    creating = rec is None
    if creating:
        rec = models.LotIntake(
            doc_number=next_intake_number(db), is_in_lot=True,
            dealership_id=_dealer_id(db, user), created_at=datetime.utcnow(),
            received_by_name=_s(data.get("received_by_name")) or user.full_name or user.phone_number or "Admin",
        )
        db.add(rec)
    for f in ("vehicle_name", "plate_number", "owner_name", "owner_phone"):
        if f in data or creating:
            setattr(rec, f, _s(data.get(f)))
    if "year_of_production" in data:
        rec.year_of_production = _int(data.get("year_of_production"))
    for f in ("primary_cash_price", "primary_bank_price", "final_cash_price", "final_bank_price"):
        if f in data or creating:
            setattr(rec, f, _num(data.get(f)) or 0.0)
    if "remark" in data:
        rec.remark = _s(data.get("remark")) or None
    if "received_by_name" in data and _s(data.get("received_by_name")):
        rec.received_by_name = _s(data.get("received_by_name"))
    if "date" in data or creating:
        rec.received_date = _parse_dt(data.get("date")) or rec.received_date or datetime.utcnow()
    if "vehicle_id" in data:
        rec.published_vehicle_id = _int(data.get("vehicle_id"))
    rec.doc_status = st
    return rec


def _valid_until(v) -> Optional[datetime]:
    """datetime-local value in Addis time; empty = default (23:59 that day)."""
    if not _s(v):
        return None
    dt = gp_core.parse_local_datetime(_s(v))
    if dt is None:
        raise HTTPException(status_code=422, detail="valid_until must look like 2026-11-25T23:59.")
    return dt


def _write_gatepass(db: Session, user, rec: Optional[models.GatePass], data: Dict[str, Any], st: str):
    if rec is None:
        intake = None
        if _int(data.get("lot_intake_id")):
            intake = db.query(models.LotIntake).filter(models.LotIntake.id == _int(data.get("lot_intake_id"))).first()
            if not intake:
                raise HTTPException(status_code=404, detail="That intake record was not found.")
        return issue_gate_pass(
            db, user, intake,
            driver_name=_s(data.get("driver_name")),
            plate_number=_s(data.get("plate_number")),
            release_reason=_s(data.get("release_reason")),
            authorized_by=_s(data.get("authorized_by")),
            when=_parse_dt(data.get("date")),
            vehicle_name=_s(data.get("vehicle_name")),
            vehicle_id=_int(data.get("vehicle_id")),
            doc_status=st,
            commit=False,
            driver_phone=_s(data.get("driver_phone")),
            color=_s(data.get("color")),
            valid_until=_valid_until(data.get("valid_until")),
        )
    was_draft = rec.doc_status == "draft"
    if rec.cancelled_at or rec.exited_at:
        raise HTTPException(status_code=409, detail="This pass is used or cancelled; it can't be edited.")
    for f in ("driver_name", "plate_number", "release_reason", "authorized_by", "vehicle_name"):
        if f in data:
            setattr(rec, f, _s(data.get(f)))
    for f in ("driver_phone", "color"):
        if f in data:
            setattr(rec, f, _s(data.get(f)) or None)
    if "valid_until" in data and _s(data.get("valid_until")):
        rec.valid_until = _valid_until(data.get("valid_until"))
    if "vehicle_id" in data:
        rec.vehicle_id = _int(data.get("vehicle_id"))
    if "date" in data and data.get("date"):
        rec.date = _parse_dt(data.get("date"))
    rec.doc_status = st
    if was_draft and st == "final" and rec.lot_intake is not None:
        rec.lot_intake.is_in_lot = False      # finalizing a draft pass releases the car now
    return rec


def _write_handover(db: Session, user, rec: Optional[models.VehicleHandover], data: Dict[str, Any], st: str):
    creating = rec is None
    if creating:
        rec = models.VehicleHandover(
            contract_number=next_handover_number(db), dealership_id=_dealer_id(db, user),
            created_at=datetime.utcnow(),
        )
        db.add(rec)
    for f in ("owner_full_name", "owner_phone", "vehicle_type", "plate_number"):
        if f in data or creating:
            setattr(rec, f, _s(data.get(f)))
    for f in ("owner_subcity", "owner_woreda", "owner_house_no", "chassis_number", "engine_number",
              "horsepower", "color", "commission_or_net_payout"):
        if f in data:
            setattr(rec, f, _s(data.get(f)) or None)
    if "manufacture_year" in data:
        rec.manufacture_year = _int(data.get("manufacture_year"))
    if "agreed_selling_price" in data or creating:
        rec.agreed_selling_price = _num(data.get("agreed_selling_price")) or 0.0
    if "belongings" in data or creating:
        items = data.get("belongings") or []
        clean = [{"item_name": _s(b.get("item_name")), "quantity": _s(b.get("quantity")) or "1"}
                 for b in items if isinstance(b, dict) and _s(b.get("item_name"))]
        rec.belongings_json = json.dumps(clean, ensure_ascii=False)
    if "vehicle_id" in data:
        rec.vehicle_id = _int(data.get("vehicle_id"))
    if "date" in data or creating:
        rec.date = _parse_dt(data.get("date")) or rec.date or datetime.utcnow()
    rec.doc_status = st
    return rec


def _fmt_money(n: Optional[float]) -> str:
    if n is None:
        return ""
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}"


def _write_generic(db: Session, user, doc_type: str, rec: Optional[models.Document], data: Dict[str, Any], st: str):
    creating = rec is None
    merged = {} if creating else _load(rec.data_json)
    for k, v in data.items():
        if k in ("date", "vehicle_id", "rental_booking_id"):
            continue
        merged[k] = v

    if doc_type == "downpayment":
        if creating and not _s(merged.get("seller_name")):
            # The paper form's printed defaults (the dealership itself, Bole woreda 04).
            for k, v in (("seller_name", DEFAULT_SELLER), ("seller_city", "አ/አ"), ("seller_subcity", "ቦሌ"),
                         ("seller_woreda", "04"), ("seller_house_no", "አዲስ")):
                merged.setdefault(k, v)
        party_name, party_phone = _s(merged.get("buyer_name")), _s(merged.get("buyer_phone"))
        amount = _num(merged.get("amount"))
    else:
        # Rental: daily rate x days = total (always recomputed when both are known);
        # balance = total - deposit unless it was typed in.
        rate, days = _num(merged.get("daily_rate")), _num(merged.get("days"))
        if (days is None or days <= 0) and merged.get("pickup_date") and merged.get("return_date"):
            span = (_parse_dt(merged["return_date"]) - _parse_dt(merged["pickup_date"])).days
            if span > 0:
                days = float(span)
                merged["days"] = _fmt_money(days)
        if rate is not None and days is not None:
            merged["total"] = _fmt_money(rate * days)
        total, deposit = _num(merged.get("total")), _num(merged.get("deposit"))
        if total is not None and not _s(merged.get("balance")):
            merged["balance"] = _fmt_money(max(total - (deposit or 0), 0))
        checklist = merged.get("checklist") if isinstance(merged.get("checklist"), dict) else {}
        merged["checklist"] = {k: checklist.get(k) for k in RENTAL_CHECKLIST if checklist.get(k) in ("ok", "no")}
        party_name, party_phone = _s(merged.get("renter_name")), _s(merged.get("renter_mobile"))
        amount = total

    if creating:
        rec = models.Document(
            doc_type=doc_type, doc_number=_next_doc_number(db, doc_type),
            dealership_id=_dealer_id(db, user), created_by=_archiver_name(user),
            created_at=datetime.utcnow(),
        )
        db.add(rec)
    if "date" in data or creating:
        rec.doc_date = _parse_dt(data.get("date")) or rec.doc_date or datetime.utcnow()
    if "vehicle_id" in data:
        rec.vehicle_id = _int(data.get("vehicle_id"))
    if doc_type == "rental" and "rental_booking_id" in data:
        rec.rental_booking_id = _int(data.get("rental_booking_id"))
    rec.data_json = json.dumps(merged, ensure_ascii=False)
    rec.plate_number = _s(merged.get("plate_number")) or None
    rec.party_name = party_name or None
    rec.party_phone = party_phone or None
    rec.amount = amount
    rec.status = st
    rec.updated_at = datetime.utcnow()
    return rec


def _write(db: Session, user, doc_type: str, rec, data: Dict[str, Any], st: str):
    if doc_type == "intake":
        return _write_intake(db, user, rec, data, st)
    if doc_type == "gatepass":
        return _write_gatepass(db, user, rec, data, st)
    if doc_type == "handover":
        return _write_handover(db, user, rec, data, st)
    return _write_generic(db, user, doc_type, rec, data, st)


# ------------------------------------------------------------------ routes (fixed paths first)

@router.get("/summary")
def documents_summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_superadmin)):
    """Counts for the five tiles: active (not archived), drafts and archived."""
    out = {}
    for t in DOC_TYPES:
        M = _model(t)
        base = _base_query(db, t)
        active = base.filter(M.archived_at.is_(None))
        out[t] = {
            "active": active.count(),
            "draft": active.filter(_status_col(t) == "draft").count(),
            "archived": base.filter(M.archived_at.isnot(None)).count(),
        }
        if t == "intake":
            out[t]["in_lot"] = active.filter(models.LotIntake.is_in_lot.is_(True)).count()
    return out


@router.get("/lookup")
def vehicle_lookup(
    q: Optional[str] = Query(None, description="Plate, make/model or owner"),
    vehicle_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_superadmin),
):
    """
    Vehicle picker for every form: inventory cars and lot intakes matching a plate or name, each
    with the best-known details (chassis/engine/horse power come from earlier handovers and
    documents of the same car).
    """
    term = _s(q)
    results: List[Dict[str, Any]] = []

    vq = db.query(models.Vehicle)
    if vehicle_id:
        vq = vq.filter(models.Vehicle.id == vehicle_id)
    elif term:
        like = f"%{term}%"
        vq = vq.filter(or_(models.Vehicle.plate_status.ilike(like), models.Vehicle.make.ilike(like),
                           models.Vehicle.model.ilike(like)))
    for v in vq.order_by(models.Vehicle.created_at.desc()).limit(15).all():
        plate = v.plate_status if v.plate_status and re.search(r"\d", v.plate_status) else ""
        results.append({
            "source": "vehicle", "vehicle_id": v.id, "lot_intake_id": None,
            "label": _vehicle_label(v), "vehicle_type": f"{v.make} {v.model}".strip(),
            "year": v.year, "color": v.exterior_color or "", "plate_number": plate,
            "status": v.status.value if hasattr(v.status, "value") else v.status,
            "daily_rate": v.rental_daily_rate, "owner_name": "", "owner_phone": "",
            "is_in_lot": None,
        })

    if not vehicle_id:
        iq = db.query(models.LotIntake).filter(models.LotIntake.archived_at.is_(None))
        if term:
            like = f"%{term}%"
            iq = iq.filter(or_(models.LotIntake.plate_number.ilike(like), models.LotIntake.vehicle_name.ilike(like),
                               models.LotIntake.owner_name.ilike(like)))
        for i in iq.order_by(models.LotIntake.received_date.desc()).limit(15).all():
            results.append({
                "source": "intake", "vehicle_id": i.published_vehicle_id, "lot_intake_id": i.id,
                "label": f"{i.vehicle_name} {i.year_of_production or ''}".strip(),
                "vehicle_type": i.vehicle_name, "year": i.year_of_production, "color": "",
                "plate_number": i.plate_number, "status": "in_lot" if i.is_in_lot else "released",
                "daily_rate": None, "owner_name": i.owner_name, "owner_phone": i.owner_phone,
                "is_in_lot": i.is_in_lot,
            })

    # Enrich with facts recorded on earlier documents of the same plate.
    for r in results:
        r.update({"chassis_number": "", "engine_number": "", "horsepower": ""})
        key = _norm_plate(r["plate_number"])
        if not key and not r["vehicle_id"]:
            continue
        hq = db.query(models.VehicleHandover)
        conds = []
        if r["vehicle_id"]:
            conds.append(models.VehicleHandover.vehicle_id == r["vehicle_id"])
        if r["plate_number"]:
            conds.append(models.VehicleHandover.plate_number == r["plate_number"])
        h = hq.filter(or_(*conds)).order_by(models.VehicleHandover.id.desc()).first() if conds else None
        if h:
            r["chassis_number"] = h.chassis_number or ""
            r["engine_number"] = h.engine_number or ""
            r["horsepower"] = h.horsepower or ""
            r["color"] = r["color"] or h.color or ""
            r["year"] = r["year"] or h.manufacture_year
        if not (r["chassis_number"] and r["engine_number"]) and key:
            for d in db.query(models.Document).filter(models.Document.plate_number == r["plate_number"]).order_by(models.Document.id.desc()).limit(5):
                dd = _load(d.data_json)
                for f in ("chassis_number", "engine_number", "horsepower", "color"):
                    if not r.get(f) and _s(dd.get(f)):
                        r[f] = _s(dd.get(f))
    return results


@router.get("/rental-booking/{booking_id}")
def rental_booking_prefill(booking_id: int, db: Session = Depends(get_db),
                           user: models.User = Depends(get_current_superadmin)):
    """Rental agreement fields filled from an existing rental booking."""
    b = db.query(models.RentalBooking).filter(models.RentalBooking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail=f"Rental booking #{booking_id} not found.")
    v = b.vehicle
    plate = v.plate_status if v and v.plate_status and re.search(r"\d", v.plate_status) else ""
    rate = v.rental_daily_rate if v and v.rental_daily_rate else (b.total_price / b.total_days if b.total_days else None)
    return {
        "rental_booking_id": b.id, "vehicle_id": b.vehicle_id,
        "renter_name": b.customer_name, "renter_mobile": b.customer_phone,
        "pickup_date": b.start_date.date().isoformat() if b.start_date else "",
        "pickup_time": b.start_date.strftime("%H:%M") if b.start_date and (b.start_date.hour or b.start_date.minute) else "",
        "return_date": b.end_date.date().isoformat() if b.end_date else "",
        "return_time": b.end_date.strftime("%H:%M") if b.end_date and (b.end_date.hour or b.end_date.minute) else "",
        "days": str(b.total_days or ""), "daily_rate": _fmt_money(rate) if rate else "",
        "total": _fmt_money(b.total_price) if b.total_price else "",
        "vehicle_type": f"{v.make} {v.model} {v.year}".strip() if v else "",
        "plate_number": plate, "color": (v.exterior_color or "") if v else "",
    }


@router.get("/vehicle/{vehicle_id}")
def vehicle_documents(vehicle_id: int, db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_superadmin)):
    """Every document linked to one inventory car (by link, or by the same plate)."""
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    plate = v.plate_status if v.plate_status and re.search(r"\d", v.plate_status) else None

    out: List[Dict[str, Any]] = []
    iq = db.query(models.LotIntake).filter(or_(models.LotIntake.published_vehicle_id == vehicle_id,
                                               *( [models.LotIntake.plate_number == plate] if plate else [] )))
    intakes = iq.all()
    intake_ids = [i.id for i in intakes]
    out += [_item("intake", i) for i in intakes]
    gconds = [models.GatePass.vehicle_id == vehicle_id]
    if intake_ids:
        gconds.append(models.GatePass.lot_intake_id.in_(intake_ids))
    if plate:
        gconds.append(models.GatePass.plate_number == plate)
    out += [_item("gatepass", g) for g in db.query(models.GatePass).filter(or_(*gconds)).all()]
    hconds = [models.VehicleHandover.vehicle_id == vehicle_id]
    if plate:
        hconds.append(models.VehicleHandover.plate_number == plate)
    out += [_item("handover", h) for h in db.query(models.VehicleHandover).filter(or_(*hconds)).all()]
    dconds = [models.Document.vehicle_id == vehicle_id]
    if plate:
        dconds.append(models.Document.plate_number == plate)
    out += [_item(d.doc_type, d) for d in db.query(models.Document).filter(or_(*dconds)).all()]
    out.sort(key=lambda r: (r["date"] or "", r["id"]), reverse=True)
    return {"vehicle_id": vehicle_id, "label": _vehicle_label(v), "plate_number": plate, "documents": out}


# ------------------------------------------------------------------ routes per type

@router.get("/{doc_type}")
def list_documents(
    doc_type: str,
    q: Optional[str] = None,
    status_filter: str = Query("active", alias="status", description="active | draft | final | archived | all"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    in_lot: Optional[bool] = Query(None, description="Intakes only: in the lot (true) or released (false)"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_superadmin),
):
    """Newest first. Released cars' passes are always listed (only archiving hides a pass)."""
    _check_type(doc_type)
    if status_filter not in ("active", "draft", "final", "archived", "all"):
        raise HTTPException(status_code=422, detail="Unknown status filter.")
    M = _model(doc_type)
    query = _apply_filters(_base_query(db, doc_type), doc_type, status_filter, q, date_from, date_to)
    if doc_type == "intake" and in_lot is not None:
        query = query.filter(models.LotIntake.is_in_lot.is_(in_lot))
    rows = query.order_by(_date_col(doc_type).desc(), M.id.desc()).limit(limit).all()
    return [_item(doc_type, r) for r in rows]


@router.get("/{doc_type}/{doc_id}")
def get_document(doc_type: str, doc_id: int, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_superadmin)):
    _check_type(doc_type)
    return _detail(doc_type, _get(db, doc_type, doc_id))


@router.post("/{doc_type}", status_code=status.HTTP_201_CREATED)
def create_document(doc_type: str, payload: DocumentSave, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_superadmin)):
    _check_type(doc_type)
    st = _want_status(payload)
    if doc_type == "gatepass" and _int(payload.data.get("lot_intake_id")):
        intake = db.query(models.LotIntake).filter(models.LotIntake.id == _int(payload.data.get("lot_intake_id"))).first()
        if intake:
            payload.data.setdefault("plate_number", intake.plate_number)
            payload.data["plate_number"] = _s(payload.data.get("plate_number")) or intake.plate_number
            payload.data["vehicle_name"] = _s(payload.data.get("vehicle_name")) or intake.vehicle_name
    if st == "final":
        _require_final_fields(doc_type, payload.data)
    if doc_type == "intake" and payload.data.get("publish_to_showroom") is True:
        # Same path as the old lot desk: also creates the showroom listing.
        import schemas
        from routers.lot_operations import create_lot_intake
        d = payload.data
        rec = create_lot_intake(schemas.LotIntakeCreate(
            vehicle_name=_s(d.get("vehicle_name")) or "Vehicle", year_of_production=_int(d.get("year_of_production")),
            plate_number=_s(d.get("plate_number")), owner_name=_s(d.get("owner_name")),
            owner_phone=_s(d.get("owner_phone")), remark=_s(d.get("remark")) or None,
            received_by_name=_s(d.get("received_by_name")) or None, received_date=_parse_dt(d.get("date")),
            primary_cash_price=_num(d.get("primary_cash_price")) or 0.0, primary_bank_price=_num(d.get("primary_bank_price")) or 0.0,
            final_cash_price=_num(d.get("final_cash_price")) or 0.0, final_bank_price=_num(d.get("final_bank_price")) or 0.0,
            publish_to_showroom=True,
        ), db, user)
        rec.doc_status = st
        db.commit()
        db.refresh(rec)
        return _detail(doc_type, rec)
    rec = _write(db, user, doc_type, None, payload.data, st)
    db.commit()
    db.refresh(rec)
    logger.info(f"📄 Document {doc_type} {_item(doc_type, rec)['number']} created ({st}) by {_archiver_name(user)}")
    return _detail(doc_type, rec)


@router.put("/{doc_type}/{doc_id}")
def update_document(doc_type: str, doc_id: int, payload: DocumentSave, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_superadmin)):
    _check_type(doc_type)
    rec = _get(db, doc_type, doc_id)
    if rec.archived_at is not None:
        raise HTTPException(status_code=409, detail="Restore this document before editing it.")
    current = (rec.status if doc_type in DOC_PREFIX else rec.doc_status) or "final"
    st = _want_status(payload, current)
    if st == "final":
        merged = {**_data(doc_type, rec), **payload.data}
        _require_final_fields(doc_type, merged)
    _write(db, user, doc_type, rec, payload.data, st)
    db.commit()
    db.refresh(rec)
    return _detail(doc_type, rec)


@router.post("/{doc_type}/{doc_id}/stamped")
def mark_stamped(doc_type: str, doc_id: int, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_superadmin)):
    """
    Called when a copy is printed WITH the company stamp. Only final documents can carry the stamp
    (a draft is refused), so stamped=true always means "a stamped final copy exists".
    """
    _check_type(doc_type)
    rec = _get(db, doc_type, doc_id)
    if rec.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived documents are not printed with the stamp.")
    raw = rec.status if doc_type in DOC_PREFIX else rec.doc_status
    if _status_of(raw, None) != "final":
        raise HTTPException(status_code=409, detail="Only final documents get the stamp; drafts print unstamped.")
    rec.stamped = True
    rec.stamped_by = _archiver_name(user)
    rec.stamped_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    logger.info(f"🔏 {doc_type} {_item(doc_type, rec)['number']} printed with the stamp by {rec.stamped_by}")
    return _item(doc_type, rec)


@router.post("/{doc_type}/{doc_id}/archive")
def archive_document(doc_type: str, doc_id: int, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_superadmin)):
    """Soft delete: hidden from the lists, kept in the database, can be restored."""
    _check_type(doc_type)
    rec = _get(db, doc_type, doc_id)
    if rec.archived_at is None:
        rec.archived_at = datetime.utcnow()
        rec.archived_by = _archiver_name(user)
        db.commit()
        db.refresh(rec)
    return _item(doc_type, rec)


@router.post("/{doc_type}/{doc_id}/restore")
def restore_document(doc_type: str, doc_id: int, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_superadmin)):
    _check_type(doc_type)
    rec = _get(db, doc_type, doc_id)
    rec.archived_at = None
    rec.archived_by = None
    db.commit()
    db.refresh(rec)
    return _item(doc_type, rec)


@router.delete("/{doc_type}/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_permanently(doc_type: str, doc_id: int, db: Session = Depends(get_db),
                                user: models.User = Depends(get_current_superadmin)):
    """Permanent delete, only for a record that is already archived."""
    _check_type(doc_type)
    rec = _get(db, doc_type, doc_id)
    if rec.archived_at is None:
        raise HTTPException(status_code=409, detail="Archive the document first; only archived documents can be deleted permanently.")
    if doc_type == "intake" and rec.gate_passes:
        raise HTTPException(status_code=409, detail="This intake has gate passes; they keep it as their record. Delete those passes first.")
    number = _item(doc_type, rec)["number"]
    db.delete(rec)
    db.commit()
    logger.warning(f"🗑️ Document {doc_type} {number} permanently deleted by {_archiver_name(user)}")
    return None
