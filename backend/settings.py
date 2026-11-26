import os
from typing import List, Optional
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()


class Settings:
    # Single-Tenant Configuration
    SINGLE_TENANT_MODE: bool = os.getenv("SINGLE_TENANT_MODE", "true").strip().strip("\"'").lower() in ("true", "1", "yes")
    PLATFORM_NAME: str = os.getenv("PLATFORM_NAME", "AC WALE MARKET").strip().strip("\"'")
    PRIMARY_DEALERSHIP_SLUG: str = os.getenv("PRIMARY_DEALERSHIP_SLUG", "ac-wale-cars").strip().strip("\"'")
    PRIMARY_DEALERSHIP_NAME: str = os.getenv("PRIMARY_DEALERSHIP_NAME", "AC WALE MARKET").strip().strip("\"'")
    # Public contact lines shown on the showroom, flyers, print sheets and share text.
    PRIMARY_DEALERSHIP_PHONE: str = os.getenv("PRIMARY_DEALERSHIP_PHONE", "+251983112211").strip().strip("\"'")
    PRIMARY_DEALERSHIP_PHONE_2: str = os.getenv("PRIMARY_DEALERSHIP_PHONE_2", "+251989113211").strip().strip("\"'")
    # Printed on document letterheads; only fills an empty dealership e-mail (Settings wins after that).
    PRIMARY_DEALERSHIP_EMAIL: str = os.getenv("PRIMARY_DEALERSHIP_EMAIL", "acwalecarmarket@gmail.com").strip().strip("\"'")

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./ac_wale_cars.db"
    )
    PORT: int = int(os.getenv("PORT", "8000"))
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "elite_motors_super_secret_jwt_key_2026_ethiopia")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30

    # Owner (superadmin) phones: comma-separated, any format ("251900061300,0918032065").
    # This list is the only thing that grants superadmin; see is_superadmin_phone().
    SUPERADMIN_PHONE: str = os.getenv("SUPERADMIN_PHONE", "251918032065").strip().strip("\"'")

    # Central Platform Telegram Bot Credentials & Username (1-Click Deep-Linking)
    TELEGRAM_PLATFORM_BOT_TOKEN: str = (
        os.getenv("TELEGRAM_PLATFORM_BOT_TOKEN") or
        os.getenv("TELEGRAM_BOT_TOKEN", "")
    ).strip().strip("\"'")
    # No hardcoded fallback: an empty value means "not configured" (tg_config shows that instead of
    # building a t.me link to some other bot). tg_config also normalizes "@name" / "t.me/name".
    TELEGRAM_PLATFORM_BOT_USERNAME: str = (
        os.getenv("TELEGRAM_PLATFORM_BOT_USERNAME") or
        os.getenv("TELEGRAM_BOT_USERNAME") or ""
    ).strip().strip("\"'").lstrip("@")
    # Webhook (Settings -> Telegram status -> Set webhook). TELEGRAM_WEBHOOK_URL wins; else
    # PUBLIC_API_URL + /api/telegram/webhook (e.g. https://api.acwalecarmarket.com/v1).
    TELEGRAM_WEBHOOK_SECRET: str = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip().strip("\"'")
    TELEGRAM_WEBHOOK_URL: str = (os.getenv("TELEGRAM_WEBHOOK_URL") or "").strip().strip("\"'")
    PUBLIC_API_URL: str = (os.getenv("PUBLIC_API_URL") or "").strip().strip("\"'").rstrip("/")

    # Backwards compatibility aliases
    TELEGRAM_BOT_TOKEN: str = TELEGRAM_PLATFORM_BOT_TOKEN
    TELEGRAM_BOT_USERNAME: str = TELEGRAM_PLATFORM_BOT_USERNAME
    # Public website (verify links in Telegram messages and on printed gate passes).
    PUBLIC_SITE_URL: str = (os.getenv("PUBLIC_SITE_URL") or "https://acwalecarmarket.com").strip().strip("\"'").rstrip("/")
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


def normalize_phone_digits(phone) -> str:
    """
    Non-raising Ethiopian phone normalizer used for comparisons.
    Strips "+", spaces and every other non-digit, then maps 09…/07… (and 9…/7…, 2510…)
    to the 12-digit 2519…/2517… form. Anything else is returned as bare digits.
    """
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("2510") and len(digits) == 13:
        return "251" + digits[4:]
    if digits[:2] in ("09", "07") and len(digits) == 10:
        return "251" + digits[1:]
    if digits[:1] in ("9", "7") and len(digits) == 9:
        return "251" + digits
    return digits


def parse_phone_list(raw: str) -> List[str]:
    """Comma/semicolon/newline separated phones -> unique normalized list (order kept).
    Spaces inside one number ("0918 032 065") are fine; they are stripped by the normalizer."""
    out: List[str] = []
    for part in str(raw or "").replace(";", ",").replace("\n", ",").split(","):
        norm = normalize_phone_digits(part.strip().strip("\"'"))
        if norm and norm not in out:
            out.append(norm)
    return out


settings = Settings()


def superadmin_phones() -> List[str]:
    """Normalized owner phones from SUPERADMIN_PHONE (read live, so tests/overrides apply)."""
    return parse_phone_list(settings.SUPERADMIN_PHONE)


def is_superadmin_phone(phone) -> bool:
    """True when `phone` (any format) is one of the configured SUPERADMIN_PHONE numbers."""
    norm = normalize_phone_digits(phone)
    return bool(norm) and norm in superadmin_phones()
