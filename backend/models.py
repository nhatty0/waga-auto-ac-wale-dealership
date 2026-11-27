import enum
import json
from datetime import datetime
from typing import List
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

# Team access, set by the owner in /superadmin -> Team. Superadmins implicitly have everything.
#   Web permissions: what a person may do on the website. At least one is needed to log in.
#   Field roles: work done through Telegram only (no website login on their own).
WEB_PERMISSIONS = ("vehicles", "appointments", "rentals")
FIELD_ROLES = ("driver", "gatekeeper")
# Effective permission vocabulary checked by require_permission(). "gate" = has the Gatekeeper
# role (Gate screen in /admin when they can also log in; gate-pass buttons in Telegram).
STAFF_PERMISSIONS = WEB_PERMISSIONS + ("gate",)


def encode_permissions(perms) -> str:
    """Known permissions only, de-duplicated, in canonical order, as a JSON list."""
    wanted = set(perms or [])
    return json.dumps([p for p in STAFF_PERMISSIONS if p in wanted])


def encode_field_roles(roles) -> str:
    wanted = set(roles or [])
    return json.dumps([r for r in FIELD_ROLES if r in wanted])


def _json_list(raw) -> List[str]:
    try:
        v = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return v if isinstance(v, list) else []


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "Available"
    RESERVED = "Reserved"
    SOLD = "Sold"
    IN_TRANSIT = "In Transit"

# Appointment statuses. "Pending" is the stored value for New so existing rows need no rewrite.
APPOINTMENT_STATUSES = ("Pending", "Confirmed", "Done", "Cancelled", "No-show")

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
    # Contact e-mail printed on document letterheads (editable in /superadmin Settings).
    email = Column(String(150), nullable=True)
    # Last PRIMARY_DEALERSHIP_PHONE|_PHONE_2 pair copied in by migrate.py. Lets a changed .env
    # value win once on restart while edits made in /superadmin Settings survive restarts.
    contact_phones_synced = Column(String(120), nullable=True)
    logo_url = Column(String(1000), nullable=True)
    telegram_bot_token = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True)
    telegram_bot_username = Column(String(100), nullable=True)
    # Optional Telegram alerts to the team (Settings). NULL = on (the default).
    alert_appointments_team = Column(Boolean, nullable=True)
    alert_rentals_team = Column(Boolean, nullable=True)
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
    # "Pending" (shown as New), "Confirmed", "Done", "Cancelled", "No-show": see APPOINTMENT_STATUSES.
    status = Column(String(50), default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    # Soft delete: archived rows are hidden from Upcoming/Past and the tab count, and can be restored.
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(150), nullable=True)

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
    # JSON list from FIELD_ROLES, e.g. '["driver"]'. NULL = none (older rows).
    field_roles_json = Column("field_roles", Text, nullable=True)

    @property
    def web_permissions(self) -> List[str]:
        if self.is_superadmin:
            return list(WEB_PERMISSIONS)
        stored = _json_list(self.permissions_json)
        return [p for p in WEB_PERMISSIONS if p in stored]

    @property
    def field_roles(self) -> List[str]:
        """Driver / Gatekeeper. A legacy "gate" permission counts as the Gatekeeper role."""
        stored = set(_json_list(self.field_roles_json))
        if "gate" in _json_list(self.permissions_json):
            stored.add("gatekeeper")
        return [r for r in FIELD_ROLES if r in stored]

    def has_role(self, role: str) -> bool:
        return role in self.field_roles

    @property
    def can_use_website(self) -> bool:
        """Owners, and people with at least one web permission. Field-only people use Telegram."""
        return self.is_superadmin or bool(self.web_permissions)

    @property
    def permissions(self) -> List[str]:
        """Effective permissions: everything for superadmins; otherwise web permissions,
        plus "gate" for gatekeepers."""
        if self.is_superadmin:
            return list(STAFF_PERMISSIONS)
        return self.web_permissions + (["gate"] if self.has_role("gatekeeper") else [])

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions

    @property
    def telegram_linked(self) -> bool:
        return bool((self.telegram_chat_id or "").strip())

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
    # Legacy: the old drivers table (kept, no longer written). New assignments use assigned_user_id.
    assigned_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    # Team member with the Driver role.
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String(50), default="pending", nullable=False)                # "pending", "confirmed", "driver_assigned", "delivered", "completed", "cancelled"
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="rentals")
    assigned_driver = relationship("Driver", back_populates="rentals")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    dealership = relationship("Dealership", back_populates="rentals")

    @property
    def assigned_person(self):
        """Who drives this booking: the Team member, else the legacy driver row (old bookings)."""
        u = self.assigned_user
        if u is not None:
            return {"id": u.id, "full_name": u.full_name or u.phone_number, "phone_number": u.phone_number,
                    "telegram_linked": u.telegram_linked, "source": "team"}
        d = self.assigned_driver
        if d is not None:
            return {"id": d.id, "full_name": d.full_name, "phone_number": d.phone_number,
                    "telegram_linked": False, "source": "legacy"}
        return None


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
    # Printed with the company stamp (Document Center): who printed the last stamped copy, and when.
    stamped = Column(Boolean, nullable=True, default=False)
    stamped_by = Column(String(150), nullable=True)
    stamped_at = Column(DateTime, nullable=True)

    dealership = relationship("Dealership", back_populates="lot_intakes")
    # Document Center: "IN-0001" (backfilled by migrate.py) and draft/final (NULL = final).
    doc_number = Column(String(50), nullable=True, index=True)
    doc_status = Column(String(20), nullable=True, default="final")

    published_vehicle = relationship("Vehicle")
    # Ordered by id so "the latest pass" is always the last one.
    gate_passes = relationship("GatePass", back_populates="lot_intake", cascade="all, delete-orphan",
                               order_by="GatePass.id")


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

    # Document Center additions. A pass is its own record: it keeps the vehicle name and its own
    # archive flag, so it stays findable even when the intake is released or archived.
    vehicle_name = Column(String(150), nullable=True)
    vehicle_id = Column(Integer, nullable=True, index=True)
    doc_status = Column(String(20), nullable=True, default="final")   # draft passes don't release the car
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(150), nullable=True)
    # Printed with the company stamp (Document Center): who printed the last stamped copy, and when.
    stamped = Column(Boolean, nullable=True, default=False)
    stamped_by = Column(String(150), nullable=True)
    stamped_at = Column(DateTime, nullable=True)
    # Remote release (Telegram gate pass). Status is derived: see gate_pass.pass_status().
    verify_token = Column(String(64), nullable=True, index=True)   # random, for /verify/<token> and t.me ?start=gp_<token>
    valid_until = Column(DateTime, nullable=True)                  # UTC; default 23:59 Addis time on the pass date
    color = Column(String(50), nullable=True)
    driver_phone = Column(String(50), nullable=True)
    driver_chat_id = Column(String(50), nullable=True)
    issued_by = Column(String(150), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    telegram_messages = Column(Text, nullable=True)               # JSON [{chat_id, message_id}] to edit after confirm/cancel
    exited_at = Column(DateTime, nullable=True)
    confirmed_by = Column(String(150), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_by = Column(String(150), nullable=True)
    reject_note = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by = Column(String(150), nullable=True)

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
    # Printed with the company stamp (Document Center): who printed the last stamped copy, and when.
    stamped = Column(Boolean, nullable=True, default=False)
    stamped_by = Column(String(150), nullable=True)
    stamped_at = Column(DateTime, nullable=True)

    doc_status = Column(String(20), nullable=True, default="final")

    vehicle = relationship("Vehicle")
    dealership = relationship("Dealership", back_populates="handovers")


class Document(Base):
    """
    Document Center records without a legacy table of their own: down-payment receipts
    ("downpayment", DP-0001) and car rental agreements ("rental", RA-0001). The form fields live in
    data_json; the columns below are copies used for search, lists and links.
    """
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("doc_type", "doc_number", name="uq_documents_type_number"),)

    id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(String(30), nullable=False, index=True)
    doc_number = Column(String(50), nullable=False)
    doc_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(20), nullable=False, default="draft")      # "draft" | "final"
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True, index=True)
    rental_booking_id = Column(Integer, ForeignKey("rental_bookings.id"), nullable=True, index=True)
    plate_number = Column(String(50), nullable=True, index=True)
    party_name = Column(String(200), nullable=True)
    party_phone = Column(String(50), nullable=True)
    amount = Column(Float, nullable=True)
    data_json = Column(Text, nullable=False, default="{}")
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(150), nullable=True)
    # Printed with the company stamp (Document Center): who printed the last stamped copy, and when.
    stamped = Column(Boolean, nullable=True, default=False)
    stamped_by = Column(String(150), nullable=True)
    stamped_at = Column(DateTime, nullable=True)


class TelegramLinkToken(Base):
    """
    One-time secret for t.me/<bot>?start=link_<token> (staff) or connect_<token> (owner lead chat).
    Replaces the old links that carried a phone number or dealership id, which anyone could forge.
    """
    __tablename__ = "telegram_link_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    purpose = Column(String(30), nullable=False)            # "staff_link" | "dealer_connect"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_chat_id = Column(String(50), nullable=True)


# Task types and statuses (stored values). Labels live in tasks.py.
TASK_TYPES = ("rental_delivery", "rental_pickup", "inspection", "move_car", "other")
TASK_STATUSES = ("new", "accepted", "in_progress", "done", "problem", "cancelled")


class Task(Base):
    """A job for a Team member (superadmin only), sent to their Telegram with status buttons."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_type = Column(String(30), nullable=False, default="other")
    status = Column(String(20), nullable=False, default="new", index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True, index=True)
    vehicle_label = Column(String(200), nullable=True)            # snapshot or free text
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    scheduled_at = Column(DateTime, nullable=True, index=True)    # naive UTC
    location = Column(String(255), nullable=True)
    customer_name = Column(String(150), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    problem_note = Column(Text, nullable=True)
    rental_booking_id = Column(Integer, ForeignKey("rental_bookings.id"), nullable=True, index=True)
    telegram_messages = Column(Text, nullable=True)               # JSON [{chat_id, message_id}]
    sent_at = Column(DateTime, nullable=True)
    created_by = Column(String(150), nullable=True)
    dealership_id = Column(Integer, ForeignKey("dealerships.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    rental_booking = relationship("RentalBooking")
    events = relationship("TaskEvent", back_populates="task", order_by="TaskEvent.id",
                          cascade="all, delete-orphan")


class TaskEvent(Base):
    """History log: every create / send / status change / edit, with who and when."""
    __tablename__ = "task_events"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    at = Column(DateTime, default=datetime.utcnow, nullable=False)
    actor = Column(String(150), nullable=True)
    action = Column(String(30), nullable=False)                   # created / sent / status / edited / note
    status = Column(String(20), nullable=True)
    note = Column(Text, nullable=True)

    task = relationship("Task", back_populates="events")
