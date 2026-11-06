import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import text
from database import engine

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

DEFAULT_TENANT = {
    "name": "Elite Motors Addis",
    "slug": "elite-motors",
    "phone_number": "+251 905 445 544",
    "logo_url": None,
    "telegram_bot_token": os.getenv("TELEGRAM_BOT_TOKEN"),
    "telegram_chat_id": os.getenv("TELEGRAM_CHAT_ID"),
}

def run_migrations():
    """
    Safely applies database schema updates for multi-tenancy and seeds the default dealership tenant.
    Assigns any unassigned vehicles, appointments, and users to the default dealership.
    """
    print("🔄 Running database migrations...")
    import models
    models.Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        # 1. Base legacy column migrations for vehicles (idempotent)
        base_columns = [
            "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_bank_loan BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cash_price FLOAT;",
            "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS bank_loan_amount FLOAT;",
            "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS bank_name VARCHAR;",
            "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS plate_status VARCHAR DEFAULT 'Code 2';",
            "UPDATE vehicles SET plate_status = 'Code 2' WHERE plate_status IS NULL;"
        ]
        for sql in base_columns:
            conn.execute(text(sql))

        # 2. Multi-tenant Dealership table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dealerships (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                phone_number VARCHAR(50),
                logo_url VARCHAR(1000),
                telegram_bot_token VARCHAR(255),
                telegram_chat_id VARCHAR(100),
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dealerships_id ON dealerships (id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dealerships_slug ON dealerships (slug);"))

        # 3. Add foreign key columns to users, vehicles, appointments
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS dealership_id INTEGER REFERENCES dealerships(id);"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);"))
        conn.execute(text("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS dealership_id INTEGER REFERENCES dealerships(id);"))
        conn.execute(text("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS dealership_id INTEGER REFERENCES dealerships(id);"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicles_dealership_id ON vehicles (dealership_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_appointments_dealership_id ON appointments (dealership_id);"))

        # 3.1 SuperAdmin & Monetization columns on dealerships table
        conn.execute(text("ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        conn.execute(text("ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter';"))
        conn.execute(text("ALTER TABLE dealerships ADD COLUMN IF NOT EXISTS max_vehicles INTEGER DEFAULT 50;"))
        conn.execute(text("UPDATE dealerships SET is_active = TRUE WHERE is_active IS NULL;"))
        conn.execute(text("UPDATE dealerships SET subscription_plan = 'starter' WHERE subscription_plan IS NULL;"))
        conn.execute(text("UPDATE dealerships SET max_vehicles = 50 WHERE max_vehicles IS NULL;"))

        # 3.2 Promote SuperAdmin user phone if designated
        superadmin_phone = os.getenv("SUPERADMIN_PHONE", "251918032065")
        conn.execute(
            text("UPDATE users SET role = 'superadmin' WHERE phone_number = :phone;"),
            {"phone": superadmin_phone}
        )

        conn.commit()

        # 4. Find primary active dealership if exists (do NOT re-seed legacy demo showroom)
        check_sql = text("SELECT id FROM dealerships WHERE is_active = TRUE ORDER BY id ASC LIMIT 1;")
        res = conn.execute(check_sql).first()

        if res:
            default_dealership_id = res[0]
            print(f"ℹ️ Active dealership found (ID: {default_dealership_id}).")

            # 5. Assign any orphaned vehicles or appointments to the active dealership
            v_updated = conn.execute(
                text("UPDATE vehicles SET dealership_id = :dealership_id WHERE dealership_id IS NULL;"),
                {"dealership_id": default_dealership_id}
            ).rowcount

            a_updated = conn.execute(
                text("UPDATE appointments SET dealership_id = :dealership_id WHERE dealership_id IS NULL;"),
                {"dealership_id": default_dealership_id}
            ).rowcount

            conn.commit()
            print(f"✓ Backfilled active dealership ID {default_dealership_id} to:")
            print(f"   - Vehicles: {v_updated} updated")
            print(f"   - Appointments: {a_updated} updated")
        else:
            default_dealership_id = None
            print("ℹ️ No active dealerships present. Skipping auto-seed.")

        print("✓ Migration completed successfully!")

    return default_dealership_id

if __name__ == "__main__":
    run_migrations()
