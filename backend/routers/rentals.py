import math
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models
import schemas
from settings import settings
from auth import require_rentals
from sms import send_rental_booking_sms, send_driver_dispatch_sms
from telegram import send_rental_lead_telegram, send_driver_dispatch_telegram

logger = logging.getLogger(__name__)

router = APIRouter(tags=["rentals"])


def get_target_dealership(db: Session, dealer_id: Optional[int] = None) -> models.Dealership:
    """Returns the primary AC Wale Cars dealership context."""
    if dealer_id:
        dealer = db.query(models.Dealership).filter(models.Dealership.id == dealer_id).first()
        if dealer:
            return dealer

    dealer = db.query(models.Dealership).filter(
        (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
        (models.Dealership.name == settings.PLATFORM_NAME)
    ).first()

    if not dealer:
        dealer = db.query(models.Dealership).filter(models.Dealership.is_active == True).order_by(models.Dealership.id.asc()).first()

    return dealer


# ==========================================
# PUBLIC RENTAL BOOKING ENDPOINT
# ==========================================

@router.post(
    "/api/public/rentals",
    response_model=schemas.RentalBookingOut,
    status_code=status.HTTP_201_CREATED
)
async def create_public_rental_booking(
    payload: schemas.RentalBookingCreate,
    db: Session = Depends(get_db)
):
    """
    Public customer booking endpoint.
    Calculates total days & price, saves booking, and fires instant Telegram & SMS notifications
    to the AC Wale Cars management desk.
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID {payload.vehicle_id} not found."
        )

    # Validate vehicle availability for rental
    if vehicle.listing_type not in ("rent", "both"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This vehicle is currently listed for sale only and not available for rental."
        )

    if vehicle.rental_available is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This vehicle is temporarily not available for rental."
        )

    rate = (
        vehicle.rental_daily_rate
        if vehicle.rental_daily_rate is not None
        else (getattr(vehicle, "daily_rental_rate", None) or getattr(vehicle, "daily_rate", None))
    )
    if not rate or rate <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vehicle rental daily rate is not set."
        )

    # Validate date range
    start_date = payload.start_date
    end_date = payload.end_date
    if end_date <= start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be after start date."
        )

    diff_seconds = (end_date - start_date).total_seconds()
    total_days = max(1, int(math.ceil(diff_seconds / 86400.0)))
    total_price = float(total_days * float(rate))

    dealership = get_target_dealership(db, vehicle.dealership_id)
    dealer_id = dealership.id if dealership else vehicle.dealership_id

    booking = models.RentalBooking(
        vehicle_id=vehicle.id,
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        start_date=start_date,
        end_date=end_date,
        total_days=total_days,
        total_price=total_price,
        delivery_type=payload.delivery_type or "showroom_pickup",
        delivery_address=payload.delivery_address.strip() if payload.delivery_address else None,
        status="pending",
        dealership_id=dealer_id,
        created_at=datetime.utcnow()
    )

    db.add(booking)
    db.commit()
    db.refresh(booking)

    # 1. Fire Instant Telegram notification to AC Wale Cars desk
    bot_token = (
        (dealership.telegram_bot_token.strip() if dealership and dealership.telegram_bot_token else None)
        or settings.TELEGRAM_PLATFORM_BOT_TOKEN
        or settings.TELEGRAM_BOT_TOKEN
    )
    chat_id = (
        (dealership.telegram_chat_id.strip() if dealership and dealership.telegram_chat_id else None)
        or settings.TELEGRAM_CHAT_ID
    )

    vehicle_title = f"{vehicle.year} {vehicle.make} {vehicle.model}"
    if bot_token and chat_id:
        try:
            await send_rental_lead_telegram(
                bot_token=bot_token,
                chat_id=chat_id,
                booking=booking,
                vehicle_title=vehicle_title,
                dealer_name=dealership.name if dealership else "AC Wale Cars"
            )
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram rental lead: {e}")

    # 2. Fire Instant SMS notification to AC Wale Cars management desk
    desk_phone = (
        (dealership.phone_number if dealership and dealership.phone_number else None)
        or settings.SUPERADMIN_PHONE
    )
    if desk_phone:
        try:
            await send_rental_booking_sms(
                desk_phone=desk_phone,
                customer_name=booking.customer_name,
                customer_phone=booking.customer_phone,
                vehicle_title=vehicle_title,
                total_days=booking.total_days,
                total_price=booking.total_price,
                delivery_type=booking.delivery_type,
                delivery_address=booking.delivery_address
            )
        except Exception as e:
            logger.error(f"Failed to dispatch SMS rental lead: {e}")

    # Reload with vehicle relationship
    loaded_booking = db.query(models.RentalBooking).options(
        joinedload(models.RentalBooking.vehicle),
        joinedload(models.RentalBooking.assigned_driver)
    ).filter(models.RentalBooking.id == booking.id).first()

    return loaded_booking


# ==========================================
# ADMIN RENTALS MANAGEMENT ENDPOINTS
# ==========================================

@router.get(
    "/api/admin/rentals",
    response_model=List[schemas.RentalBookingOut]
)
def get_admin_rentals(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_rentals)
):
    """
    Admin endpoint to view active, pending, and past rentals.
    """
    query = db.query(models.RentalBooking).options(
        joinedload(models.RentalBooking.vehicle),
        joinedload(models.RentalBooking.assigned_driver)
    )

    # In single-tenant mode or dealer admin, filter by dealership
    if current_user.dealership_id:
        query = query.filter(models.RentalBooking.dealership_id == current_user.dealership_id)

    if status_filter and status_filter.lower() != "all":
        query = query.filter(models.RentalBooking.status == status_filter.lower())

    return query.order_by(models.RentalBooking.created_at.desc()).all()


@router.put(
    "/api/admin/rentals/{booking_id}/assign-driver",
    response_model=schemas.RentalBookingOut
)
async def assign_driver_to_rental(
    booking_id: int,
    payload: schemas.AssignDriverRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_rentals)
):
    """
    Assigns a driver to a booking and triggers an SMS/Telegram dispatch alert directly to the driver with trip details.
    """
    booking = db.query(models.RentalBooking).options(
        joinedload(models.RentalBooking.vehicle)
    ).filter(models.RentalBooking.id == booking_id).first()

    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rental booking with ID {booking_id} not found."
        )

    driver = db.query(models.Driver).filter(models.Driver.id == payload.driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Driver with ID {payload.driver_id} not found."
        )

    if not driver.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Driver {driver.full_name} is marked inactive."
        )

    # Update booking
    booking.assigned_driver_id = driver.id
    booking.status = "driver_assigned"
    db.commit()
    db.refresh(booking)

    vehicle_title = (
        f"{booking.vehicle.year} {booking.vehicle.make} {booking.vehicle.model}"
        if booking.vehicle else "AC Wale Cars Rental Vehicle"
    )
    start_str = booking.start_date.strftime("%Y-%m-%d %H:%M") if booking.start_date else ""
    end_str = booking.end_date.strftime("%Y-%m-%d %H:%M") if booking.end_date else ""

    # 1. Fire SMS dispatch alert directly to the driver
    if driver.phone_number:
        try:
            await send_driver_dispatch_sms(
                driver_phone=driver.phone_number,
                driver_name=driver.full_name,
                customer_name=booking.customer_name,
                customer_phone=booking.customer_phone,
                vehicle_title=vehicle_title,
                total_days=booking.total_days,
                start_date_str=start_str,
                end_date_str=end_str,
                delivery_type=booking.delivery_type,
                delivery_address=booking.delivery_address
            )
        except Exception as e:
            logger.error(f"Failed to dispatch SMS alert to driver {driver.id}: {e}")

    # 2. Fire Telegram dispatch alert to desk/channel
    dealership = get_target_dealership(db, booking.dealership_id)
    bot_token = (
        (dealership.telegram_bot_token.strip() if dealership and dealership.telegram_bot_token else None)
        or settings.TELEGRAM_PLATFORM_BOT_TOKEN
        or settings.TELEGRAM_BOT_TOKEN
    )
    chat_id = (
        (dealership.telegram_chat_id.strip() if dealership and dealership.telegram_chat_id else None)
        or settings.TELEGRAM_CHAT_ID
    )

    if bot_token and chat_id:
        try:
            await send_driver_dispatch_telegram(
                bot_token=bot_token,
                chat_id=chat_id,
                driver_name=driver.full_name,
                driver_phone=driver.phone_number,
                booking=booking,
                vehicle_title=vehicle_title
            )
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram alert for driver assignment: {e}")

    # Reload with driver relationship
    loaded = db.query(models.RentalBooking).options(
        joinedload(models.RentalBooking.vehicle),
        joinedload(models.RentalBooking.assigned_driver)
    ).filter(models.RentalBooking.id == booking.id).first()

    return loaded


@router.put(
    "/api/admin/rentals/{booking_id}/status",
    response_model=schemas.RentalBookingOut
)
def update_rental_status(
    booking_id: int,
    payload: schemas.RentalBookingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_rentals)
):
    """
    Update booking status (pending, confirmed, driver_assigned, delivered, completed, cancelled).
    """
    booking = db.query(models.RentalBooking).filter(models.RentalBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rental booking with ID {booking_id} not found."
        )

    valid_statuses = ("pending", "confirmed", "driver_assigned", "delivered", "completed", "cancelled")
    target_status = payload.status.lower().strip()
    if target_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be one of: {', '.join(valid_statuses)}"
        )

    booking.status = target_status
    db.commit()
    db.refresh(booking)

    loaded = db.query(models.RentalBooking).options(
        joinedload(models.RentalBooking.vehicle),
        joinedload(models.RentalBooking.assigned_driver)
    ).filter(models.RentalBooking.id == booking.id).first()

    return loaded
