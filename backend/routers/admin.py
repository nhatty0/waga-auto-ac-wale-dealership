from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from settings import settings
from auth import get_current_admin, create_access_token

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
            telegram_bot_username=settings.TELEGRAM_PLATFORM_BOT_USERNAME,
            is_active=target_dealer.is_active,
            subscription_plan=target_dealer.subscription_plan,
            max_vehicles=target_dealer.max_vehicles,
            created_at=target_dealer.created_at,
        ),
        "access_token": impersonation_token,
        "token_type": "bearer",
    }
