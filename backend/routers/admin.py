from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from settings import settings
from auth import get_current_admin, create_access_token

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=schemas.AdminStatsOut)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    Directly query local ac_wale_cars.db without requiring tenant slug filters:
    - total_sales_inventory: Count vehicles where listing_type in ('sale', 'both')
    - active_rental_fleet: Count vehicles where listing_type in ('rent', 'both')
    - registered_drivers: Count records in drivers where is_active == True
    - total_leads_bookings: Count total appointments + total rental bookings
    Returns cleanly as JSON: { sales_count, rental_count, drivers_count, leads_count }
    """
    sales_count = db.query(models.Vehicle).filter(
        models.Vehicle.listing_type.in_(["sale", "both"])
    ).count()

    rental_count = db.query(models.Vehicle).filter(
        models.Vehicle.listing_type.in_(["rent", "both"])
    ).count()

    # Team members with the Driver role (the old drivers table is no longer used).
    drivers_count = sum(1 for u in db.query(models.User).filter(models.User.is_active == True).all()
                        if not u.is_superadmin and u.has_role("driver"))

    appointments_count = db.query(models.Appointment).count()
    rentals_count = db.query(models.RentalBooking).count()
    leads_count = appointments_count + rentals_count

    return schemas.AdminStatsOut(
        sales_count=sales_count,
        rental_count=rental_count,
        drivers_count=drivers_count,
        leads_count=leads_count,
        total_sales_inventory=sales_count,
        active_rental_fleet=rental_count,
        registered_drivers=drivers_count,
        total_leads_bookings=leads_count,
        sales_inventory=sales_count,
        rental_fleet=rental_count,
        active_drivers=drivers_count,
        total_inquiries_and_bookings=leads_count,
        total_sales_inquiries=appointments_count,
        total_rental_bookings=rentals_count,
    )


@router.post("/switch-dealership")
def switch_dealership_router(
    payload: Optional[schemas.SwitchDealershipRequest] = None,
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    STRICTLY GUARDED: Tenant switching restricted to SuperAdmin.
    If a non-superadmin user calls this endpoint, immediately return HTTP 403 Forbidden:
    {"detail": "Unauthorized: Tenant switching restricted to SuperAdmin"}.
    """
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Tenant switching restricted to SuperAdmin"
        )

    target_id = None
    if payload and payload.dealership_id:
        target_id = payload.dealership_id
    elif dealership_id:
        target_id = dealership_id

    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dealership_id is required"
        )

    target_dealer = db.query(models.Dealership).filter(models.Dealership.id == target_id).first()
    if not target_dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dealership with ID {target_id} not found."
        )

    impersonation_token = create_access_token(
        data={
            "sub": str(current_user.id),
            "phone_number": current_user.phone_number,
            "role": "superadmin",
            "dealership_id": target_dealer.id,
        }
    )

    return {
        "message": f"Successfully switched to dealership '{target_dealer.name}'",
        "dealership_id": target_dealer.id,
        "dealership": schemas.DealershipOut(
            id=target_dealer.id,
            name=target_dealer.name,
            slug=target_dealer.slug,
            phone_number=target_dealer.phone_number,
            logo_url=target_dealer.logo_url,
            telegram_bot_token=target_dealer.telegram_bot_token,
            telegram_chat_id=target_dealer.telegram_chat_id,
            telegram_bot_username=target_dealer.telegram_bot_username,
            is_active=target_dealer.is_active,
            subscription_plan=target_dealer.subscription_plan,
            max_vehicles=target_dealer.max_vehicles,
            created_at=target_dealer.created_at,
        ),
        "access_token": impersonation_token,
        "token_type": "bearer",
    }
