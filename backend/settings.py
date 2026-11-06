import os
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:Alphacode%4037@localhost:5432/elite_motors_db"
    )
    PORT: int = int(os.getenv("PORT", "8000"))
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "elite_motors_super_secret_jwt_key_2026_ethiopia")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30

    # Dedicated Platform Master SuperAdmin Phone (12 digits international format)
    SUPERADMIN_PHONE: str = os.getenv("SUPERADMIN_PHONE", "251918032065").strip().strip("\"'")

    # Central Platform Telegram Bot Credentials & Username (1-Click Deep-Linking)
    TELEGRAM_PLATFORM_BOT_TOKEN: str = (
        os.getenv("TELEGRAM_PLATFORM_BOT_TOKEN") or
        os.getenv("TELEGRAM_BOT_TOKEN", "")
    ).strip().strip("\"'")
    TELEGRAM_PLATFORM_BOT_USERNAME: str = (
        os.getenv("TELEGRAM_PLATFORM_BOT_USERNAME") or
        os.getenv("TELEGRAM_BOT_USERNAME", "WagaDealershipBot")
    ).strip().strip("\"'").lstrip("@")

    # Backwards compatibility aliases
    TELEGRAM_BOT_TOKEN: str = TELEGRAM_PLATFORM_BOT_TOKEN
    TELEGRAM_BOT_USERNAME: str = TELEGRAM_PLATFORM_BOT_USERNAME
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "").strip().strip("\"'")

    # AfroMessage SMS Gateway Configuration
    AFROMESSAGE_API_TOKEN: str = (os.getenv("AFROMESSAGE_API_TOKEN") or "").strip().strip("\"'")
    AFROMESSAGE_IDENTIFIER_ID: Optional[str] = (os.getenv("AFROMESSAGE_IDENTIFIER_ID") or "").strip().strip("\"'") or None
    AFROMESSAGE_SENDER_NAME: Optional[str] = (os.getenv("AFROMESSAGE_SENDER_NAME") or "").strip().strip("\"'") or None
    ENABLE_SMS_DISPATCH: bool = os.getenv("ENABLE_SMS_DISPATCH", "true").strip().strip("\"'").lower() in ("true", "1", "yes")

    # Storage Settings
    USE_S3_STORAGE: bool = os.getenv("USE_S3_STORAGE", "false").lower() == "true"
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "")
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
    S3_PUBLIC_CUSTOM_DOMAIN: str = os.getenv("S3_PUBLIC_CUSTOM_DOMAIN", "")


settings = Settings()
