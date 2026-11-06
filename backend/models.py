import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class VehicleStatus(str, enum.Enum):
    AVAILABLE = "Available"
    RESERVED = "Reserved"
    SOLD = "Sold"
    IN_TRANSIT = "In Transit"

class AppointmentType(str, enum.Enum):
    TEST_DRIVE = "In-Person Test Drive"
    VIRTUAL_WALKTHROUGH = "Virtual Video Tour"

class PlateType(str, enum.Enum):
    UNREGISTERED = "unregistered"
    NEW_DIGITAL = "new_series"
    NEW_SERIES = "new_series"
    CODE_2 = "code_2"
    CODE_3 = "code_3"

class Dealership(Base):
    __tablename__ = "dealerships"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    phone_number = Column(String(50), nullable=True)
    logo_url = Column(String(1000), nullable=True)
    telegram_bot_token = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    subscription_plan = Column(String(50), default="starter")
    max_vehicles = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="dealership")
    vehicles = relationship("Vehicle", back_populates="dealership")
    appointments = relationship("Appointment", back_populates="dealership")

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    make = Column(String(100), nullable=False, index=True)
    model = Column(String(100), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    price = Column(Float, nullable=True)
    mileage = Column(Integer, nullable=True, default=0)
    condition = Column(String(50), default="Foreign Used")
    fuel_type = Column(String(50), nullable=False)
    transmission = Column(String(50), default="Automatic")
    body_type = Column(String(50), nullable=False)
    engine_size = Column(String(150), nullable=True)     # Expanded from 30 to 150
    drive_train = Column(String(50), nullable=True, default="AWD")
    exterior_color = Column(String(50), nullable=True)
    customs_cleared = Column(Boolean, default=True)
    features = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(Enum(VehicleStatus), default=VehicleStatus.AVAILABLE)
    created_at = Column(DateTime, default=datetime.utcnow)

    images = relationship("VehicleImage", back_populates="vehicle", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="vehicle")
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    dealership = relationship("Dealership", back_populates="vehicles")
    # Bank Loan Transfer Tracking
    has_bank_loan = Column(Boolean, default=False)
    cash_price = Column(Float, nullable=True)          # በእጅ የሚከፈል
    bank_loan_amount = Column(Float, nullable=True)    # የሚተላለፍ የባንክ ዕዳ
    bank_name = Column(String, nullable=True)           # e.g. "Awash", "CBE"
    plate_status = Column(String, default="Code 2", nullable=True)

class VehicleImage(Base):
    __tablename__ = "vehicle_images"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    image_url = Column(String(1000), nullable=False)
    is_cover = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)

    vehicle = relationship("Vehicle", back_populates="images")

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    customer_name = Column(String(150), nullable=False)
    phone_number = Column(String(50), nullable=False)
    preferred_channel = Column(String(50), default="Telegram")
    appointment_type = Column(Enum(AppointmentType), default=AppointmentType.TEST_DRIVE)
    date = Column(String(50), nullable=False)
    time_slot = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(50), default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="appointments")
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    dealership = relationship("Dealership", back_populates="appointments")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=True)
    role = Column(String(50), default="dealer_admin")
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True)
    dealership = relationship("Dealership", back_populates="users")
    telegram_chat_id = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_superadmin(self) -> bool:
        from settings import settings
        superadmin_phone = settings.SUPERADMIN_PHONE.strip().lstrip("+")
        user_phone = str(self.phone_number or "").strip().lstrip("+")
        return self.role == "superadmin" or user_phone == superadmin_phone

class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), index=True, nullable=False)
    otp_code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

