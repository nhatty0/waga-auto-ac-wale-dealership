import enum
import json
from datetime import datetime
from typing import List
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

# Staff permissions an owner can tick in /superadmin -> Staff. Superadmins implicitly have all.
STAFF_PERMISSIONS = ("vehicles", "appointments", "rentals")


def encode_permissions(perms) -> str:
    """Known permissions only, de-duplicated, in canonical order, as a JSON list."""
    wanted = set(perms or [])
    return json.dumps([p for p in STAFF_PERMISSIONS if p in wanted])


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
    phone_number_2 = Column(String(50), nullable=True)
    # Last PRIMARY_DEALERSHIP_PHONE|_PHONE_2 pair copied in by migrate.py. Lets a changed .env
    # value win once on restart while edits made in /superadmin Settings survive restarts.
    contact_phones_synced = Column(String(120), nullable=True)
    logo_url = Column(String(1000), nullable=True)
    telegram_bot_token = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True)
    telegram_bot_username = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    subscription_plan = Column(String(50), default="starter")
    max_vehicles = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="dealership")
    vehicles = relationship("Vehicle", back_populates="dealership")
    appointments = relationship("Appointment", back_populates="dealership")
    drivers = relationship("Driver", back_populates="dealership")
    rentals = relationship("RentalBooking", back_populates="dealership")
    lot_intakes = relationship("LotIntake", back_populates="dealership")
    handovers = relationship("VehicleHandover", back_populates="dealership")

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    make = Column(String(100), nullable=False, index=True)
    model = Column(String(100), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    price = Column(Float, nullable=True)
    mileage = Column(Integer, nullable=True)  # NULL = not entered
    condition = Column(String(50), default="Slightly Used")
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
    appointments = relationship("Appointment", back_populates="vehicle", cascade="all, delete-orphan")
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    dealership = relationship("Dealership", back_populates="vehicles")
    # Bank Loan Transfer Tracking
    has_bank_loan = Column(Boolean, default=False)
    cash_price = Column(Float, nullable=True)          # በእጅ የሚከፈል
    bank_loan_amount = Column(Float, nullable=True)    # የሚተላለፍ የባንክ ዕዳ
    bank_name = Column(String, nullable=True)           # e.g. "Awash", "CBE"
    plate_status = Column(String, default="Code 2", nullable=True)
    # Rental & Dispatch Engine Extensions
    listing_type = Column(String(50), default="sale", nullable=False)  # "sale", "rent", "both"
    rental_daily_rate = Column(Float, nullable=True)                   # ETB per day
    rental_available = Column(Boolean, default=True)
    with_driver_only = Column(Boolean, default=False)

    rentals = relationship("RentalBooking", back_populates="vehicle", cascade="all, delete-orphan")

    @property
    def daily_rental_rate(self):
        return self.rental_daily_rate

    @property
    def daily_rate(self):
        return self.rental_daily_rate

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
    # JSON list from STAFF_PERMISSIONS, e.g. '["vehicles","rentals"]'. NULL only on rows that
    # predate staff permissions; migrate.py backfills those with all permissions.
    permissions_json = Column("permissions", Text, nullable=True)

    @property
    def permissions(self) -> List[str]:
        """Effective permissions: everything for superadmins, otherwise the stored list."""
        if self.is_superadmin:
            return list(STAFF_PERMISSIONS)
        try:
            stored = json.loads(self.permissions_json or "[]")
        except (TypeError, ValueError):
            return []
        return [p for p in STAFF_PERMISSIONS if isinstance(stored, list) and p in stored]

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions

    @property
    def is_superadmin(self) -> bool:
        # The SUPERADMIN_PHONE list is the single source of truth. role == "superadmin"
        # alone is NOT enough (migrate.py demotes stale superadmin rows on startup).
        from settings import is_superadmin_phone
        return is_superadmin_phone(self.phone_number)

class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), index=True, nullable=False)
    otp_code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    phone_number = Column(String(50), nullable=False)
    license_number = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    dealership = relationship("Dealership", back_populates="drivers")
    rentals = relationship("RentalBooking", back_populates="assigned_driver")

class RentalBooking(Base):
    __tablename__ = "rental_bookings"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    customer_name = Column(String(150), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    total_days = Column(Integer, nullable=False)
    total_price = Column(Float, nullable=False)
    delivery_type = Column(String(50), default="showroom_pickup", nullable=False)  # "showroom_pickup" or "doorstep_delivery"
    delivery_address = Column(String(255), nullable=True)                          # e.g. Bole, Old Airport, Kazanchis
    assigned_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    status = Column(String(50), default="pending", nullable=False)                # "pending", "confirmed", "driver_assigned", "delivered", "completed", "cancelled"
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="rentals")
    assigned_driver = relationship("Driver", back_populates="rentals")
    dealership = relationship("Dealership", back_populates="rentals")


class LotIntake(Base):
    __tablename__ = "lot_intakes"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_name = Column(String(150), nullable=False)                         # e.g. "Suzuki Dzire"
    year_of_production = Column(Integer, nullable=True)                        # e.g. 2022
    plate_number = Column(String(50), nullable=False, index=True)              # e.g. "2-B12345 AA"
    primary_cash_price = Column(Float, nullable=True, default=0.0)             # መነሻ በእጅ
    primary_bank_price = Column(Float, nullable=True, default=0.0)             # መነሻ ባንክ
    final_cash_price = Column(Float, nullable=True, default=0.0)               # የመጨረሻ በእጅ
    final_bank_price = Column(Float, nullable=True, default=0.0)               # የመጨረሻ ባንክ
    received_date = Column(DateTime, default=datetime.utcnow, nullable=False)  # ርክክብ ቀን
    owner_name = Column(String(150), nullable=False)                           # የባለቤት ስም
    owner_phone = Column(String(50), nullable=False)                           # የባለቤት ስልክ
    remark = Column(Text, nullable=True)                                      # e.g. "ቁልፍ እና ሊብሬ ተረክበናል"
    received_by_name = Column(String(150), nullable=True)                     # የተረካቢው ስም
    is_in_lot = Column(Boolean, default=True, nullable=False)                 # True in yard, False when released
    published_vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Soft archive (legal record: never hard-deleted from the UI). NULL = active.
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(150), nullable=True)

    dealership = relationship("Dealership", back_populates="lot_intakes")
    published_vehicle = relationship("Vehicle")
    gate_passes = relationship("GatePass", back_populates="lot_intake", cascade="all, delete-orphan")


class GatePass(Base):
    __tablename__ = "gate_passes"

    id = Column(Integer, primary_key=True, index=True)
    slip_number = Column(String(50), unique=True, index=True, nullable=False)  # e.g. "AC-00481"
    date = Column(DateTime, default=datetime.utcnow, nullable=False)
    driver_name = Column(String(150), nullable=False)                          # የሹፌሩ ስም
    plate_number = Column(String(50), nullable=False)                          # የሰሌዳ ቁጥር
    release_reason = Column(String(255), nullable=False)                      # የመውጣት ምክንያት: e.g. "የዕለት መልስ", "ለገዢ ሙከራ", "የተሸጠ"
    authorized_by = Column(String(150), nullable=False)                       # እንዲወጣ የፈቀደው ኃላፊ
    lot_intake_id = Column(Integer, ForeignKey("lot_intakes.id"), nullable=True)
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lot_intake = relationship("LotIntake", back_populates="gate_passes")
    dealership = relationship("Dealership")


class VehicleHandover(Base):
    __tablename__ = "vehicle_handovers"

    id = Column(Integer, primary_key=True, index=True)
    contract_number = Column(String(50), unique=True, index=True, nullable=False)  # e.g. "AC-rec-0001"
    date = Column(DateTime, default=datetime.utcnow, nullable=False)
    owner_full_name = Column(String(150), nullable=False)                         # የአስረካቢው /ባለንብረት/ ሙሉ ስም
    owner_phone = Column(String(50), nullable=False)                             # ስልክ
    owner_subcity = Column(String(100), nullable=True)                           # ክ/ከተማ
    owner_woreda = Column(String(50), nullable=True)                             # ወረዳ
    owner_house_no = Column(String(50), nullable=True)                           # የቤት ቁጥር
    vehicle_type = Column(String(150), nullable=False)                           # የተሽከርካሪው ዓይነት
    manufacture_year = Column(Integer, nullable=True)                            # የተመረተበት ዓ.ም
    chassis_number = Column(String(100), nullable=True)                          # የቻንሲ ቁጥር
    engine_number = Column(String(100), nullable=True)                           # የሞተር ቁጥር
    horsepower = Column(String(50), nullable=True)                              # የፈረስ ጉልበት
    color = Column(String(50), nullable=True)                                    # ቀለም
    plate_number = Column(String(50), nullable=False, index=True)                # ሰሌዳ ቁጥር
    belongings_json = Column(Text, nullable=True, default="[]")                  # list of { item_name, quantity }
    agreed_selling_price = Column(Float, nullable=True, default=0.0)             # መኪናው የሚሸጥበት ዋጋ በብር
    commission_or_net_payout = Column(String(150), nullable=True)                # ኮሚሽን / ለአስረካቢ የሚሰጥ ብር
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)       # Optional link to showroom vehicle
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Soft archive (legal record: never hard-deleted from the UI). NULL = active.
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(150), nullable=True)

    vehicle = relationship("Vehicle")
    dealership = relationship("Dealership", back_populates="handovers")




