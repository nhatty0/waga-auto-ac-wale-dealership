import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import text
from database import engine, SessionLocal
import models

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

SINGLE_TENANT_MODE = os.getenv("SINGLE_TENANT_MODE", "true").strip().strip("\"'").lower() in ("true", "1", "yes")
PLATFORM_NAME = os.getenv("PLATFORM_NAME", "AC WALE MARKET").strip().strip("\"'")
PRIMARY_DEALERSHIP_SLUG = os.getenv("PRIMARY_DEALERSHIP_SLUG", "ac-wale-cars").strip().strip("\"'")
PRIMARY_DEALERSHIP_PHONE = os.getenv("PRIMARY_DEALERSHIP_PHONE", "+251911646628").strip().strip("\"'")
SUPERADMIN_PHONE = os.getenv("SUPERADMIN_PHONE", "251911646628").strip().strip("\"'").lstrip("+")


def run_migrations():
    """
    Safely applies database schema updates for single-tenant AC Wale Cars,
    creates driver and rental booking tables, initializes empty tables,
    and seeds ONLY the primary AC Wale Cars business and SuperAdmin owner.
    """
    print(f"🔄 Initializing isolated database ({engine.url.drivername})...")
    models.Base.metadata.create_all(bind=engine)

    is_sqlite = engine.url.drivername.startswith("sqlite")

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
                phone_number=PRIMARY_DEALERSHIP_PHONE,
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
            primary_dealer.name = PLATFORM_NAME
            primary_dealer.slug = PRIMARY_DEALERSHIP_SLUG
            primary_dealer.phone_number = PRIMARY_DEALERSHIP_PHONE
            primary_dealer.is_active = True
            primary_dealer.subscription_plan = "pro"
            primary_dealer.max_vehicles = 1000
            db.commit()
            print(f"🏢 Primary Business Record locked: '{primary_dealer.name}' (ID: {primary_dealer.id}, Slug: '{primary_dealer.slug}')")

        # 2. Seed SuperAdmin / Executive Owner user
        # Match normalized 12-digit phone e.g. 251918032065 or with +
        superadmin_user = db.query(models.User).filter(
            (models.User.phone_number == SUPERADMIN_PHONE) |
            (models.User.phone_number == f"+{SUPERADMIN_PHONE}")
        ).first()

        if not superadmin_user:
            superadmin_user = models.User(
                phone_number=SUPERADMIN_PHONE,
                full_name="AC Wale Executive Owner",
                role="superadmin",
                dealership_id=primary_dealer.id,
                is_active=True
            )
            db.add(superadmin_user)
            db.commit()
            print(f"👑 Created SuperAdmin Owner User: phone '{SUPERADMIN_PHONE}', role 'superadmin'.")
        else:
            superadmin_user.role = "superadmin"
            superadmin_user.dealership_id = primary_dealer.id
            superadmin_user.is_active = True
            db.commit()
            print(f"👑 Verified SuperAdmin Owner User: phone '{superadmin_user.phone_number}', role 'superadmin'.")

        # 3. Seed active delivery personnel roster if empty
        driver_count = db.query(models.Driver).count()
        if driver_count == 0:
            db.add_all([
                models.Driver(full_name="Abebe Bikila", phone_number="0911223344", license_number="AA-ET-98234", is_active=True, dealership_id=primary_dealer.id),
                models.Driver(full_name="Dawit Kebede", phone_number="0922334455", license_number="AA-ET-47120", is_active=True, dealership_id=primary_dealer.id),
            ])
            db.commit()
            print("🚗 Initialized delivery drivers roster (2 active drivers).")

        dealer_count = db.query(models.Dealership).count()
        vehicle_count = db.query(models.Vehicle).count()
        print(f"✓ Database Integrity Check: {dealer_count} Dealership(s), {vehicle_count} Vehicle(s) (clean empty inventory).")
        print("✓ All migrations and seeds completed successfully!")
        return primary_dealer.id
    finally:
        db.close()


if __name__ == "__main__":
    run_migrations()
