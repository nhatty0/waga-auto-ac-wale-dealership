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
    phone_number_2: Optional[str] = None
    email: Optional[str] = None
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
    mileage: Optional[int] = None  # None = not entered (shown as blank, not "0 km")
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
    # Rental Engine Extensions
    listing_type: Optional[str] = "sale"  # "sale", "rent", "both"
    rental_daily_rate: Optional[float] = None
    daily_rental_rate: Optional[float] = None
    daily_rate: Optional[float] = None
    rental_available: Optional[bool] = True
    with_driver_only: Optional[bool] = False

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

    @field_validator("price", "cash_price", "down_payment", "bank_loan_amount", "bank_loan", "rental_daily_rate")
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
    phone_number_2: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_username: Optional[str] = None


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
    sales_count: Optional[int] = 0
    rental_count: Optional[int] = 0
    drivers_count: Optional[int] = 0
    leads_count: Optional[int] = 0
    total_sales_inventory: Optional[int] = 0
    active_rental_fleet: Optional[int] = 0
    registered_drivers: Optional[int] = 0
    total_leads_bookings: Optional[int] = 0
    total_dealerships: int = 1
    total_active_listings: int = 0
    total_inventory_value: float = 0.0
    total_leads_generated: int = 0


class AdminStatsOut(BaseModel):
    sales_count: int
    rental_count: int
    drivers_count: int
    leads_count: int
    total_sales_inventory: Optional[int] = None
    active_rental_fleet: Optional[int] = None
    registered_drivers: Optional[int] = None
    total_leads_bookings: Optional[int] = None
    sales_inventory: Optional[int] = None
    rental_fleet: Optional[int] = None
    active_drivers: Optional[int] = None
    total_inquiries_and_bookings: Optional[int] = None
    total_sales_inquiries: Optional[int] = None
    total_rental_bookings: Optional[int] = None


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
    # Public shape only: Telegram credentials are owner settings (GET /api/admin/dealership).
    dealership: Optional[DealershipPublicOut] = None
    is_superadmin: bool = False
    permissions: List[str] = []
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ==========================================
# DRIVER & CAR RENTAL SCHEMAS
# ==========================================

class DriverBase(BaseModel):
    full_name: str
    phone_number: str
    license_number: Optional[str] = None
    is_active: Optional[bool] = True


class DriverCreate(DriverBase):
    dealership_id: Optional[int] = None


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    license_number: Optional[str] = None
    is_active: Optional[bool] = None


class DriverOut(DriverBase):
    id: int
    dealership_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RentalBookingCreate(BaseModel):
    vehicle_id: int
    customer_name: str
    customer_phone: str
    start_date: datetime
    end_date: datetime
    delivery_type: Optional[str] = "showroom_pickup"  # "showroom_pickup" or "doorstep_delivery"
    delivery_address: Optional[str] = None
    dealership_id: Optional[int] = None


class AssignDriverRequest(BaseModel):
    driver_id: int


class RentalBookingStatusUpdate(BaseModel):
    status: str


class RentalBookingOut(BaseModel):
    id: int
    vehicle_id: int
    customer_name: str
    customer_phone: str
    start_date: datetime
    end_date: datetime
    total_days: int
    total_price: float
    delivery_type: str
    delivery_address: Optional[str] = None
    assigned_driver_id: Optional[int] = None
    status: str
    dealership_id: Optional[int] = None
    created_at: datetime
    vehicle: Optional[VehicleOut] = None
    assigned_driver: Optional[DriverOut] = None

    class Config:
        from_attributes = True


# ==========================================
# EXECUTIVE OWNER DASHBOARD SCHEMAS
# ==========================================

class ExecutiveStatsOut(BaseModel):
    sales_inventory: int
    rental_fleet: int
    active_drivers: int
    total_inquiries_and_bookings: int
    total_sales_inquiries: int
    total_rental_bookings: int
    total_inventory_value: float
    dealership_name: str
    sales_count: Optional[int] = None
    rental_count: Optional[int] = None
    drivers_count: Optional[int] = None
    leads_count: Optional[int] = None
    total_sales_inventory: Optional[int] = None
    active_rental_fleet: Optional[int] = None
    registered_drivers: Optional[int] = None
    total_leads_bookings: Optional[int] = None


class StaffUserOut(BaseModel):
    id: int
    phone_number: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    is_superadmin: bool = False
    # Effective permissions ("vehicles", "appointments", "rentals"); owners have all.
    permissions: List[str] = []
    dealership_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StaffInviteRequest(BaseModel):
    phone_number: str
    full_name: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    role: Optional[str] = None  # legacy field, ignored: access is decided by `permissions`


class StaffUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class StaffStatusRequest(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None


# ==========================================
# LOT INTAKE & GATE PASS SCHEMAS
# ==========================================

class GatePassBase(BaseModel):
    driver_name: str
    plate_number: Optional[str] = None
    release_reason: str
    authorized_by: str
    date: Optional[datetime] = None
    dealership_id: Optional[int] = None


class GatePassCreate(GatePassBase):
    slip_number: Optional[str] = None


class GatePassOut(BaseModel):
    id: int
    slip_number: str
    date: datetime
    driver_name: str
    plate_number: str
    release_reason: str
    authorized_by: str
    lot_intake_id: Optional[int] = None
    dealership_id: Optional[int] = None
    created_at: Optional[datetime] = None
    vehicle_name: Optional[str] = None
    vehicle_id: Optional[int] = None
    doc_status: Optional[str] = None
    archived_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LotIntakeBase(BaseModel):
    vehicle_name: str
    year_of_production: Optional[int] = None
    plate_number: str
    primary_cash_price: Optional[float] = 0.0
    primary_bank_price: Optional[float] = 0.0
    final_cash_price: Optional[float] = 0.0
    final_bank_price: Optional[float] = 0.0
    received_date: Optional[datetime] = None
    owner_name: str
    owner_phone: str
    remark: Optional[str] = None
    received_by_name: Optional[str] = None
    dealership_id: Optional[int] = None


class LotIntakeCreate(LotIntakeBase):
    publish_to_showroom: Optional[bool] = False


class LotIntakeOut(LotIntakeBase):
    id: int
    is_in_lot: bool
    published_vehicle_id: Optional[int] = None
    created_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None
    doc_number: Optional[str] = None
    doc_status: Optional[str] = None
    gate_passes: List[GatePassOut] = []

    class Config:
        from_attributes = True


# ==========================================
# VEHICLE HANDOVER & CONSIGNMENT SCHEMAS
# ==========================================

class HandoverBelonging(BaseModel):
    item_name: str
    quantity: str = "1"


class VehicleHandoverBase(BaseModel):
    owner_full_name: str
    owner_phone: str
    owner_subcity: Optional[str] = None
    owner_woreda: Optional[str] = None
    owner_house_no: Optional[str] = None
    vehicle_type: str
    manufacture_year: Optional[int] = None
    chassis_number: Optional[str] = None
    engine_number: Optional[str] = None
    horsepower: Optional[str] = None
    color: Optional[str] = None
    plate_number: str
    belongings_json: Optional[str] = "[]"
    agreed_selling_price: Optional[float] = 0.0
    commission_or_net_payout: Optional[str] = None
    vehicle_id: Optional[int] = None
    dealership_id: Optional[int] = None
    date: Optional[datetime] = None


class VehicleHandoverCreate(VehicleHandoverBase):
    contract_number: Optional[str] = None
    belongings: Optional[List[HandoverBelonging]] = None


class VehicleHandoverOut(VehicleHandoverBase):
    id: int
    contract_number: str
    date: datetime
    created_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None

    class Config:
        from_attributes = True





