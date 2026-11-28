import os
import json
import uuid
import shutil
import random
import asyncio
import logging
from pathlib import Path
from typing import List, Optional, Any, Union
from datetime import datetime, timedelta
import httpx
import jwt
from fastapi import FastAPI, Depends, HTTPException, Query, status, UploadFile, File, Body, Header
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session
from dotenv import load_dotenv

import models   
import schemas
from database import engine, get_db
from storage import upload_media_file, delete_media_file, UPLOAD_DIR
from settings import settings, is_superadmin_phone
from appointments import dispatch_lead_multichannel
import tg_config
import team_alerts
from telegram import (
    send_telegram_lead,
    send_telegram_test_message,
    format_booking_lead_caption,
    normalize_ethiopian_phone_digits
)
from auth import (
    oauth2_scheme,
    normalize_ethiopian_phone,
    create_access_token,
    get_current_admin,
    get_current_superadmin,
    require_vehicles,
    require_appointments,
    request_otp,
    verify_otp,
    rate_limiter,
    resolve_telegram_chat_id,
    dispatch_telegram_otp,
    TELEGRAM_LINKED_CHATS
)
import gate_pass
from routers import rentals, drivers, admin, lot_operations, documents, gate
from routers import tasks as tasks_router
from routers import stamp as stamp_router

# JWT & Auth Configuration from settings
JWT_SECRET_KEY = settings.JWT_SECRET_KEY
JWT_ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_DAYS = settings.ACCESS_TOKEN_EXPIRE_DAYS

TELEGRAM_BOT_TOKEN = settings.TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID = settings.TELEGRAM_CHAT_ID

logger = logging.getLogger(__name__)

async def send_telegram_alert(
    booking: Optional[Any] = None,
    vehicle_title: Optional[str] = None,
    vehicle_price: float = 0.0,
    dealership_id: Optional[int] = None,
    db: Optional[Session] = None,
    message: Optional[str] = None
):
    # Support both send_telegram_alert(dealership_id: int, message: str) and appointment booking signatures
    if isinstance(booking, int):
        dealership_id = booking
        message = vehicle_title
        booking = None
        vehicle_title = None

    if not dealership_id and booking and hasattr(booking, "dealership_id"):
        dealership_id = booking.dealership_id

    # If it's an appointment booking lead, use multi-channel dispatch (Priority 1: Telegram, Priority 2: SMS Fallback)
    if booking:
        return await dispatch_lead_multichannel(
            booking=booking,
            vehicle_title=vehicle_title or "General Showroom Inquiry",
            vehicle_price=vehicle_price,
            dealership_id=dealership_id,
            db=db
        )

    # Direct text message dispatch
    if not dealership_id or not message:
        logger.info("send_telegram_alert skipped: missing dealership_id or message")
        return

    local_db = False
    if db is None:
        from database import SessionLocal
        db = SessionLocal()
        local_db = True

    try:
        dealership = db.query(models.Dealership).filter(models.Dealership.id == dealership_id).first()
        bot_token = tg_config.token(db)
        chat_id = (dealership.telegram_chat_id.strip() if dealership and dealership.telegram_chat_id else None) or settings.TELEGRAM_CHAT_ID

        if not bot_token or not chat_id:
            logger.info(f"No Telegram credentials available for Dealership {dealership_id}. Skipping text message.")
            return

        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown",
        }
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload, timeout=8.0)
                if resp.status_code != 200:
                    logger.warning(f"Telegram notification returned status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"Telegram notification error: {e}")
    finally:
        if local_db and db:
            db.close()

# Automatically creates the database tables and runs multi-tenant migrations on startup
models.Base.metadata.create_all(bind=engine)
from migrate import run_migrations
run_migrations()

app = FastAPI(
    title=f"{settings.PLATFORM_NAME} API",
    description="Dedicated single-tenant automotive sales, car rental, and driver dispatch engine for AC WALE MARKET",
    version="2.0.0"
)

# Include Car Rental and Driver Dispatch Routers
app.include_router(rentals.router)
app.include_router(drivers.router)
app.include_router(admin.router)
app.include_router(lot_operations.router)
app.include_router(documents.router)
app.include_router(gate.router)
app.include_router(tasks_router.router)
app.include_router(stamp_router.router)

# CORS configuration to allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    # Comma-separated list in production, e.g. CORS_ORIGINS=https://acwale.et,https://www.acwale.et
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Directories for static & uploaded files
BASE_DIR = Path(__file__).resolve().parent
from storage import STATIC_DIR, LEGACY_UPLOAD_DIR as LEGACY_UPLOADS_DIR  # honours STATIC_ROOT env
STATIC_UPLOADS_DIR = UPLOAD_DIR
STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Mount static directory explicitly so images are served at: /static/uploads/<filename>
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Mount legacy uploads directory as fallback for existing links
app.mount("/uploads", StaticFiles(directory=str(STATIC_UPLOADS_DIR)), name="uploads")


def sanitize_image_url(url: str) -> str:
    """Normalizes image URLs ensuring relative accessible paths without localhost prefixes."""
    if not url:
        return ""
    clean = url.strip()
    clean = clean.replace("http://127.0.0.1:8000/uploads/", "/static/uploads/")
    clean = clean.replace("http://localhost:8000/uploads/", "/static/uploads/")
    clean = clean.replace("http://127.0.0.1:8000/static/", "/static/")
    clean = clean.replace("http://localhost:8000/static/", "/static/")
    clean = clean.replace("http://127.0.0.1:8000/", "/")
    clean = clean.replace("http://localhost:8000/", "/")
    return clean


def get_primary_dealership(db: Session) -> Optional[models.Dealership]:
    dealer = db.query(models.Dealership).filter(
        (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
        (models.Dealership.name == settings.PLATFORM_NAME)
    ).first()
    if not dealer:
        dealer = db.query(models.Dealership).filter(models.Dealership.id == 1).first()
    if not dealer:
        dealer = db.query(models.Dealership).filter(models.Dealership.is_active == True).order_by(models.Dealership.id.asc()).first()
    return dealer


# ==========================================
# PUBLIC INVENTORY & DEALERSHIP ENDPOINTS
# ==========================================

@app.get("/api/public/dealerships", response_model=List[schemas.DealershipPublicOut])
def get_public_dealerships(db: Session = Depends(get_db)):
    if settings.SINGLE_TENANT_MODE:
        primary = get_primary_dealership(db)
        return [primary] if primary else []
    return db.query(models.Dealership).filter(models.Dealership.is_active == True).all()


@app.get("/api/public/dealerships/{slug}", response_model=schemas.DealershipPublicOut)
def get_public_dealership_by_slug(slug: str, db: Session = Depends(get_db)):
    if settings.SINGLE_TENANT_MODE:
        primary = get_primary_dealership(db)
        if primary:
            return primary
    dealer = db.query(models.Dealership).filter(models.Dealership.slug == slug).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dealership with slug '{slug}' not found"
        )
    if dealer.is_active is False:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "error": "dealership_inactive",
                "message": "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
            }
        )
    return dealer


@app.get("/api/vehicles", response_model=List[schemas.VehicleOut])
def get_vehicles(
    make: Optional[str] = None,
    fuel_type: Optional[str] = None,
    body_type: Optional[str] = None,
    status: Optional[str] = "Available",
    max_price: Optional[float] = None,
    listing_type: Optional[str] = None,
    dealership_slug: Optional[str] = None,
    dealership_id: Optional[int] = None,
    condition: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Vehicle)

    if settings.SINGLE_TENANT_MODE:
        primary = get_primary_dealership(db)
        target_dealer_id = primary.id if primary else 1
    else:
        # Determine target dealership
        target_dealer_id = dealership_id
        if not target_dealer_id:
            if dealership_slug:
                dealer = db.query(models.Dealership).filter(models.Dealership.slug == dealership_slug).first()
                if dealer:
                    if dealer.is_active is False:
                        return JSONResponse(
                            status_code=403,
                            content={
                                "error": "dealership_inactive",
                                "message": "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
                            }
                        )
                    target_dealer_id = dealer.id
                else:
                    # If slug does not match any dealership, return empty list
                    return []
            else:
                default_dealer = db.query(models.Dealership).filter(models.Dealership.is_active == True).order_by(models.Dealership.id.asc()).first()
                if default_dealer:
                    target_dealer_id = default_dealer.id
                else:
                    return []
        else:
            dealer = db.query(models.Dealership).filter(models.Dealership.id == target_dealer_id).first()
            if dealer and dealer.is_active is False:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "dealership_inactive",
                        "message": "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
                    }
                )

    if target_dealer_id:
        query = query.filter(models.Vehicle.dealership_id == target_dealer_id)

    if listing_type:
        if listing_type.lower() == "rent":
            query = query.filter(
                models.Vehicle.listing_type.in_(["rent", "both"]),
                models.Vehicle.rental_available == True
            )
        elif listing_type.lower() == "sale":
            query = query.filter(models.Vehicle.listing_type.in_(["sale", "both"]))

    if status and status.lower() != "all":
        query = query.filter(models.Vehicle.status == status)
    if make:
        query = query.filter(models.Vehicle.make.ilike(f"%{make}%"))
    if fuel_type:
        query = query.filter(models.Vehicle.fuel_type == fuel_type)
    if body_type:
        query = query.filter(models.Vehicle.body_type == body_type)
    if max_price:
        query = query.filter(models.Vehicle.price <= max_price)
    if condition:
        cond_clean = condition.strip()
        cond_lower = cond_clean.lower()
        if cond_lower in [
            "slightly used",
            "excellent condition",
            "በጥቂቱ ያገለገለ",
            "በጣም ጥሩ ይዞታ",
            "በጥቂቱ ያገለገለ (slightly used)",
            "በጣም ጥሩ ይዞታ (excellent condition)",
        ]:
            query = query.filter(models.Vehicle.condition.in_(["Slightly Used", "Excellent Condition"]))
        elif cond_lower in ["good condition", "ጥሩ ይዞታ", "ጥሩ ይዞታ (good condition)"]:
            query = query.filter(models.Vehicle.condition.in_(["Slightly Used", "Excellent Condition", "Good Condition"]))
        elif cond_lower in ["brand new", "አዲስ", "አዲስ / ዜሮ ኪ.ሜ (brand new)"]:
            query = query.filter(models.Vehicle.condition == "Brand New")
        else:
            query = query.filter(models.Vehicle.condition.ilike(f"%{cond_clean}%"))
    return query.order_by(models.Vehicle.created_at.desc()).all()


@app.get("/api/vehicles/{vehicle_id}", response_model=schemas.VehicleOut)
def get_vehicle_by_id(vehicle_id: int, db: Session = Depends(get_db)):
    car = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if car.dealership and car.dealership.is_active is False:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "error": "dealership_inactive",
                "message": "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
            }
        )
    return car


# ==========================================
# PUBLIC APPOINTMENTS ENDPOINTS
# ==========================================

@app.post("/api/appointments", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
@app.post("/api/public/appointments", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_appointment(data: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    car_title = "General Dealership Inquiry"
    car_price = 0.0
    dealership_id = data.dealership_id

    if data.vehicle_id:
        car = db.query(models.Vehicle).filter(models.Vehicle.id == data.vehicle_id).first()
        if car:
            car_title = f"{car.year} {car.make} {car.model}"
            car_price = float(car.price) if car.price else 0.0
            if not dealership_id:
                dealership_id = car.dealership_id

    if not dealership_id:
        default_dealer = db.query(models.Dealership).filter(models.Dealership.is_active == True).first()
        if default_dealer:
            dealership_id = default_dealer.id

    new_appointment = models.Appointment(
        vehicle_id=data.vehicle_id,
        customer_name=data.customer_name,
        phone_number=data.phone_number,
        preferred_channel=data.preferred_channel,
        appointment_type=data.appointment_type,
        date=data.date,
        time_slot=data.time_slot,
        notes=data.notes,
        dealership_id=dealership_id,
        status="Pending"
    )
    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)

    await send_telegram_alert(new_appointment, car_title, car_price, dealership_id=dealership_id, db=db)
    # Optional team alert (Settings -> Telegram): fire and forget, own DB session.
    asyncio.get_running_loop().run_in_executor(
        None, team_alerts.send_standalone, "appointment_alert", "appointment", new_appointment.id, car_title)

    # Attach vehicle_title to the output object
    setattr(new_appointment, "vehicle_title", car_title)
    return new_appointment


@app.post("/api/vehicles/{vehicle_id}/inquire", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
async def inquire_vehicle(vehicle_id: int, data: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    data.vehicle_id = vehicle_id
    return await create_appointment(data, db)


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/send-otp", response_model=schemas.SendOTPResponse, response_model_exclude_none=True)
async def send_otp(req: schemas.SendOTPRequest, db: Session = Depends(get_db)):
    """Dispatches 6-digit OTP via AfroMessage SMS or prompts user."""
    return await request_otp(req, db)


@app.post("/api/auth/request-otp", response_model=schemas.SendOTPResponse, response_model_exclude_none=True)
async def handle_request_otp(req: schemas.SendOTPRequest, db: Session = Depends(get_db)):
    """Alias for request_otp endpoint."""
    return await request_otp(req, db)


@app.post("/api/auth/verify-otp", response_model=schemas.AuthResponse)
def handle_verify_otp(req: schemas.VerifyOTPRequest, db: Session = Depends(get_db)):
    """Verifies unexpired, unused 6-digit OTP code without mock dev bypass."""
    return verify_otp(req, db)


@app.post("/api/auth/link-telegram")
def link_telegram_chat(
    req: schemas.LinkTelegramRequest,
    db: Session = Depends(get_db),
    _superadmin: models.User = Depends(get_current_superadmin),
):
    """
    Links a phone number to a specific Telegram Chat ID for testing or bot integration.
    SuperAdmin only: without auth, anyone could redirect another admin's login OTP
    to their own Telegram chat.
    """
    normalized_phone = normalize_ethiopian_phone(req.phone_number)
    chat_id = req.telegram_chat_id.strip()

    TELEGRAM_LINKED_CHATS[normalized_phone] = chat_id

    # Persist to User and/or Dealership if exists
    user = db.query(models.User).filter(models.User.phone_number == normalized_phone).first()
    if user:
        user.telegram_chat_id = chat_id
        if user.dealership and not user.dealership.telegram_chat_id:
            user.dealership.telegram_chat_id = chat_id
        db.commit()

    return {
        "status": "linked",
        "phone_number": normalized_phone,
        "telegram_chat_id": chat_id,
        "message": f"Phone +{normalized_phone} successfully linked to Telegram Chat ID {chat_id}"
    }


@app.post("/api/telegram/webhook")
async def telegram_webhook(
    payload: dict,
    x_telegram_bot_api_secret_token: Optional[str] = Header(default=None),
):
    """
    Production entry point for Telegram updates (/start links, gate-pass buttons, reject notes).
    If TELEGRAM_WEBHOOK_SECRET is set, requests must carry the matching
    X-Telegram-Bot-Api-Secret-Token header (setWebhook ... secret_token=...).
    The dev long-poller feeds the very same gate_pass.process_update().
    """
    expected_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip().strip("\"'")
    if expected_secret and x_telegram_bot_api_secret_token != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    await asyncio.to_thread(gate_pass.process_update_standalone, payload)
    return {"ok": True, "status": "ok"}


async def telegram_polling_worker():
    """
    Long-polling (getUpdates) for local development, where Telegram can't reach the webhook.
    Same handler as the webhook. If a webhook is set on this bot, Telegram answers 409 and
    nothing is polled (production keeps its webhook).
    """
    bot_token = gate_pass.bot_token()
    if not bot_token or "your_" in bot_token:
        print("🤖 [TELEGRAM] No bot token: poller not started.")
        return
    offset = 0
    print(f"🤖 [TELEGRAM] Long-polling @{gate_pass.bot_username()} for /start links and gate-pass buttons...")
    while True:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.telegram.org/bot{bot_token}/getUpdates",
                    params={"offset": offset, "timeout": 25,
                            "allowed_updates": json.dumps(["message", "callback_query"])},
                    timeout=35.0,
                )
            if resp.status_code == 200:
                for update in resp.json().get("result", []):
                    offset = update["update_id"] + 1
                    await asyncio.to_thread(gate_pass.process_update_standalone, update)
            elif resp.status_code == 409:
                print("🤖 [TELEGRAM] 409: this bot has a webhook set, so polling is off. "
                      "Use a separate test bot locally (see DEPLOY_YEGARA.md).")
                await asyncio.sleep(60)
            else:
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[TELEGRAM] poll error: {e}")
            await asyncio.sleep(5)


@app.on_event("startup")
async def start_telegram_poller():
    # TELEGRAM_POLLING=true forces the poller (dev.ps1 -Telegram); =false disables it.
    # Otherwise it runs except in tests (production: Telegram answers 409 while the webhook is set).
    polling = os.getenv("TELEGRAM_POLLING", "").strip().lower()
    if polling == "true" or (polling != "false" and os.getenv("TESTING") != "true"):
        asyncio.create_task(telegram_polling_worker())


@app.get("/api/admin/me", response_model=schemas.UserOut)
def get_current_admin_profile(current_admin: models.User = Depends(get_current_admin)):
    return current_admin


# ==========================================
# ADMIN INVENTORY ENDPOINTS (PROTECTED)
# ==========================================

@app.get("/api/admin/vehicles", response_model=List[schemas.VehicleOut])
def get_admin_vehicles(
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_vehicles)
):
    if dealership_id is not None and not current_user.is_superadmin:
        if dealership_id != current_user.dealership_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Tenant switching restricted to SuperAdmin"
            )
    query = db.query(models.Vehicle)
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if target_id:
        query = query.filter(models.Vehicle.dealership_id == target_id)
    return query.order_by(models.Vehicle.created_at.desc()).all()


@app.post("/api/admin/vehicles", response_model=schemas.VehicleOut, status_code=status.HTTP_201_CREATED)
@app.post("/api/vehicles", response_model=schemas.VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    car_data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_vehicles)
):
    if not current_user.is_superadmin:
        if not current_user.dealership_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: User is not associated with any dealership."
            )
        assigned_dealership_id = current_user.dealership_id
    else:
        assigned_dealership_id = getattr(car_data, "dealership_id", None) or current_user.dealership_id
        if not assigned_dealership_id:
            default_dealer = db.query(models.Dealership).filter(models.Dealership.is_active == True).first()
            if default_dealer:
                assigned_dealership_id = default_dealer.id

    resolved_cash = car_data.cash_price if car_data.cash_price is not None else car_data.down_payment
    resolved_loan = car_data.bank_loan_amount if car_data.bank_loan_amount is not None else car_data.bank_loan

    resolved_listing_type = car_data.listing_type or "sale"
    resolved_daily_rate = (
        car_data.rental_daily_rate
        if car_data.rental_daily_rate is not None
        else (car_data.daily_rental_rate or car_data.daily_rate)
    )
    if resolved_listing_type in ("rent", "both"):
        if not resolved_daily_rate or resolved_daily_rate <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="እባክዎ የቀን የኪራይ ዋጋ ያስገቡ (Daily rental rate is required for rentals)"
            )

    vehicle = models.Vehicle(
        make=car_data.make,
        model=car_data.model,
        year=car_data.year,
        price=car_data.price,
        mileage=car_data.mileage,
        condition=car_data.condition,
        fuel_type=car_data.fuel_type,
        transmission=car_data.transmission,
        body_type=car_data.body_type,
        engine_size=car_data.engine_size,
        drive_train=car_data.drive_train,
        exterior_color=car_data.exterior_color,
        customs_cleared=car_data.customs_cleared,
        features=car_data.features,
        description=car_data.description,
        status=car_data.status,
        has_bank_loan=car_data.has_bank_loan,
        cash_price=resolved_cash,
        bank_loan_amount=resolved_loan,
        bank_name=car_data.bank_name,
        plate_status=car_data.plate_status,
        dealership_id=assigned_dealership_id,
        listing_type=resolved_listing_type,
        rental_daily_rate=resolved_daily_rate,
        rental_available=car_data.rental_available if car_data.rental_available is not None else True,
        with_driver_only=car_data.with_driver_only if car_data.with_driver_only is not None else False,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)

    for idx, url in enumerate(car_data.image_urls):
        img = models.VehicleImage(
            vehicle_id=vehicle.id,
            image_url=sanitize_image_url(url),
            is_cover=(idx == 0),
            display_order=idx
        )
        db.add(img)
    db.commit()
    db.refresh(vehicle)

    return vehicle


@app.put("/api/admin/vehicles/{vehicle_id}", response_model=schemas.VehicleOut)
@app.put("/api/vehicles/{vehicle_id}", response_model=schemas.VehicleOut)
def update_vehicle(
    vehicle_id: int,
    car_data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_vehicles)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not current_user.is_superadmin and vehicle.dealership_id != current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to modify vehicles belonging to another dealership."
        )

    vehicle.make = car_data.make
    vehicle.model = car_data.model
    vehicle.year = car_data.year
    vehicle.price = car_data.price
    vehicle.mileage = car_data.mileage
    vehicle.condition = car_data.condition
    vehicle.fuel_type = car_data.fuel_type
    vehicle.transmission = car_data.transmission
    vehicle.body_type = car_data.body_type
    vehicle.engine_size = car_data.engine_size
    vehicle.drive_train = car_data.drive_train
    vehicle.exterior_color = car_data.exterior_color
    vehicle.customs_cleared = car_data.customs_cleared
    vehicle.description = car_data.description
    vehicle.status = car_data.status
    vehicle.has_bank_loan = car_data.has_bank_loan
    vehicle.cash_price = car_data.cash_price if car_data.cash_price is not None else car_data.down_payment
    vehicle.bank_loan_amount = car_data.bank_loan_amount if car_data.bank_loan_amount is not None else car_data.bank_loan
    vehicle.bank_name = car_data.bank_name
    vehicle.plate_status = car_data.plate_status
    target_listing_type = car_data.listing_type if car_data.listing_type is not None else vehicle.listing_type
    target_daily_rate = (
        car_data.rental_daily_rate
        if car_data.rental_daily_rate is not None
        else (car_data.daily_rental_rate or car_data.daily_rate or vehicle.rental_daily_rate)
    )
    if target_listing_type in ("rent", "both"):
        if not target_daily_rate or target_daily_rate <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="እባክዎ የቀን የኪራይ ዋጋ ያስገቡ (Daily rental rate is required for rentals)"
            )

    if car_data.listing_type is not None:
        vehicle.listing_type = car_data.listing_type
    if car_data.rental_daily_rate is not None:
        vehicle.rental_daily_rate = car_data.rental_daily_rate
    elif car_data.daily_rental_rate is not None:
        vehicle.rental_daily_rate = car_data.daily_rental_rate
    elif car_data.daily_rate is not None:
        vehicle.rental_daily_rate = car_data.daily_rate
    if car_data.rental_available is not None:
        vehicle.rental_available = car_data.rental_available
    if car_data.with_driver_only is not None:
        vehicle.with_driver_only = car_data.with_driver_only

    if car_data.image_urls is not None:
        db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == vehicle.id).delete()
        for idx, url in enumerate(car_data.image_urls):
            img = models.VehicleImage(
                vehicle_id=vehicle.id,
                image_url=sanitize_image_url(url),
                is_cover=(idx == 0),
                display_order=idx
            )
            db.add(img)

    db.commit()
    db.refresh(vehicle)
    return vehicle


@app.post("/api/admin/upload-images", response_model=List[str])
def upload_car_images(
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(require_vehicles)
):
    # Plain `def` on purpose: FastAPI runs it in a worker thread, so the blocking
    # Pillow WebP encode, S3 put_object and disk write don't stall the event loop
    # (under a2wsgi each worker has a single loop shared by every request).
    saved_urls = []
    dealer_prefix = f"car_{current_user.dealership_id or 'anon'}"

    for file in files:
        file_bytes = file.file.read()
        url = upload_media_file(file_bytes, prefix=dealer_prefix, max_width=1600, quality=80)
        saved_urls.append(url)

    return saved_urls


@app.patch("/api/admin/vehicles/{vehicle_id}/status")
@app.patch("/api/vehicles/{vehicle_id}/status")
def update_vehicle_status(
    vehicle_id: int,
    new_status: models.VehicleStatus,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_vehicles)
):
    car = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not current_user.is_superadmin and car.dealership_id != current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to modify vehicles belonging to another dealership."
        )

    car.status = new_status
    db.commit()
    return {"message": "Status updated successfully", "status": new_status}


@app.delete("/api/admin/vehicles/{vehicle_id}")
@app.delete("/api/vehicles/{vehicle_id}")
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_vehicles)
):
    car = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not current_user.is_superadmin and car.dealership_id != current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to delete vehicles belonging to another dealership."
        )

    # 1. Clean up associated physical image files from static/uploads/ if physical files exist
    for img in car.images:
        if img.image_url:
            try:
                delete_media_file(img.image_url)
            except Exception as e:
                print(f"Notice: Failed to delete image file {img.image_url}: {e}")

    # 2. Delete related records from rental_bookings where vehicle_id = id
    db.query(models.RentalBooking).filter(models.RentalBooking.vehicle_id == vehicle_id).delete(synchronize_session=False)

    # 3. Delete related records from appointments or inquiries where vehicle_id = id
    db.query(models.Appointment).filter(models.Appointment.vehicle_id == vehicle_id).delete(synchronize_session=False)

    # 4. Execute db.delete(car) and commit the transaction cleanly
    db.delete(car)
    db.commit()
    return {"message": f"Vehicle #{vehicle_id} deleted successfully"}


@app.get("/api/admin/appointments", response_model=List[schemas.AppointmentOut])
def get_all_appointments(
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_appointments)
):
    if dealership_id is not None and not current_user.is_superadmin:
        if dealership_id != current_user.dealership_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Tenant switching restricted to SuperAdmin"
            )
    query = db.query(models.Appointment)
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if target_id:
        query = query.filter(models.Appointment.dealership_id == target_id)
    appointments = query.order_by(models.Appointment.created_at.desc()).all()
    for a in appointments:
        _attach_vehicle_title(a)
    return appointments


def _attach_vehicle_title(a: models.Appointment) -> models.Appointment:
    if a.vehicle:
        setattr(a, "vehicle_title", f"{a.vehicle.year} {a.vehicle.make} {a.vehicle.model}")
    else:
        setattr(a, "vehicle_title", "General Showroom Inquiry")
    return a


def _appointment_for_user(appointment_id: int, db: Session, user: models.User) -> models.Appointment:
    """The appointment, if it belongs to the user's dealership (superadmins: any). Else 404."""
    a = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not a or (not user.is_superadmin and a.dealership_id != user.dealership_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    return a


@app.patch("/api/admin/appointments/{appointment_id}/status", response_model=schemas.AppointmentOut)
def update_appointment_status(
    appointment_id: int,
    payload: schemas.AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_appointments)
):
    """New (stored as "Pending") / Confirmed / Done / Cancelled / No-show."""
    value = (payload.status or "").strip()
    if value.lower() == "new":
        value = "Pending"
    if value not in models.APPOINTMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status '{payload.status}'.")
    a = _appointment_for_user(appointment_id, db, current_user)
    a.status = value
    db.commit()
    db.refresh(a)
    return _attach_vehicle_title(a)


@app.post("/api/admin/appointments/{appointment_id}/archive", response_model=schemas.AppointmentOut)
def archive_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_appointments)
):
    """Soft delete: hidden from Upcoming/Past and the tab count; Restore brings it back."""
    a = _appointment_for_user(appointment_id, db, current_user)
    if a.archived_at is None:
        a.archived_at = datetime.utcnow()
        a.archived_by = current_user.full_name or current_user.phone_number
        db.commit()
        db.refresh(a)
    return _attach_vehicle_title(a)


@app.post("/api/admin/appointments/{appointment_id}/restore", response_model=schemas.AppointmentOut)
def restore_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_appointments)
):
    a = _appointment_for_user(appointment_id, db, current_user)
    a.archived_at = None
    a.archived_by = None
    db.commit()
    db.refresh(a)
    return _attach_vehicle_title(a)


@app.delete("/api/admin/appointments/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment_permanently(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """Owner only, and only for an archived appointment (archive first, then delete)."""
    a = _appointment_for_user(appointment_id, db, current_user)
    if a.archived_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Archive the appointment before deleting it permanently.")
    db.delete(a)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==========================================
# DEALER SETTINGS & TELEGRAM ROUTING
# ==========================================

@app.get("/api/admin/dealership", response_model=schemas.DealershipOut)
def get_admin_dealership(
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    if dealership_id is not None and not current_user.is_superadmin:
        if dealership_id != current_user.dealership_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Tenant switching restricted to SuperAdmin"
            )
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealership linked to current admin account."
        )

    dealer = db.query(models.Dealership).filter(models.Dealership.id == target_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dealership record not found."
        )

    # telegram_bot_username is the value stored in Settings (empty = use .env). The bot actually
    # used is shown by GET /api/superadmin/telegram/status.
    out = schemas.DealershipOut.model_validate(dealer)
    if not current_user.is_superadmin:
        # Staff need name/slug/logo/phones for the /admin header, flyers and share text,
        # but the Telegram credentials are owner-only settings.
        out = out.model_copy(update={"telegram_bot_token": None, "telegram_chat_id": None})
    return out


@app.put("/api/admin/dealership", response_model=schemas.DealershipOut)
def update_admin_dealership(
    payload: schemas.DealershipUpdate,
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    if dealership_id is not None and not current_user.is_superadmin:
        if dealership_id != current_user.dealership_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Tenant switching restricted to SuperAdmin"
            )
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealership linked to current admin account."
        )

    dealer = db.query(models.Dealership).filter(models.Dealership.id == target_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dealership record not found."
        )

    if payload.name is not None and payload.name.strip():
        dealer.name = payload.name.strip()
    if payload.phone_number is not None:
        dealer.phone_number = payload.phone_number.strip() if payload.phone_number.strip() else None
    if payload.phone_number_2 is not None:
        dealer.phone_number_2 = payload.phone_number_2.strip() if payload.phone_number_2.strip() else None
    if payload.email is not None:
        dealer.email = payload.email.strip() or None
    if payload.logo_url is not None:
        dealer.logo_url = payload.logo_url.strip() if payload.logo_url.strip() else None
    if payload.telegram_bot_token is not None:
        dealer.telegram_bot_token = payload.telegram_bot_token.strip() if payload.telegram_bot_token.strip() else None
    if payload.telegram_chat_id is not None:
        dealer.telegram_chat_id = payload.telegram_chat_id.strip() if payload.telegram_chat_id.strip() else None
    if hasattr(payload, "telegram_bot_username") and payload.telegram_bot_username is not None:
        raw_user = payload.telegram_bot_username.strip()
        clean_user = tg_config.normalize_username(raw_user)
        if raw_user and not clean_user:
            raise HTTPException(status_code=400, detail=f"'{raw_user}' is not a valid bot username (e.g. AcWaleBot).")
        dealer.telegram_bot_username = clean_user or None

    db.commit()
    db.refresh(dealer)
    tg_config.invalidate()
    return dealer


@app.post("/api/admin/dealership/disconnect-telegram", response_model=schemas.DealershipOut)
def disconnect_dealership_telegram(
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """
    Clears all Telegram bot credentials (token, chat_id, username) from the dealership record.
    Allows the client or owner to disconnect testing bots and connect their own bot cleanly.
    """
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealership linked to current admin account."
        )

    dealer = db.query(models.Dealership).filter(models.Dealership.id == target_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dealership record not found."
        )

    dealer.telegram_bot_token = None
    dealer.telegram_chat_id = None
    dealer.telegram_bot_username = None
    db.commit()
    db.refresh(dealer)
    tg_config.invalidate()
    logger.info(f"Telegram credentials successfully disconnected and cleared for dealership '{dealer.name}' (ID: {dealer.id})")
    return dealer


@app.post("/api/admin/switch-dealership")
@app.post("/api/superadmin/switch-dealership")
def switch_dealership(
    payload: Optional[schemas.SwitchDealershipRequest] = None,
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """
    STRICTLY GUARDED: Tenant switching restricted to SuperAdmin.
    If a non-superadmin user calls this endpoint, immediately return HTTP 403 Forbidden.
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

    from auth import create_access_token
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
            phone_number_2=target_dealer.phone_number_2,
            email=target_dealer.email,
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


@app.post("/api/admin/dealership/logo", response_model=schemas.DealershipOut)
async def upload_dealership_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    if not current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealership linked to current admin account."
        )

    dealer = db.query(models.Dealership).filter(models.Dealership.id == current_user.dealership_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dealership record not found."
        )

    file_bytes = await file.read()
    logo_url = upload_media_file(file_bytes, prefix=f"logo_{dealer.id}", max_width=1000, quality=85)
    dealer.logo_url = sanitize_image_url(logo_url)
    db.commit()
    db.refresh(dealer)

    return dealer


@app.post("/api/admin/dealership/test-telegram", response_model=schemas.TelegramTestResponse)
@app.post("/api/admin/telegram/test", response_model=schemas.TelegramTestResponse)
async def test_telegram_alert(
    payload: Optional[schemas.TelegramTestRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    if not current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No dealership associated with current user."
        )

    dealer = db.query(models.Dealership).filter(models.Dealership.id == current_user.dealership_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dealership not found."
        )

    # 1. Prefer credentials supplied directly in test request body (testing before save)
    bot_token = None
    chat_id = None
    if payload:
        if payload.telegram_bot_token and payload.telegram_bot_token.strip():
            bot_token = payload.telegram_bot_token.strip()
        elif payload.bot_token and payload.bot_token.strip():
            bot_token = payload.bot_token.strip()

        if payload.telegram_chat_id and payload.telegram_chat_id.strip():
            chat_id = payload.telegram_chat_id.strip()
        elif payload.chat_id and payload.chat_id.strip():
            chat_id = payload.chat_id.strip()

    # 2. Fall back to saved dealer credentials
    if not bot_token and dealer.telegram_bot_token and dealer.telegram_bot_token.strip():
        bot_token = dealer.telegram_bot_token.strip()
    if not bot_token:
        bot_token = tg_config.token(db)

    if not chat_id and dealer.telegram_chat_id:
        chat_id = dealer.telegram_chat_id.strip()

    if not bot_token or not bot_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="የቦት ቶከን አልገባም። እባክዎ ከ @BotFather ያገኙትን የቦት ቶከን (Bot Token) ያስገቡ። (Please enter your Bot Token from @BotFather)."
        )

    if not chat_id or not chat_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="የቴሌግራም ቻት መለያ (Chat ID) አልገባም። እባክዎ የቻት መለያ ቁጥርዎን ያስገቡ። (Please enter your Telegram Chat ID)."
        )

    test_message = (
        "🔔 *የቴሌግራም ቦት ማረጋገጫ (Bot Verified)*\n\n"
        f"🏢 *ድርጅት:* {dealer.name}\n"
        "✅ *ሁኔታ:* ቦቱ በተሳካ ሁኔታ ተገናኝቷል!\n\n"
        "የደንበኞች አዲስ የቀጠሮ ጥያቄዎች (Appointments) እና መልእክቶች በቀጥታ ወደዚህ ቻት ይደርሳሉ።"
    )

    payload_data = {
        "chat_id": chat_id,
        "text": test_message,
        "parse_mode": "Markdown"
    }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload_data, timeout=8.0)
            if resp.status_code == 200:
                return schemas.TelegramTestResponse(
                    success=True,
                    message=f"የሙከራ መልእክት በተሳካ ሁኔታ ወደ Telegram Chat ID ({chat_id}) ተልኳል! (Test alert sent successfully!)"
                )
            else:
                try:
                    err_desc = resp.json().get("description", resp.text)
                except Exception:
                    err_desc = resp.text
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Telegram API Error ({resp.status_code}): {err_desc}"
                )
        except HTTPException:
            raise
        except Exception as e:
            err_str = str(e)
            if "WinError 10060" in err_str or "timed out" in err_str.lower():
                detail_msg = (
                    "የአውታረ መረብ ግንኙነት ችግር (Connection Timeout): ወደ api.telegram.org መገናኘት አልተቻለም። "
                    "በኢትዮጵያ ውስጥ በኮምፒውተርዎ ላይ VPN ካልበራ በቀጥታ ቴሌግራም ሊዘጋ ይችላል። "
                    "በሰርቨሩ (Production VPS) ላይ ግን ቴሌግራም ያለምንም ገደብ በቀጥታ ይሰራል!"
                )
            else:
                detail_msg = f"Network error connecting to Telegram: {err_str}"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail_msg
            )


# ==========================================
# SUPERADMIN MASTER PORTAL ENDPOINTS (TRACK 2)
# ==========================================

@app.get("/api/superadmin/stats", response_model=schemas.SuperAdminStatsOut)
def get_superadmin_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
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

    total_dealerships = db.query(models.Dealership).count()
    total_val = db.query(func.coalesce(func.sum(models.Vehicle.price), 0.0)).scalar()

    return schemas.SuperAdminStatsOut(
        sales_count=sales_count,
        rental_count=rental_count,
        drivers_count=drivers_count,
        leads_count=leads_count,
        total_sales_inventory=sales_count,
        active_rental_fleet=rental_count,
        registered_drivers=drivers_count,
        total_leads_bookings=leads_count,
        total_dealerships=total_dealerships,
        total_active_listings=sales_count,
        total_inventory_value=float(total_val or 0.0),
        total_leads_generated=leads_count
    )


@app.get("/api/superadmin/executive-stats", response_model=schemas.ExecutiveStatsOut)
def get_superadmin_executive_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    primary_dealer = get_primary_dealership(db)

    # Card 1: Total Sales Inventory (listing_type in ('sale', 'both'))
    sales_count = db.query(models.Vehicle).filter(
        models.Vehicle.listing_type.in_(["sale", "both"])
    ).count()

    # Card 2: Active Rental Fleet (listing_type in ('rent', 'both'))
    rental_count = db.query(models.Vehicle).filter(
        models.Vehicle.listing_type.in_(["rent", "both"])
    ).count()

    # Card 3: Registered Drivers (records in drivers where is_active == True)
    # Team members with the Driver role (the old drivers table is no longer used).
    drivers_count = sum(1 for u in db.query(models.User).filter(models.User.is_active == True).all()
                        if not u.is_superadmin and u.has_role("driver"))

    # Card 4: Total Customer Inquiries & Rental Bookings
    sales_inquiries = db.query(models.Appointment).count()
    rental_bookings = db.query(models.RentalBooking).count()
    leads_count = sales_inquiries + rental_bookings

    total_val = db.query(func.coalesce(func.sum(models.Vehicle.price), 0.0)).scalar() or 0.0

    return schemas.ExecutiveStatsOut(
        sales_inventory=sales_count,
        rental_fleet=rental_count,
        active_drivers=drivers_count,
        total_inquiries_and_bookings=leads_count,
        total_sales_inquiries=sales_inquiries,
        total_rental_bookings=rental_bookings,
        total_inventory_value=float(total_val),
        dealership_name=primary_dealer.name if primary_dealer else "AC WALE MARKET",
        sales_count=sales_count,
        rental_count=rental_count,
        drivers_count=drivers_count,
        leads_count=leads_count,
        total_sales_inventory=sales_count,
        active_rental_fleet=rental_count,
        registered_drivers=drivers_count,
        total_leads_bookings=leads_count,
    )


def _staff_or_404(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return user


def _reject_owner_edit(user: models.User):
    if user.is_superadmin:
        raise HTTPException(
            status_code=400,
            detail="Owner accounts are managed by SUPERADMIN_PHONE in the server .env, not here.",
        )


def _clean_permissions(perms) -> str:
    unknown = [p for p in (perms or []) if p not in models.STAFF_PERMISSIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permission(s): {', '.join(unknown)}")
    return models.encode_permissions(perms)


def _apply_access(user: models.User, permissions=None, field_roles=None):
    """
    Web permissions (vehicles / appointments / rentals) + field roles (driver / gatekeeper).
    The legacy "gate" permission is accepted and stored as the Gatekeeper role.
    None = leave that part unchanged.
    """
    roles = set(user.field_roles)
    if field_roles is not None:
        unknown = [r for r in field_roles if r not in models.FIELD_ROLES]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown role(s): {', '.join(unknown)}")
        roles = set(field_roles)
    if permissions is not None:
        _clean_permissions(permissions)  # validates
        if "gate" in permissions:
            roles.add("gatekeeper")
        user.permissions_json = models.encode_permissions([p for p in permissions if p in models.WEB_PERMISSIONS])
    else:
        # Drop a legacy "gate" entry: the role now lives in field_roles.
        user.permissions_json = models.encode_permissions(user.web_permissions)
    user.field_roles_json = models.encode_field_roles(roles)


@app.get("/api/superadmin/staff", response_model=List[schemas.StaffUserOut])
def get_superadmin_staff(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """Owners first, then active staff, then deactivated staff (nothing is ever hard-deleted)."""
    primary_dealer = get_primary_dealership(db)
    dealer_id = primary_dealer.id if primary_dealer else 1
    users = db.query(models.User).filter(
        (models.User.dealership_id == dealer_id) | (models.User.dealership_id == None)
    ).order_by(models.User.created_at.desc()).all()
    return sorted(users, key=lambda u: (not u.is_superadmin, not u.is_active))


@app.post("/api/superadmin/staff", response_model=schemas.StaffUserOut)
def invite_or_create_staff(
    payload: schemas.StaffInviteRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """Add a staff member (name + phone + permissions + active). Re-adding a known phone updates it."""
    from auth import normalize_ethiopian_phone, find_user_by_phone
    norm_phone = normalize_ethiopian_phone(payload.phone_number)
    if is_superadmin_phone(norm_phone):
        raise HTTPException(status_code=400, detail="This is an owner number (SUPERADMIN_PHONE); owners already have full access.")
    _clean_permissions(payload.permissions)

    primary_dealer = get_primary_dealership(db)
    dealer_id = primary_dealer.id if primary_dealer else 1

    user = find_user_by_phone(norm_phone, db)
    if user is None:
        # New members start with nothing ticked (Appointments OFF until the owner ticks it).
        user = models.User(phone_number=norm_phone, role="dealer_admin", permissions_json="[]",
                           created_at=datetime.utcnow())
        db.add(user)
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    user.role = "dealer_admin"
    _apply_access(user, payload.permissions or [], payload.field_roles if payload.field_roles is not None else [])
    user.is_active = payload.is_active
    user.dealership_id = dealer_id
    db.commit()
    db.refresh(user)
    return user


@app.put("/api/superadmin/staff/{user_id}", response_model=schemas.StaffUserOut)
def update_staff_member(
    user_id: int,
    payload: schemas.StaffUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """Edit name, phone, permissions and/or the active flag of a staff member."""
    from auth import normalize_ethiopian_phone, find_user_by_phone
    user = _staff_or_404(db, user_id)
    _reject_owner_edit(user)

    if payload.phone_number is not None:
        norm_phone = normalize_ethiopian_phone(payload.phone_number)
        if is_superadmin_phone(norm_phone):
            raise HTTPException(status_code=400, detail="This is an owner number (SUPERADMIN_PHONE).")
        other = find_user_by_phone(norm_phone, db)
        if other and other.id != user.id:
            raise HTTPException(status_code=409, detail="Another account already uses this phone number.")
        user.phone_number = norm_phone
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    if payload.permissions is not None or payload.field_roles is not None:
        _apply_access(user, payload.permissions, payload.field_roles)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@app.patch("/api/superadmin/staff/{user_id}/status", response_model=schemas.StaffUserOut)
def update_staff_status(
    user_id: int,
    payload: schemas.StaffStatusRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """Active toggle. Takes effect on the staff member's very next request."""
    user = _staff_or_404(db, user_id)
    _reject_owner_edit(user)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/superadmin/staff/{user_id}", response_model=schemas.StaffUserOut)
def delete_staff_member(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """
    Soft delete = deactivate. Staff rows are never removed, so their names stay on intake
    records, gate passes and handover contracts.
    """
    user = _staff_or_404(db, user_id)
    _reject_owner_edit(user)
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


class OwnerProfileUpdate(BaseModel):
    full_name: str


@app.put("/api/superadmin/me", response_model=schemas.StaffUserOut)
def update_own_owner_profile(
    payload: OwnerProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """A superadmin sets their OWN display name. Owner permissions come from SUPERADMIN_PHONE
    and can't be edited; other owners' names are theirs to change."""
    name = (payload.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name can't be empty.")
    current_user.full_name = name[:150]
    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/api/superadmin/staff/{user_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def remove_staff_member_permanently(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """
    Owner only: remove a staff account completely (login, permissions, Telegram link, OTPs).
    Names already printed on intake records, gate passes and handovers are stored as text,
    so those documents keep them. Owners can't be removed.
    """
    user = _staff_or_404(db, user_id)
    _reject_owner_edit(user)
    db.query(models.TelegramLinkToken).filter(models.TelegramLinkToken.user_id == user.id).delete(synchronize_session=False)
    db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == user.phone_number).delete(synchronize_session=False)
    # Staff documents keep the person's name as text; only the Team link is cleared.
    db.query(models.Document).filter(models.Document.staff_user_id == user.id).update(
        {models.Document.staff_user_id: None}, synchronize_session=False)
    db.delete(user)
    db.commit()
    logger.info(f"Staff #{user_id} permanently removed by owner #{current_user.id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/superadmin/dealerships", response_model=List[schemas.SuperAdminDealershipOut])
def get_superadmin_dealerships(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    dealerships = db.query(models.Dealership).order_by(models.Dealership.created_at.desc()).all()
    results = []
    for d in dealerships:
        v_count = db.query(models.Vehicle).filter(models.Vehicle.dealership_id == d.id).count()
        user = db.query(models.User).filter(models.User.dealership_id == d.id).first()
        results.append(
            schemas.SuperAdminDealershipOut(
                id=d.id,
                name=d.name,
                slug=d.slug,
                phone_number=d.phone_number,
                logo_url=d.logo_url,
                created_at=d.created_at,
                subscription_plan=d.subscription_plan or "starter",
                max_vehicles=d.max_vehicles or 50,
                is_active=d.is_active if d.is_active is not None else True,
                vehicle_count=v_count,
                user_phone_number=user.phone_number if user else d.phone_number
            )
        )
    return results


@app.patch("/api/superadmin/dealerships/{dealership_id}/status", response_model=schemas.SuperAdminDealershipOut)
def update_dealership_status(
    dealership_id: int,
    payload: schemas.SuperAdminDealershipStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    dealer = db.query(models.Dealership).filter(models.Dealership.id == dealership_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dealership with ID {dealership_id} not found."
        )

    if payload.is_active is not None:
        dealer.is_active = payload.is_active
    if payload.subscription_plan is not None:
        dealer.subscription_plan = payload.subscription_plan
    if payload.max_vehicles is not None:
        dealer.max_vehicles = payload.max_vehicles

    db.commit()
    db.refresh(dealer)

    v_count = db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealer.id).count()
    user = db.query(models.User).filter(models.User.dealership_id == dealer.id).first()

    return schemas.SuperAdminDealershipOut(
        id=dealer.id,
        name=dealer.name,
        slug=dealer.slug,
        phone_number=dealer.phone_number,
        logo_url=dealer.logo_url,
        created_at=dealer.created_at,
        subscription_plan=dealer.subscription_plan or "starter",
        max_vehicles=dealer.max_vehicles or 50,
        is_active=dealer.is_active if dealer.is_active is not None else True,
        vehicle_count=v_count,
        user_phone_number=user.phone_number if user else dealer.phone_number
    )


@app.delete("/api/admin/dealerships/{dealership_id}")
@app.delete("/api/superadmin/dealerships/{dealership_id}")
def delete_dealership_cascade(
    dealership_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    """
    Cascade Deletion of Dealership:
    - Access Control: SuperAdmin only (403 for every staff account, including the dealer's own staff).
    - Cleans up physical vehicle images and logo files on disk.
    - Cascades DB deletion of appointments, vehicle images, vehicles, non-superadmin users, and the dealership itself.
    """
    # Superadmin only (enforced by the dependency): staff can no longer delete the dealership.

    dealer = db.query(models.Dealership).filter(models.Dealership.id == dealership_id).first()
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dealership with ID {dealership_id} not found."
        )

    # 1. Clean up physical images on disk
    vehicles = db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealership_id).all()
    vehicle_ids = [v.id for v in vehicles]

    for v in vehicles:
        for img in v.images:
            if img.image_url:
                delete_media_file(img.image_url)

    if dealer.logo_url:
        delete_media_file(dealer.logo_url)

    # 2. Cascade DB records in foreign key order:
    # A. Appointments
    if vehicle_ids:
        db.query(models.Appointment).filter(models.Appointment.vehicle_id.in_(vehicle_ids)).delete(synchronize_session=False)
    db.query(models.Appointment).filter(models.Appointment.dealership_id == dealership_id).delete(synchronize_session=False)

    # B. Vehicle Images
    if vehicle_ids:
        db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id.in_(vehicle_ids)).delete(synchronize_session=False)

    # C. Vehicles
    db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealership_id).delete(synchronize_session=False)

    # D. Associated non-superadmin users & auth credentials
    users = db.query(models.User).filter(models.User.dealership_id == dealership_id).all()
    for u in users:
        if u.role == "superadmin" or is_superadmin_phone(u.phone_number):
            u.dealership_id = None
        else:
            db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == u.phone_number).delete(synchronize_session=False)
            db.delete(u)

    # Clean up any OTP verifications matching dealer's phone
    if dealer.phone_number:
        clean_dealer_phone = "".join(filter(str.isdigit, dealer.phone_number))
        if clean_dealer_phone:
            db.query(models.OTPVerification).filter(models.OTPVerification.phone_number.like(f"%{clean_dealer_phone}%")).delete(synchronize_session=False)

    # E. Dealership itself
    db.delete(dealer)
    db.commit()

    logger.info(f"✓ Dealership '{dealer.name}' (#{dealership_id}) and all associated data permanently erased.")
    return {
        "status": "success",
        "message": "Dealership and all associated data deleted successfully."
    }



