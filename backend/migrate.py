import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import inspect, text
from database import engine, SessionLocal
import models

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

from settings import settings, normalize_phone_digits, superadmin_phones

SINGLE_TENANT_MODE = settings.SINGLE_TENANT_MODE
PLATFORM_NAME = settings.PLATFORM_NAME
PRIMARY_DEALERSHIP_SLUG = settings.PRIMARY_DEALERSHIP_SLUG
PRIMARY_DEALERSHIP_PHONE = settings.PRIMARY_DEALERSHIP_PHONE      # default +251983112211
PRIMARY_DEALERSHIP_PHONE_2 = settings.PRIMARY_DEALERSHIP_PHONE_2  # default +251989113211


# (table, column, sqlite type, postgres type) — all nullable, no defaults.
ADDITIVE_COLUMNS = [
    ("lot_intakes", "archived_at", "DATETIME", "TIMESTAMP"),
    ("lot_intakes", "archived_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("vehicle_handovers", "archived_at", "DATETIME", "TIMESTAMP"),
    ("vehicle_handovers", "archived_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("dealerships", "phone_number_2", "VARCHAR(50)", "VARCHAR(50)"),
    ("dealerships", "contact_phones_synced", "VARCHAR(120)", "VARCHAR(120)"),
    ("users", "permissions", "TEXT", "TEXT"),
    # Document Center
    ("dealerships", "email", "VARCHAR(150)", "VARCHAR(150)"),
    ("lot_intakes", "doc_number", "VARCHAR(50)", "VARCHAR(50)"),
    ("lot_intakes", "doc_status", "VARCHAR(20)", "VARCHAR(20)"),
    ("gate_passes", "vehicle_name", "VARCHAR(150)", "VARCHAR(150)"),
    ("gate_passes", "vehicle_id", "INTEGER", "INTEGER"),
    ("gate_passes", "doc_status", "VARCHAR(20)", "VARCHAR(20)"),
    ("gate_passes", "archived_at", "DATETIME", "TIMESTAMP"),
    ("gate_passes", "archived_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("vehicle_handovers", "doc_status", "VARCHAR(20)", "VARCHAR(20)"),
    # Telegram gate pass (remote release)
    ("gate_passes", "verify_token", "VARCHAR(64)", "VARCHAR(64)"),
    ("gate_passes", "valid_until", "DATETIME", "TIMESTAMP"),
    ("gate_passes", "color", "VARCHAR(50)", "VARCHAR(50)"),
    ("gate_passes", "driver_phone", "VARCHAR(50)", "VARCHAR(50)"),
    ("gate_passes", "driver_chat_id", "VARCHAR(50)", "VARCHAR(50)"),
    ("gate_passes", "issued_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("gate_passes", "sent_at", "DATETIME", "TIMESTAMP"),
    # Team: field roles (Driver, Gatekeeper), Team-member drivers on bookings, alert toggles
    ("users", "field_roles", "TEXT", "TEXT"),
    ("rental_bookings", "assigned_user_id", "INTEGER", "INTEGER"),
    ("dealerships", "alert_appointments_team", "BOOLEAN", "BOOLEAN"),
    ("dealerships", "alert_rentals_team", "BOOLEAN", "BOOLEAN"),
    # Appointments clean-up (status dropdown + archive/restore)
    ("appointments", "archived_at", "DATETIME", "TIMESTAMP"),
    ("appointments", "archived_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("gate_passes", "telegram_messages", "TEXT", "TEXT"),
    ("gate_passes", "exited_at", "DATETIME", "TIMESTAMP"),
    ("gate_passes", "confirmed_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("gate_passes", "rejected_at", "DATETIME", "TIMESTAMP"),
    ("gate_passes", "rejected_by", "VARCHAR(150)", "VARCHAR(150)"),
    ("gate_passes", "reject_note", "TEXT", "TEXT"),
    ("gate_passes", "cancelled_at", "DATETIME", "TIMESTAMP"),
    ("gate_passes", "cancelled_by", "VARCHAR(150)", "VARCHAR(150)"),
]


def _backfill_gate_pass_tokens(db):
    """Every pass gets a random verify token and a validity end (23:59 Addis time on its date)."""
    from gate_pass import new_token, default_valid_until
    rows = db.query(models.GatePass).filter(
        (models.GatePass.verify_token.is_(None)) | (models.GatePass.valid_until.is_(None))
    ).all()
    for gp in rows:
        gp.verify_token = gp.verify_token or new_token()
        gp.valid_until = gp.valid_until or default_valid_until(gp.date or gp.created_at)
    if rows:
        db.commit()
        print(f"🎫 Gate passes: {len(rows)} given a verify token / validity window.")
    with engine.begin() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_gate_passes_verify_token ON gate_passes (verify_token)"))


def _backfill_document_fields(db):
    """
    Fill the new Document Center columns on existing rows (only where they are NULL):
    intake numbers IN-0001.. in creation order, and the vehicle name on gate passes so a pass
    stays readable on its own. Existing values are never changed.
    """
    import re
    used = [r[0] for r in db.query(models.LotIntake.doc_number).filter(models.LotIntake.doc_number.isnot(None)).all()]
    seq = max([int(m.group(1)) for n in used if (m := re.match(r"IN-(\d+)$", n or ""))] or [0])
    changed = 0
    for intake in db.query(models.LotIntake).filter(models.LotIntake.doc_number.is_(None)).order_by(models.LotIntake.id).all():
        seq += 1
        intake.doc_number = f"IN-{seq:04d}"
        changed += 1
    for gp in db.query(models.GatePass).filter(models.GatePass.vehicle_name.is_(None)).all():
        if gp.lot_intake is not None:
            gp.vehicle_name = gp.lot_intake.vehicle_name
            gp.vehicle_id = gp.vehicle_id or gp.lot_intake.published_vehicle_id
            changed += 1
    if changed:
        db.commit()
        print(f"🗂️  Document Center backfill: {changed} row(s) numbered / linked.")


def _backfill_staff_permissions(db):
    """
    Users created before staff permissions existed (permissions IS NULL) get ALL permissions,
    so nobody is locked out on deploy. Their is_active flag is left as it is: someone the owner
    already deactivated stays deactivated. Superadmins don't need a list (they have everything).
    """
    rows = db.query(models.User).filter(models.User.permissions_json.is_(None)).all()
    changed = 0
    for u in rows:
        if u.is_superadmin:
            continue
        # The three original sections only; "gate" is never granted implicitly.
        u.permissions_json = models.encode_permissions(("vehicles", "appointments", "rentals"))
        changed += 1
        print(f"🔑 Staff user #{u.id} ('{u.phone_number}') given all permissions (pre-existing account, active={u.is_active}).")
    if changed:
        db.commit()


def _sync_contact_phones(dealer) -> bool:
    """
    Copy PRIMARY_DEALERSHIP_PHONE / _PHONE_2 into the dealership record when the .env pair
    differs from the pair copied last time. A changed .env therefore wins once (on the next
    restart), while numbers edited later in /superadmin Settings survive restarts.
    """
    pair = f"{PRIMARY_DEALERSHIP_PHONE}|{PRIMARY_DEALERSHIP_PHONE_2}"
    if dealer.contact_phones_synced == pair:
        return False
    dealer.phone_number = PRIMARY_DEALERSHIP_PHONE or None
    dealer.phone_number_2 = PRIMARY_DEALERSHIP_PHONE_2 or None
    dealer.contact_phones_synced = pair
    print(f"📞 Public contact phones set from .env: {PRIMARY_DEALERSHIP_PHONE} / {PRIMARY_DEALERSHIP_PHONE_2}")
    return True


def _sync_superadmins(db, primary_dealer_id: int):
    """
    SUPERADMIN_PHONE (comma-separated) is the only source of owner access:
    - every listed phone exists as a user with role 'superadmin' (created if missing);
    - every other user still holding role 'superadmin' is demoted to 'dealer_admin'.
    Nothing is deleted.
    """
    owners = superadmin_phones()
    if not owners:
        print("⚠️  SUPERADMIN_PHONE is empty: skipping superadmin promote/demote (nobody changed).")
        return

    users = db.query(models.User).all()
    by_phone = {}
    for u in users:
        by_phone.setdefault(normalize_phone_digits(u.phone_number), u)

    for phone in owners:
        user = by_phone.get(phone)
        if not user:
            user = models.User(
                phone_number=phone,
                full_name="AC Wale Executive Owner",
                role="superadmin",
                dealership_id=primary_dealer_id,
                is_active=True,
            )
            db.add(user)
            print(f"👑 Created SuperAdmin user: phone '{phone}'.")
        else:
            if user.role != "superadmin":
                print(f"👑 Promoted user #{user.id} ('{user.phone_number}') to superadmin.")
            user.role = "superadmin"
            user.dealership_id = user.dealership_id or primary_dealer_id
            user.is_active = True
            print(f"👑 Verified SuperAdmin user: phone '{user.phone_number}'.")

    for u in users:
        if u.role == "superadmin" and normalize_phone_digits(u.phone_number) not in owners:
            u.role = "dealer_admin"
            print(f"⬇️  Demoted user #{u.id} ('{u.phone_number}') from superadmin to dealer_admin: phone not in SUPERADMIN_PHONE.")

    db.commit()


# Exact (name, phone, licence) of the demo drivers seeded by builds up to 2026-11. Only rows
# matching all three are removed, so a real driver can never be caught by this.
DEMO_DRIVERS = (
    ("Abebe Bikila", "0911223344", "AA-ET-98234"),
    ("Dawit Kebede", "0922334455", "AA-ET-47120"),
)


def _remove_demo_drivers(db):
    for name, phone, licence in DEMO_DRIVERS:
        for d in db.query(models.Driver).filter(
            models.Driver.full_name == name,
            models.Driver.phone_number == phone,
            models.Driver.license_number == licence,
        ).all():
            # A booking that had the demo driver goes back to "no driver" (shown as unassigned).
            n = db.query(models.RentalBooking).filter(models.RentalBooking.assigned_driver_id == d.id).update(
                {models.RentalBooking.assigned_driver_id: None}, synchronize_session=False
            )
            db.delete(d)
            print(f"🧹 Removed demo driver #{d.id} '{name}'" + (f" (unassigned from {n} booking(s))" if n else ""))
    db.commit()


def _ensure_nullable_columns(is_sqlite: bool):
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, sqlite_type, pg_type in ADDITIVE_COLUMNS:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if column in cols:
                continue
            col_type = sqlite_type if is_sqlite else pg_type
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            print(f"🧩 Added nullable column {table}.{column} ({col_type})")


def run_migrations():
    """
    Safely applies database schema updates for single-tenant AC Wale Cars,
    creates driver and rental booking tables, initializes empty tables,
    and seeds ONLY the primary AC Wale Cars business and SuperAdmin owner.
    """
    print(f"🔄 Initializing isolated database ({engine.url.drivername})...")
    models.Base.metadata.create_all(bind=engine)

    is_sqlite = engine.url.drivername.startswith("sqlite")

    # Additive, nullable columns on existing tables (both SQLite and PostgreSQL).
    # create_all() only creates missing tables, so existing production tables need
    # an explicit ADD COLUMN. Never drops or rewrites anything.
    _ensure_nullable_columns(is_sqlite)

    if not is_sqlite:
        with engine.connect() as conn:
            # PostgreSQL idempotent schema updates
            schema_updates = [
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_bank_loan BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cash_price FLOAT;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS bank_loan_amount FLOAT;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS bank_name VARCHAR;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS plate_status VARCHAR DEFAULT 'Code 2';",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS listing_type VARCHAR(50) DEFAULT 'sale';",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_daily_rate FLOAT;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_available BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS with_driver_only BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'pro';",
                "ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS max_vehicles INTEGER DEFAULT 1000;",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS dealership_id INTEGER REFERENCES dealerships(id);",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);"
            ]
            for sql in schema_updates:
                try:
                    conn.execute(text(sql))
                except Exception as e:
                    print(f"Schema update notice ({sql[:35]}...): {e}")
            conn.commit()

    db = SessionLocal()
    try:
        # 1. Seed or lock ONLY the primary business record: "AC Wale Cars"
        primary_dealer = db.query(models.Dealership).filter(
            (models.Dealership.slug == PRIMARY_DEALERSHIP_SLUG) |
            (models.Dealership.name == PLATFORM_NAME) |
            (models.Dealership.id == 1)
        ).first()

        if not primary_dealer:
            primary_dealer = models.Dealership(
                id=1,
                name=PLATFORM_NAME,
                slug=PRIMARY_DEALERSHIP_SLUG,
                phone_number=PRIMARY_DEALERSHIP_PHONE or None,
                phone_number_2=PRIMARY_DEALERSHIP_PHONE_2 or None,
                email=settings.PRIMARY_DEALERSHIP_EMAIL or None,
                contact_phones_synced=f"{PRIMARY_DEALERSHIP_PHONE}|{PRIMARY_DEALERSHIP_PHONE_2}",
                logo_url="/logo.png",
                telegram_bot_token=os.getenv("TELEGRAM_PLATFORM_BOT_TOKEN") or None,
                telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID") or None,
                is_active=True,
                subscription_plan="pro",
                max_vehicles=1000
            )
            db.add(primary_dealer)
            db.commit()
            db.refresh(primary_dealer)
            print(f"🏢 Created Primary Business Record: '{PLATFORM_NAME}' (ID: {primary_dealer.id}, Slug: '{primary_dealer.slug}', Phone: '{primary_dealer.phone_number}')")
        else:
            # The name is editable in /superadmin Settings: only fill it when it is empty.
            if not (primary_dealer.name or "").strip():
                primary_dealer.name = PLATFORM_NAME
            primary_dealer.slug = PRIMARY_DEALERSHIP_SLUG
            _sync_contact_phones(primary_dealer)
            if not (primary_dealer.email or "").strip() and settings.PRIMARY_DEALERSHIP_EMAIL:
                primary_dealer.email = settings.PRIMARY_DEALERSHIP_EMAIL
            primary_dealer.is_active = True
            primary_dealer.subscription_plan = "pro"
            primary_dealer.max_vehicles = 1000
            db.commit()
            print(f"🏢 Primary Business Record locked: '{primary_dealer.name}' (ID: {primary_dealer.id}, Slug: '{primary_dealer.slug}')")

        # 2. Owners: promote every SUPERADMIN_PHONE number, demote stale superadmins
        _sync_superadmins(db, primary_dealer.id)
        _backfill_staff_permissions(db)
        _backfill_document_fields(db)
        _backfill_gate_pass_tokens(db)

        # 3. Remove the two demo drivers older builds seeded. Real drivers are added by the
        #    owner in /superadmin -> Staff -> Drivers; nothing is seeded any more.
        _remove_demo_drivers(db)

        dealer_count = db.query(models.Dealership).count()
        vehicle_count = db.query(models.Vehicle).count()
        print(f"✓ Database Integrity Check: {dealer_count} Dealership(s), {vehicle_count} Vehicle(s) (clean empty inventory).")
        print("✓ All migrations and seeds completed successfully!")
        return primary_dealer.id
    finally:
        db.close()


if __name__ == "__main__":
    run_migrations()
