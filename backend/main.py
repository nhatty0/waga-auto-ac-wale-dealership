import os
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
from fastapi import FastAPI, Depends, HTTPException, Query, status, UploadFile, File, Body
from fastapi.responses import JSONResponse
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
from settings import settings
from appointments import dispatch_lead_multichannel
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
    request_otp,
    verify_otp,
    rate_limiter,
    resolve_telegram_chat_id,
    dispatch_telegram_otp,
    handle_telegram_start_command,
    TELEGRAM_LINKED_CHATS
)

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
        bot_token = (
            (dealership.telegram_bot_token.strip() if dealership and dealership.telegram_bot_token and dealership.telegram_bot_token.strip() else None)
            or settings.TELEGRAM_PLATFORM_BOT_TOKEN
            or settings.TELEGRAM_BOT_TOKEN
        )
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
    title="Elite Motors API",
    description="Backend API for vehicle inventory, appointments, and dealer management",
    version="1.0.0"
)

# CORS configuration to allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Directories for static & uploaded files
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_UPLOADS_DIR = STATIC_DIR / "uploads"
STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

LEGACY_UPLOADS_DIR = BASE_DIR / "uploads"
LEGACY_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

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


# ==========================================
# PUBLIC INVENTORY & DEALERSHIP ENDPOINTS
# ==========================================

@app.get("/api/public/dealerships", response_model=List[schemas.DealershipPublicOut])
def get_public_dealerships(db: Session = Depends(get_db)):
    return db.query(models.Dealership).filter(models.Dealership.is_active == True).all()


@app.get("/api/public/dealerships/{slug}", response_model=schemas.DealershipPublicOut)
def get_public_dealership_by_slug(slug: str, db: Session = Depends(get_db)):
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
    dealership_slug: Optional[str] = None,
    dealership_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Vehicle)

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
def link_telegram_chat(req: schemas.LinkTelegramRequest, db: Session = Depends(get_db)):
    """
    Links a phone number to a specific Telegram Chat ID for testing or bot integration.
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


async def handle_telegram_connect_command(chat_id: str, text: str, db: Session) -> bool:
    """
    Handles deep-linked 1-Click Telegram connect: /start connect_<dealership_id>
    Links dealership.telegram_chat_id = chat_id and dispatches welcome confirmation message.
    """
    clean_text = text.strip()
    if "connect_" not in clean_text:
        return False

    raw_token = clean_text.split("connect_")[1].strip().split()[0]
    dealer = None
    if raw_token.isdigit():
        dealer = db.query(models.Dealership).filter(models.Dealership.id == int(raw_token)).first()
    if not dealer:
        dealer = db.query(models.Dealership).filter(models.Dealership.slug == raw_token).first()

    if not dealer:
        logger.warning(f"Dealership not found for connect command: {raw_token}")
        return False

    dealer.telegram_chat_id = str(chat_id)
    # Also link any users belonging to this dealership
    users = db.query(models.User).filter(models.User.dealership_id == dealer.id).all()
    for u in users:
        u.telegram_chat_id = str(chat_id)
    db.commit()

    bot_token = settings.TELEGRAM_PLATFORM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN
    welcome_text = "✅ ሰላም! የቴሌግራም አካውንትዎ ከ Waga Dealership Hub ጋር ተገናኝቷል። አዳዲስ ደንበኞች ቀጠሮ ሲይዙ ወይም ሲደውሉ እዚህ ማሳወቂያ ይደርስዎታ።"

    if bot_token and "your_" not in bot_token:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": welcome_text,
        }
        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json=payload, timeout=8.0)
        except Exception as e:
            logger.warning(f"Failed to send Telegram welcome message: {e}")

    logger.info(f"✓ Dealership '{dealer.name}' (ID: {dealer.id}) linked to Telegram chat {chat_id}")
    return True


@app.post("/api/telegram/webhook")
async def telegram_webhook(payload: dict, db: Session = Depends(get_db)):
    """
    Incoming webhook from Telegram bot to handle /start connect_<dealership_id>
    and /start link_<phone>.
    """
    message = payload.get("message", {})
    chat = message.get("chat", {})
    chat_id = str(chat.get("id", ""))
    text = message.get("text", "")

    if chat_id and text:
        if "connect_" in text:
            await handle_telegram_connect_command(chat_id, text, db)
        elif text.strip().startswith("/start"):
            await handle_telegram_start_command(chat_id, text, db)

    return {"ok": True, "status": "ok"}


async def telegram_polling_worker():
    """
    Continuous background long-poller for Telegram bot events.
    Automatically handles /start connect_<dealership_id> and /start link_<phone> deep-links.
    """
    bot_token = settings.TELEGRAM_PLATFORM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN
    if not bot_token or "your_" in bot_token:
        return

    offset = 0
    print("🤖 [TELEGRAM BOT] Background Poller started for deep-links & OTP dispatch...")
    while True:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.telegram.org/bot{bot_token}/getUpdates",
                    params={"offset": offset, "timeout": 4},
                    timeout=8.0
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for update in data.get("result", []):
                        update_id = update["update_id"]
                        offset = update_id + 1
                        message = update.get("message", {})
                        chat = message.get("chat", {})
                        chat_id = str(chat.get("id", ""))
                        text = message.get("text", "")
                        if chat_id and text:
                            from database import SessionLocal
                            with SessionLocal() as db:
                                if "connect_" in text:
                                    await handle_telegram_connect_command(chat_id, text, db)
                                elif text.strip().startswith("/start"):
                                    await handle_telegram_start_command(chat_id, text, db)
                elif resp.status_code == 409:
                    # Webhook is active on Telegram; polling is disabled
                    await asyncio.sleep(20)
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(4)
        await asyncio.sleep(0.5)


@app.on_event("startup")
async def start_telegram_poller():
    # Run Telegram poller as a detached background task if not running in test mode
    if os.getenv("TESTING") != "true":
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
    current_user: models.User = Depends(get_current_admin)
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
    current_user: models.User = Depends(get_current_admin)
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
    current_user: models.User = Depends(get_current_admin)
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
async def upload_car_images(
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(get_current_admin)
):
    saved_urls = []
    dealer_prefix = f"car_{current_user.dealership_id or 'anon'}"
    
    for file in files:
        file_bytes = await file.read()
        url = upload_media_file(file_bytes, prefix=dealer_prefix, max_width=1600, quality=80)
        saved_urls.append(url)

    return saved_urls


@app.patch("/api/admin/vehicles/{vehicle_id}/status")
@app.patch("/api/vehicles/{vehicle_id}/status")
def update_vehicle_status(
    vehicle_id: int,
    new_status: models.VehicleStatus,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
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
    current_user: models.User = Depends(get_current_admin)
):
    car = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not current_user.is_superadmin and car.dealership_id != current_user.dealership_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to delete vehicles belonging to another dealership."
        )

    db.delete(car)
    db.commit()
    return {"message": f"Vehicle #{vehicle_id} deleted successfully"}


@app.get("/api/admin/appointments", response_model=List[schemas.AppointmentOut])
def get_all_appointments(
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
    query = db.query(models.Appointment)
    target_id = dealership_id if (current_user.is_superadmin and dealership_id) else current_user.dealership_id
    if target_id:
        query = query.filter(models.Appointment.dealership_id == target_id)
    appointments = query.order_by(models.Appointment.created_at.desc()).all()
    for a in appointments:
        if a.vehicle:
            setattr(a, "vehicle_title", f"{a.vehicle.year} {a.vehicle.make} {a.vehicle.model}")
        else:
            setattr(a, "vehicle_title", "General Showroom Inquiry")
    return appointments


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

    # Attach central platform bot username for 1-click connect deep linking
    setattr(dealer, "telegram_bot_username", settings.TELEGRAM_PLATFORM_BOT_USERNAME)
    return dealer


@app.put("/api/admin/dealership", response_model=schemas.DealershipOut)
def update_admin_dealership(
    payload: schemas.DealershipUpdate,
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

    if payload.name is not None and payload.name.strip():
        dealer.name = payload.name.strip()
    if payload.phone_number is not None:
        dealer.phone_number = payload.phone_number.strip() if payload.phone_number.strip() else None
    if payload.logo_url is not None:
        dealer.logo_url = payload.logo_url.strip() if payload.logo_url.strip() else None
    if payload.telegram_bot_token is not None:
        dealer.telegram_bot_token = payload.telegram_bot_token.strip() if payload.telegram_bot_token.strip() else None
    if payload.telegram_chat_id is not None:
        dealer.telegram_chat_id = payload.telegram_chat_id.strip() if payload.telegram_chat_id.strip() else None

    db.commit()
    db.refresh(dealer)
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


@app.post("/api/admin/dealership/logo", response_model=schemas.DealershipOut)
async def upload_dealership_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
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
    current_user: models.User = Depends(get_current_admin)
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

    # 2. Fall back to platform bot token or dealer token
    if not bot_token and dealer.telegram_bot_token and dealer.telegram_bot_token.strip():
        bot_token = dealer.telegram_bot_token.strip()
    if not bot_token:
        bot_token = settings.TELEGRAM_PLATFORM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN

    if not chat_id and dealer.telegram_chat_id:
        chat_id = dealer.telegram_chat_id.strip()

    if not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ቴሌግራም ገና አልተገናኘም። እባክዎ መጀመሪያ 'ቴሌግራምን በአንድ ጠቅታ ያገናኙ' የሚለውን በመጫን ቴሌግራምዎን ያገናኙ። (Telegram is not connected. Please connect via 1-click button first.)"
        )

    if not bot_token or "your_" in bot_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform Telegram Bot Token is not configured."
        )

    test_message = (
        "🔔 *የቴሌግራም ቦት ማረጋገጫ (Bot Verified)*\n\n"
        f"ድርጅት: {dealer.name}\n"
        "ሁኔታ: ቦቱ በትክክል ተገናኝቷል! የደንበኞች ቀጠሮ እና ጥያቄዎች እዚህ ይደርሳሉ።"
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
                    message=f"Test alert sent successfully to Telegram Chat ID: {chat_id}!"
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Network error connecting to Telegram: {str(e)}"
            )


# ==========================================
# SUPERADMIN MASTER PORTAL ENDPOINTS (TRACK 2)
# ==========================================

@app.get("/api/superadmin/stats", response_model=schemas.SuperAdminStatsOut)
def get_superadmin_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_superadmin)
):
    total_dealerships = db.query(models.Dealership).count()
    total_active_listings = db.query(models.Vehicle).filter(
        models.Vehicle.status != models.VehicleStatus.SOLD
    ).count()
    total_val = db.query(func.coalesce(func.sum(models.Vehicle.price), 0.0)).scalar()
    total_leads = db.query(models.Appointment).count()

    return schemas.SuperAdminStatsOut(
        total_dealerships=total_dealerships,
        total_active_listings=total_active_listings,
        total_inventory_value=float(total_val or 0.0),
        total_leads_generated=total_leads
    )


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
    current_user: models.User = Depends(get_current_admin)
):
    """
    Cascade Deletion of Dealership:
    - Access Control: Requires SuperAdmin authorization OR matching authenticated dealer if self-deleting.
    - Cleans up physical vehicle images and logo files on disk.
    - Cascades DB deletion of appointments, vehicle images, vehicles, non-superadmin users, and the dealership itself.
    """
    is_superadmin = (
        current_user.role == "superadmin" and
        str(current_user.phone_number or "").strip().lstrip("+") == settings.SUPERADMIN_PHONE.strip().lstrip("+")
    )
    is_matching_dealer = (current_user.dealership_id == dealership_id)

    if not is_superadmin and not is_matching_dealer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to delete this dealership."
        )

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
        if u.role == "superadmin":
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



