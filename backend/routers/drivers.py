import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from settings import settings
from auth import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/drivers", tags=["drivers"])


def get_target_dealership_id(db: Session, user: models.User) -> Optional[int]:
    if user.dealership_id:
        return user.dealership_id
    dealer = db.query(models.Dealership).filter(
        (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
        (models.Dealership.name == settings.PLATFORM_NAME)
    ).first()
    return dealer.id if dealer else 1


@router.get("", response_model=List[schemas.DriverOut])
def list_drivers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    List all drivers belonging to AC Wale Cars driver roster.
    """
    dealership_id = get_target_dealership_id(db, current_user)
    query = db.query(models.Driver)
    if dealership_id:
        query = query.filter(models.Driver.dealership_id == dealership_id)
    return query.order_by(models.Driver.id.asc()).all()


@router.post("", response_model=schemas.DriverOut, status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: schemas.DriverCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Register a new driver in AC Wale Cars roster.
    """
    dealership_id = payload.dealership_id or get_target_dealership_id(db, current_user)

    clean_name = payload.full_name.strip()
    clean_phone = payload.phone_number.strip()
    if not clean_name or not clean_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver full name and phone number are required."
        )

    driver = models.Driver(
        full_name=clean_name,
        phone_number=clean_phone,
        license_number=payload.license_number.strip() if payload.license_number else None,
        is_active=payload.is_active if payload.is_active is not None else True,
        dealership_id=dealership_id,
        created_at=datetime.utcnow()
    )

    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=schemas.DriverOut)
def get_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Get a driver by ID.
    """
    driver = db.query(models.Driver).filter(models.Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Driver with ID {driver_id} not found."
        )
    return driver


@router.put("/{driver_id}", response_model=schemas.DriverOut)
def update_driver(
    driver_id: int,
    payload: schemas.DriverUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Update driver details or toggle active status.
    """
    driver = db.query(models.Driver).filter(models.Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Driver with ID {driver_id} not found."
        )

    if payload.full_name is not None:
        driver.full_name = payload.full_name.strip()
    if payload.phone_number is not None:
        driver.phone_number = payload.phone_number.strip()
    if payload.license_number is not None:
        driver.license_number = payload.license_number.strip() if payload.license_number else None
    if payload.is_active is not None:
        driver.is_active = payload.is_active

    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/{driver_id}")
def delete_or_deactivate_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Deactivates or removes a driver from the roster.
    """
    driver = db.query(models.Driver).filter(models.Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Driver with ID {driver_id} not found."
        )

    # If driver has existing rental bookings, soft-deactivate instead of hard delete
    has_rentals = db.query(models.RentalBooking).filter(models.RentalBooking.assigned_driver_id == driver_id).first()
    if has_rentals:
        driver.is_active = False
        db.commit()
        return {"message": f"Driver '{driver.full_name}' has associated rental bookings and was deactivated."}

    db.delete(driver)
    db.commit()
    return {"message": f"Driver '{driver.full_name}' deleted successfully."}
