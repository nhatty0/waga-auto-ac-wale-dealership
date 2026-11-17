import re
import logging
from typing import List, Optional
from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models
import schemas
from settings import settings
from auth import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["lot_operations"])


def get_target_dealership_id(db: Session, user: models.User) -> Optional[int]:
    """Resolves dealership ID for tenant isolation or single tenant fallback."""
    if user.dealership_id:
        return user.dealership_id
    dealer = db.query(models.Dealership).filter(
        (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
        (models.Dealership.name == settings.PLATFORM_NAME)
    ).first()
    return dealer.id if dealer else 1


@router.get("/lot-intakes", response_model=List[schemas.LotIntakeOut])
def list_lot_intakes(
    in_lot: Optional[bool] = Query(None, description="Filter by currently in-lot (True) or released (False)"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Get list of received cars (filter by currently in-lot vs past/released).
    """
    dealership_id = get_target_dealership_id(db, current_user)
    query = db.query(models.LotIntake).options(joinedload(models.LotIntake.gate_passes))

    if dealership_id and not current_user.is_superadmin:
        query = query.filter(models.LotIntake.dealership_id == dealership_id)

    if in_lot is not None:
        query = query.filter(models.LotIntake.is_in_lot == in_lot)

    return query.order_by(models.LotIntake.received_date.desc(), models.LotIntake.id.desc()).all()


@router.get("/lot-intakes/{intake_id}", response_model=schemas.LotIntakeOut)
def get_lot_intake(
    intake_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Get details of a specific lot intake record.
    """
    intake = db.query(models.LotIntake).options(
        joinedload(models.LotIntake.gate_passes)
    ).filter(models.LotIntake.id == intake_id).first()

    if not intake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lot intake record #{intake_id} not found."
        )
    return intake


@router.post("/lot-intakes", response_model=schemas.LotIntakeOut, status_code=status.HTTP_201_CREATED)
def create_lot_intake(
    payload: schemas.LotIntakeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Create a new lot intake record (የግቢ ርክክብ).
    If `publish_to_showroom` is True, automatically create a linked record in `Vehicle`.
    """
    dealership_id = payload.dealership_id or get_target_dealership_id(db, current_user)
    received_by = payload.received_by_name or current_user.full_name or current_user.phone_number or "Admin"

    # Optional: Automatically create a showroom vehicle record if requested
    published_id = None
    if payload.publish_to_showroom:
        raw_name = payload.vehicle_name.strip()
        parts = raw_name.split()
        make = parts[0] if parts else "Unknown"
        model = " ".join(parts[1:]) if len(parts) > 1 else make
        year = payload.year_of_production or datetime.utcnow().year

        calc_price = (payload.primary_cash_price or 0.0) + (payload.primary_bank_price or 0.0)
        if calc_price == 0.0:
            calc_price = (payload.final_cash_price or 0.0) + (payload.final_bank_price or 0.0)

        cash_price = payload.primary_cash_price or payload.final_cash_price or calc_price
        bank_loan = payload.primary_bank_price or payload.final_bank_price or 0.0
        has_loan = bool(bank_loan and bank_loan > 0)

        vehicle_desc = f"የግቢ ርክክብ ተሽከርካሪ (Lot Intake). የሰሌዳ ቁጥር: {payload.plate_number}. የባለቤት ስም: {payload.owner_name} ({payload.owner_phone}). {payload.remark or ''}".strip()

        new_vehicle = models.Vehicle(
            make=make,
            model=model,
            year=year,
            price=calc_price if calc_price > 0 else None,
            cash_price=cash_price if cash_price > 0 else None,
            bank_loan_amount=bank_loan if bank_loan > 0 else None,
            has_bank_loan=has_loan,
            plate_status=payload.plate_number,
            condition="Slightly Used",
            fuel_type="Gasoline",
            transmission="Automatic",
            body_type="Sedan",
            description=vehicle_desc,
            customs_cleared=True,
            listing_type="sale",
            status=models.VehicleStatus.AVAILABLE,
            dealership_id=dealership_id,
            created_at=datetime.utcnow()
        )
        db.add(new_vehicle)
        db.commit()
        db.refresh(new_vehicle)

        # Attach default brand logo image
        img = models.VehicleImage(
            vehicle_id=new_vehicle.id,
            image_url="/logo.png",
            is_cover=True,
            display_order=0
        )
        db.add(img)
        db.commit()

        published_id = new_vehicle.id

    intake = models.LotIntake(
        vehicle_name=payload.vehicle_name.strip(),
        year_of_production=payload.year_of_production,
        plate_number=payload.plate_number.strip(),
        primary_cash_price=payload.primary_cash_price or 0.0,
        primary_bank_price=payload.primary_bank_price or 0.0,
        final_cash_price=payload.final_cash_price or 0.0,
        final_bank_price=payload.final_bank_price or 0.0,
        received_date=payload.received_date or datetime.utcnow(),
        owner_name=payload.owner_name.strip(),
        owner_phone=payload.owner_phone.strip(),
        remark=payload.remark.strip() if payload.remark else None,
        received_by_name=received_by,
        is_in_lot=True,
        published_vehicle_id=published_id,
        dealership_id=dealership_id,
        created_at=datetime.utcnow()
    )

    db.add(intake)
    db.commit()
    db.refresh(intake)

    logger.info(f"✅ Created lot intake #{intake.id} for plate {intake.plate_number} (Showroom ID: {published_id})")
    return intake


@router.post("/lot-intakes/{intake_id}/gate-pass", response_model=schemas.GatePassOut, status_code=status.HTTP_201_CREATED)
def generate_gate_pass(
    intake_id: int,
    payload: schemas.GatePassCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Generate gate pass slip (መኪና መውጫ), mark vehicle as released (is_in_lot = False),
    and return official slip record.
    """
    intake = db.query(models.LotIntake).filter(models.LotIntake.id == intake_id).first()
    if not intake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lot intake record #{intake_id} not found."
        )

    # Determine unique sequential slip number e.g. "AC-00481"
    if payload.slip_number and payload.slip_number.strip():
        slip_number = payload.slip_number.strip()
    else:
        last_pass = db.query(models.GatePass).order_by(models.GatePass.id.desc()).first()
        next_num = 1
        if last_pass:
            digits = re.findall(r"\d+", last_pass.slip_number)
            if digits:
                next_num = int(digits[-1]) + 1
            else:
                next_num = last_pass.id + 1
        slip_number = f"AC-{next_num:05d}"

    # Ensure uniqueness if manual number was given or collision
    existing = db.query(models.GatePass).filter(models.GatePass.slip_number == slip_number).first()
    if existing:
        total_count = db.query(models.GatePass).count()
        slip_number = f"AC-{total_count + 1:05d}"

    authorized_by = payload.authorized_by or current_user.full_name or current_user.phone_number or "Supervisor"
    plate_number = payload.plate_number.strip() if (payload.plate_number and payload.plate_number.strip()) else intake.plate_number

    gate_pass = models.GatePass(
        slip_number=slip_number,
        date=payload.date or datetime.utcnow(),
        driver_name=payload.driver_name.strip(),
        plate_number=plate_number,
        release_reason=payload.release_reason.strip(),
        authorized_by=authorized_by.strip(),
        lot_intake_id=intake.id,
        dealership_id=intake.dealership_id,
        created_at=datetime.utcnow()
    )

    # Release vehicle from lot
    intake.is_in_lot = False

    # If linked to a showroom vehicle, mark it as SOLD or update description
    if intake.published_vehicle_id:
        v = db.query(models.Vehicle).filter(models.Vehicle.id == intake.published_vehicle_id).first()
        if v and "የተሸጠ" in payload.release_reason:
            v.status = models.VehicleStatus.SOLD

    db.add(gate_pass)
    db.commit()
    db.refresh(gate_pass)

    logger.info(f"🚪 Generated Gate Pass {gate_pass.slip_number} for lot intake #{intake.id} (Plate: {plate_number})")
    return gate_pass


@router.get("/gate-passes", response_model=List[schemas.GatePassOut])
def list_gate_passes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    List all generated gate passes (መኪና መውጫዎች) for audits and records.
    """
    dealership_id = get_target_dealership_id(db, current_user)
    query = db.query(models.GatePass)

    if dealership_id and not current_user.is_superadmin:
        query = query.filter(models.GatePass.dealership_id == dealership_id)

    return query.order_by(models.GatePass.date.desc(), models.GatePass.id.desc()).all()


@router.delete("/lot-intakes/{intake_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lot_intake(
    intake_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Delete a lot intake record.
    """
    intake = db.query(models.LotIntake).filter(models.LotIntake.id == intake_id).first()
    if not intake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lot intake record #{intake_id} not found."
        )

    db.delete(intake)
    db.commit()
    return None


# ==========================================
# VEHICLE HANDOVER & CONSIGNMENT ENDPOINTS
# ==========================================

@router.get("/handovers", response_model=List[schemas.VehicleHandoverOut])
def list_handovers(
    q: Optional[str] = Query(None, description="Search by plate, owner name, vehicle type, or contract number"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    List all saved Vehicle Handover contracts (የመኪና መረከቢያ ውሎች).
    """
    dealership_id = get_target_dealership_id(db, current_user)
    query = db.query(models.VehicleHandover)

    if dealership_id and not current_user.is_superadmin:
        query = query.filter(models.VehicleHandover.dealership_id == dealership_id)

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.VehicleHandover.plate_number.ilike(term),
                models.VehicleHandover.owner_full_name.ilike(term),
                models.VehicleHandover.vehicle_type.ilike(term),
                models.VehicleHandover.contract_number.ilike(term),
                models.VehicleHandover.owner_phone.ilike(term),
            )
        )

    return query.order_by(models.VehicleHandover.date.desc(), models.VehicleHandover.id.desc()).all()


@router.get("/handovers/{handover_id}", response_model=schemas.VehicleHandoverOut)
def get_handover(
    handover_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Get a single Vehicle Handover contract by ID.
    """
    handover = db.query(models.VehicleHandover).filter(models.VehicleHandover.id == handover_id).first()
    if not handover:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle handover record #{handover_id} not found."
        )
    return handover


@router.post("/handovers", response_model=schemas.VehicleHandoverOut, status_code=status.HTTP_201_CREATED)
def create_handover(
    payload: schemas.VehicleHandoverCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Create a new Vehicle Handover contract, auto-assign sequential `contract_number`,
    and optionally link or pre-fill from an existing vehicle or daily intake record.
    """
    dealership_id = payload.dealership_id or get_target_dealership_id(db, current_user)

    # Auto-assign sequential contract number: "AC-rec-0001", "AC-rec-0002", etc.
    contract_number = payload.contract_number
    if not contract_number or not contract_number.strip():
        all_contracts = db.query(models.VehicleHandover.contract_number).all()
        max_seq = 0
        for (c_num,) in all_contracts:
            if c_num:
                m = re.search(r"AC-rec-(\d+)", c_num, re.IGNORECASE)
                if m:
                    try:
                        max_seq = max(max_seq, int(m.group(1)))
                    except ValueError:
                        pass
        contract_number = f"AC-rec-{max_seq + 1:04d}"

    # Handle belongings: payload.belongings list or payload.belongings_json
    belongings_str = payload.belongings_json or "[]"
    if payload.belongings is not None:
        belongings_str = json.dumps([
            b.dict() if hasattr(b, "dict") else b.model_dump()
            for b in payload.belongings
        ])

    handover = models.VehicleHandover(
        contract_number=contract_number,
        date=payload.date or datetime.utcnow(),
        owner_full_name=payload.owner_full_name.strip(),
        owner_phone=payload.owner_phone.strip(),
        owner_subcity=payload.owner_subcity.strip() if payload.owner_subcity else None,
        owner_woreda=payload.owner_woreda.strip() if payload.owner_woreda else None,
        owner_house_no=payload.owner_house_no.strip() if payload.owner_house_no else None,
        vehicle_type=payload.vehicle_type.strip(),
        manufacture_year=payload.manufacture_year,
        chassis_number=payload.chassis_number.strip() if payload.chassis_number else None,
        engine_number=payload.engine_number.strip() if payload.engine_number else None,
        horsepower=payload.horsepower.strip() if payload.horsepower else None,
        color=payload.color.strip() if payload.color else None,
        plate_number=payload.plate_number.strip(),
        belongings_json=belongings_str,
        agreed_selling_price=payload.agreed_selling_price or 0.0,
        commission_or_net_payout=payload.commission_or_net_payout.strip() if payload.commission_or_net_payout else None,
        vehicle_id=payload.vehicle_id,
        dealership_id=dealership_id,
        created_at=datetime.utcnow()
    )

    db.add(handover)
    db.commit()
    db.refresh(handover)

    logger.info(f"📄 Created Vehicle Handover Contract {handover.contract_number} for {handover.owner_full_name} (Plate: {handover.plate_number})")
    return handover


@router.delete("/handovers/{handover_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_handover(
    handover_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Delete a handover record if needed.
    """
    handover = db.query(models.VehicleHandover).filter(models.VehicleHandover.id == handover_id).first()
    if not handover:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Handover record #{handover_id} not found."
        )

    db.delete(handover)
    db.commit()
    return None

