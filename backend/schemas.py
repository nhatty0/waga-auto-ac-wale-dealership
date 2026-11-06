from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime
from models import VehicleStatus, AppointmentType, PlateType


# ==========================================
# DEALERSHIP SCHEMAS (PHASE 2: MULTI-TENANCY)
# ==========================================

class DealershipBase(BaseModel):
    name: str
    slug: str
    phone_number: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = True
    subscription_plan: Optional[str] = "starter"
    max_vehicles: Optional[int] = 50


class DealershipPublicOut(DealershipBase):
    id: int

    class Config:
        from_attributes = True


# ==========================================
# VEHICLE IMAGE SCHEMAS
# ==========================================

class ImageBase(BaseModel):
    image_url: str
    is_cover: bool = False
    display_order: int = 0


class ImageOut(ImageBase):
    id: int

    class Config:
        from_attributes = True


# ==========================================
# VEHICLE SCHEMAS
# ==========================================

class VehicleBase(BaseModel):
    make: str
    model: str
    year: int
    price: Optional[float] = None
    mileage: Optional[int] = 0
    condition: Optional[str] = "Slightly Used"
    fuel_type: str = "Gasoline"
    transmission: str = "Automatic"
    body_type: Optional[str] = "Sedan"
    engine_size: Optional[str] = None
    drive_train: Optional[str] = "FWD"
    exterior_color: Optional[str] = None
    customs_cleared: bool = True
    features: Optional[str] = None
    description: Optional[str] = None
    status: VehicleStatus = VehicleStatus.AVAILABLE
    has_bank_loan: Optional[bool] = False
    cash_price: Optional[float] = None
    down_payment: Optional[float] = None
    bank_loan_amount: Optional[float] = None
    bank_loan: Optional[float] = None
    bank_name: Optional[str] = None
    plate_status: Optional[str] = "Code 2"
    dealership_id: Optional[int] = None

    @field_validator("plate_status")
    @classmethod
    def validate_plate_status(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return "code_2"
        s = v.strip()
        low = s.lower()
        if low in ("unregistered", "ያልተለጠፈ"):
            return "unregistered"
        elif low in ("new_series", "new_digital", "aaa", "aab", "አዲስ ሰሌዳ") or low.startswith("new_series"):
            return s
        elif low in ("code_2", "code 2", "ኮድ 2"):
            return "code_2"
        elif low in ("code_3", "code 3", "ኮድ 3"):
            return "code_3"
        elif any(low.startswith(p) for p in ("aaa", "aab", "new_series")):
            return s
        return s

    @field_validator("price", "cash_price", "down_payment", "bank_loan_amount", "bank_loan")
    @classmethod
    def validate_non_negative_values(cls, v: Optional[float], info) -> Optional[float]:
        if v is not None and v < 0:
            field_name = info.field_name.replace("_", " ").title()
            raise ValueError(f"{field_name} must be greater than or equal to 0.")
        return v


class VehicleCreate(VehicleBase):
    # Strictly require at least one image URL
    image_urls: List[str] = Field(
        ..., 
        min_length=1, 
        description="At least one vehicle photo is required"
    )

    @field_validator("image_urls")
    @classmethod
    def validate_image_urls(cls, urls: List[str]) -> List[str]:
        # Filter out empty or whitespace-only strings
        clean_urls = [url.strip() for url in urls if url and url.strip()]
        if not clean_urls:
            raise ValueError("You must upload at least one valid vehicle image.")
        return clean_urls


class VehicleOut(VehicleBase):
    id: int
    created_at: datetime
    images: List[ImageOut] = []
    dealership: Optional[DealershipPublicOut] = None

    class Config:
        from_attributes = True


# ==========================================
# APPOINTMENT SCHEMAS
# ==========================================

class AppointmentCreate(BaseModel):
    vehicle_id: Optional[int] = None
    dealership_id: Optional[int] = None
    customer_name: str
    phone_number: str
    preferred_channel: str = "Telegram"
    appointment_type: AppointmentType = AppointmentType.TEST_DRIVE
    date: str
    time_slot: str
    notes: Optional[str] = None


class AppointmentOut(AppointmentCreate):
    id: int
    status: str
    dealership_id: Optional[int] = None
    vehicle_title: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# DEALERSHIP SCHEMAS (PHASE 2: MULTI-TENANCY)
# ==========================================

class DealershipOut(DealershipBase):
    id: int
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DealershipUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    logo_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class TelegramTestRequest(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None


class TelegramTestResponse(BaseModel):
    success: bool
    message: str


# ==========================================
# SUPERADMIN & PLATFORM SCHEMAS (TRACK 2)
# ==========================================

class SuperAdminStatsOut(BaseModel):
    total_dealerships: int
    total_active_listings: int
    total_inventory_value: float
    total_leads_generated: int


class SuperAdminDealershipOut(BaseModel):
    id: int
    name: str
    slug: str
    phone_number: Optional[str] = None
    logo_url: Optional[str] = None
    created_at: Optional[datetime] = None
    subscription_plan: str = "starter"
    max_vehicles: int = 50
    is_active: bool = True
    vehicle_count: int = 0
    user_phone_number: Optional[str] = None

    class Config:
        from_attributes = True


class SuperAdminDealershipStatusUpdate(BaseModel):
    is_active: Optional[bool] = None
    subscription_plan: Optional[str] = None
    max_vehicles: Optional[int] = None


# ==========================================
# AUTH SCHEMAS (PHASE 1: PHONE-BASED OTP)
# ==========================================

class SendOTPRequest(BaseModel):
    phone_number: str


class SendOTPResponse(BaseModel):
    status: str = "success"
    message: Optional[str] = "የማረጋገጫ ኮድ በ SMS ተልኳል (Verification code sent via SMS)"
    otp_code: Optional[str] = None
    telegram_sent: Optional[bool] = False
    phone_number: Optional[str] = None
    expires_in_seconds: Optional[int] = 180
    bot_link: Optional[str] = None
    method: Optional[str] = None
    otp_display: Optional[str] = None


class LinkTelegramRequest(BaseModel):
    phone_number: str
    telegram_chat_id: str


class SwitchDealershipRequest(BaseModel):
    dealership_id: int


class VerifyOTPRequest(BaseModel):
    phone_number: str
    otp_code: str


class UserOut(BaseModel):
    id: int
    phone_number: str
    full_name: Optional[str] = None
    role: str = "dealer_admin"
    dealership_id: Optional[int] = None
    dealership: Optional[DealershipOut] = None
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

