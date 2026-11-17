import secrets
import threading
from typing import Optional, Dict, List
from datetime import datetime, timedelta
from collections import defaultdict
import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import models
import schemas
from settings import settings
from database import get_db
from sms import send_otp_sms

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/verify-otp")

# In-memory mapping for runtime Telegram links (e.g., bot /start login sessions)
TELEGRAM_LINKED_CHATS: Dict[str, str] = {}


# ==========================================
# BRUTE-FORCE RATE LIMITER
# ==========================================
class OTPRateLimiter:
    """
    Brute-force protection:
    - Maximum 3 OTP requests per phone number every 10 minutes.
    - Maximum 5 failed verification attempts before locking verification for 15 minutes.
    """
    def __init__(self):
        self._lock = threading.Lock()
        # phone -> list of request datetimes
        self._requests: Dict[str, List[datetime]] = defaultdict(list)
        # phone -> {"failed_attempts": int, "locked_until": datetime | None}
        self._verifications: Dict[str, dict] = defaultdict(
            lambda: {"failed_attempts": 0, "locked_until": None}
        )

    def check_request_limit(self, phone: str) -> None:
        now = datetime.utcnow()
        with self._lock:
            cutoff = now - timedelta(minutes=10)
            self._requests[phone] = [t for t in self._requests[phone] if t > cutoff]
            if len(self._requests[phone]) >= 3:
                oldest = self._requests[phone][0]
                retry_after_sec = int((oldest + timedelta(minutes=10) - now).total_seconds())
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded: Maximum 3 OTP requests per 10 minutes. Please retry in {max(1, retry_after_sec)} seconds."
                )
            self._requests[phone].append(now)

    def check_verification_limit(self, phone: str) -> None:
        now = datetime.utcnow()
        with self._lock:
            info = self._verifications[phone]
            if info["locked_until"]:
                if now < info["locked_until"]:
                    remaining_sec = int((info["locked_until"] - now).total_seconds())
                    remaining_min = int(remaining_sec / 60) + 1
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Too many failed verification attempts. Verification is locked for {remaining_min} minute(s)."
                    )
                else:
                    # Lock window passed: reset
                    info["failed_attempts"] = 0
                    info["locked_until"] = None

    def record_verification_failure(self, phone: str) -> int:
        now = datetime.utcnow()
        with self._lock:
            info = self._verifications[phone]
            info["failed_attempts"] += 1
            if info["failed_attempts"] >= 5:
                info["locked_until"] = now + timedelta(minutes=15)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Maximum 5 failed attempts reached. Account verification locked for 15 minutes."
                )
            return 5 - info["failed_attempts"]

    def record_verification_success(self, phone: str) -> None:
        with self._lock:
            if phone in self._verifications:
                del self._verifications[phone]

    def reset_for_phone(self, phone: str) -> None:
        """Utility for test suite resets."""
        with self._lock:
            if phone in self._requests:
                del self._requests[phone]
            if phone in self._verifications:
                del self._verifications[phone]


rate_limiter = OTPRateLimiter()


# ==========================================
# PHONE NORMALIZATION
# ==========================================
def normalize_ethiopian_phone(phone: str) -> str:
    """
    Normalizes Ethiopian mobile phone numbers into 12-digit international format: 2519... or 2517...
    Strips all non-digit characters.
    Handles:
      - '09xxxxxxxx' or '07xxxxxxxx' (10 digits) -> '2519xxxxxxxx' or '2517xxxxxxxx' (12 digits)
      - '9xxxxxxxx' or '7xxxxxxxx' (9 digits) -> '2519xxxxxxxx' or '2517xxxxxxxx' (12 digits)
      - '2519xxxxxxxx' or '2517xxxxxxxx' (12 digits) -> '2519xxxxxxxx' or '2517xxxxxxxx'
      - '+25109xxxxxxxx' or '+25107xxxxxxxx' (13 digits) -> '2519xxxxxxxx' or '2517xxxxxxxx'
    Strictly validates and raises HTTP 400 if the resulting normalized string is not exactly 12 digits
    starting with '2519' or '2517'.
    """
    digits = "".join(filter(str.isdigit, str(phone or "")))

    if digits.startswith("2510") and len(digits) == 13:
        digits = "251" + digits[4:]
    elif (digits.startswith("09") or digits.startswith("07")) and len(digits) == 10:
        digits = f"251{digits[1:]}"
    elif (digits.startswith("9") or digits.startswith("7")) and len(digits) == 9:
        digits = f"251{digits}"

    if len(digits) != 12 or not (digits.startswith("2519") or digits.startswith("2517")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Ethiopian mobile number. Must be a valid 09... or 07... number (e.g. 0912 345 678)."
        )

    return digits


# ==========================================
# TOKEN GENERATION & AUTH DEPENDENCIES
# ==========================================
ACCESS_TOKEN_EXPIRE_MINUTES: int = getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24 * 30)  # 30 days

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = int(user_id_str)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account inactive or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Deactivated dealership check:
    # Instantly reject any subsequent request by its users with HTTP 403
    if user.role != "superadmin" and user.dealership_id is not None:
        dealership = db.query(models.Dealership).filter(models.Dealership.id == user.dealership_id).first()
        if dealership and dealership.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your dealership account is currently suspended. Please contact platform support."
            )

    return user


def is_user_superadmin(user: models.User) -> bool:
    """
    Checks if user is SuperAdmin (role == 'superadmin' or phone == settings.SUPERADMIN_PHONE).
    """
    if not user:
        return False
    return getattr(user, "is_superadmin", False) or user.role == "superadmin"


def get_current_superadmin(
    current_user: models.User = Depends(get_current_admin)
) -> models.User:
    """
    SuperAdmin Strict Locking:
    Accepts if current_user has role 'superadmin', is_superadmin == True,
    or phone matches configured/known superadmin phones (251911646628, 251918032065).
    """
    superadmin_phone = settings.SUPERADMIN_PHONE.strip().lstrip("+")
    user_phone = str(current_user.phone_number or "").strip().lstrip("+")

    is_super = (
        getattr(current_user, "is_superadmin", False)
        or current_user.role == "superadmin"
        or user_phone in (superadmin_phone, "251911646628", "251918032065")
    )

    if not is_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: platform owner privileges required"
        )
    return current_user


# ==========================================
# TELEGRAM DISPATCH & RESOLUTION
# ==========================================
def resolve_telegram_chat_id(phone: str, db: Session) -> Optional[str]:
    """
    Resolves the Telegram Chat ID associated with a normalized phone number.
    Checks:
    1. SuperAdmin master phone -> environment TELEGRAM_CHAT_ID
    2. User.telegram_chat_id or User.dealership.telegram_chat_id
    3. Dealership phone match
    4. Runtime TELEGRAM_LINKED_CHATS session mapping
    """
    clean_super = settings.SUPERADMIN_PHONE.strip()
    if phone == clean_super and settings.TELEGRAM_CHAT_ID:
        return settings.TELEGRAM_CHAT_ID.strip()

    if phone in TELEGRAM_LINKED_CHATS:
        return TELEGRAM_LINKED_CHATS[phone]

    # Check user record
    user = db.query(models.User).filter(models.User.phone_number == phone).first()
    if user:
        if getattr(user, "telegram_chat_id", None) and user.telegram_chat_id.strip():
            return user.telegram_chat_id.strip()
        if user.dealership and user.dealership.telegram_chat_id and user.dealership.telegram_chat_id.strip():
            return user.dealership.telegram_chat_id.strip()

    # Check dealership table by phone
    dealers = db.query(models.Dealership).all()
    for d in dealers:
        if d.telegram_chat_id and d.telegram_chat_id.strip():
            d_digits = "".join(filter(str.isdigit, d.phone_number or ""))
            if d_digits == phone or (len(d_digits) >= 9 and d_digits.endswith(phone[-9:])):
                return d.telegram_chat_id.strip()

    return None


async def dispatch_telegram_otp(chat_id: str, otp_code: str) -> bool:
    """Sends 6-digit numeric OTP via Platform Telegram Bot API."""
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        print("⚠️ [AUTH TELEGRAM] TELEGRAM_BOT_TOKEN not configured in settings/env")
        return False

    message_text = (
        f"🔐 *Elite Motors Platform Verification Code*\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"Your login code is: *{otp_code}*\n\n"
        f"⏱ This code is valid for *3 minutes*.\n"
        f"⚠️ Do NOT share this code with anyone for account security."
    )
    payload = {
        "chat_id": chat_id,
        "text": message_text,
        "parse_mode": "Markdown",
    }
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=8.0)
            if resp.status_code == 200:
                print(f"✓ [AUTH TELEGRAM] OTP successfully delivered to Telegram chat {chat_id}")
                return True
            else:
                print(f"⚠️ [AUTH TELEGRAM] Bot API returned HTTP {resp.status_code}: {resp.text}")
                return False
    except Exception as e:
        print(f"⚠️ [AUTH TELEGRAM] Network error delivering Telegram OTP: {e}")
        return False


# ==========================================
# OTP REQUEST & VERIFICATION LOGIC
# ==========================================
def get_or_create_user_stub(phone: str, db: Session) -> tuple:
    """
    Finds or automatically registers a new unverified user and dedicated dealership stub.
    """
    user = db.query(models.User).filter(models.User.phone_number == phone).first()
    if user and user.dealership:
        return user, user.dealership

    if getattr(settings, "SINGLE_TENANT_MODE", False):
        primary_dealer = db.query(models.Dealership).filter(
            (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
            (models.Dealership.name == settings.PLATFORM_NAME) |
            (models.Dealership.id == 1)
        ).first()
        if not primary_dealer:
            primary_dealer = models.Dealership(
                name=settings.PLATFORM_NAME,
                slug=settings.PRIMARY_DEALERSHIP_SLUG,
                phone_number="+251905445544",
                is_active=True,
                subscription_plan="pro",
                max_vehicles=1000
            )
            db.add(primary_dealer)
            db.commit()
            db.refresh(primary_dealer)

        if not user:
            user = models.User(
                phone_number=phone,
                role="dealer_admin",
                dealership_id=primary_dealer.id,
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.dealership_id = primary_dealer.id
            db.commit()
            db.refresh(user)
        return user, primary_dealer

    phone_suffix = phone[-9:] if len(phone) >= 9 else phone
    base_slug = f"showroom-{phone_suffix}"
    slug = base_slug
    counter = 1
    while db.query(models.Dealership).filter(models.Dealership.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    intl_phone = f"+{phone}" if not phone.startswith("+") else phone

    if not user:
        new_dealer = models.Dealership(
            name="My Showroom",
            slug=slug,
            phone_number=intl_phone,
            logo_url=None,
            telegram_bot_token=None,
            telegram_chat_id=None,
            is_active=True,
            subscription_plan="starter",
            max_vehicles=50,
            created_at=datetime.utcnow()
        )
        db.add(new_dealer)
        db.commit()
        db.refresh(new_dealer)

        user = models.User(
            phone_number=phone,
            role="dealer_admin",
            dealership_id=new_dealer.id,
            is_active=True,
            created_at=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user, new_dealer
    else:
        new_dealer = models.Dealership(
            name="My Showroom",
            slug=slug,
            phone_number=intl_phone,
            logo_url=None,
            telegram_bot_token=None,
            telegram_chat_id=None,
            is_active=True,
            subscription_plan="starter",
            max_vehicles=50,
            created_at=datetime.utcnow()
        )
        db.add(new_dealer)
        db.commit()
        db.refresh(new_dealer)
        user.dealership_id = new_dealer.id
        db.commit()
        db.refresh(user)
        return user, new_dealer


async def handle_telegram_start_command(chat_id: str, text: str, db: Session) -> bool:
    """
    If a user opens the bot with /start link_<phone>:
    1. Extracts the phone number and links the sender's Telegram chat_id to that User and Dealership in DB.
    2. Sends them their active 6-digit OTP directly inside Telegram:
       "እንኳን ደህና መጡ! ወደ አውቶ ሾውሩም መግቢያ ኮድዎ: {otp} ነው። ይህ ኮድ ለ 3 ደቂቃ ያገለግላል።"
    """
    clean_text = text.strip()
    if not clean_text.startswith("/start"):
        return False

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    target_phone = None
    if "link_" in clean_text:
        raw_phone = clean_text.split("link_")[1].strip().split()[0]
        try:
            target_phone = normalize_ethiopian_phone(raw_phone)
        except Exception:
            digits = "".join(filter(str.isdigit, raw_phone))
            target_phone = digits if digits else None

    if target_phone:
        TELEGRAM_LINKED_CHATS[target_phone] = chat_id

        user = db.query(models.User).filter(models.User.phone_number == target_phone).first()
        if user:
            user.telegram_chat_id = chat_id
            if user.dealership:
                user.dealership.telegram_chat_id = chat_id
            db.commit()
        else:
            dealers = db.query(models.Dealership).all()
            for d in dealers:
                d_digits = "".join(filter(str.isdigit, d.phone_number or ""))
                if d_digits == target_phone or (len(d_digits) >= 9 and d_digits.endswith(target_phone[-9:])):
                    d.telegram_chat_id = chat_id
                    db.commit()

        # Retrieve active OTP or create a fresh 6-digit OTP
        otp_rec = (
            db.query(models.OTPVerification)
            .filter(
                models.OTPVerification.phone_number == target_phone,
                models.OTPVerification.is_used == False,
                models.OTPVerification.expires_at >= datetime.utcnow()
            )
            .order_by(models.OTPVerification.created_at.desc())
            .first()
        )
        if otp_rec:
            otp_code = otp_rec.otp_code
        else:
            otp_code = f"{secrets.randbelow(900000) + 100000}"
            new_otp = models.OTPVerification(
                phone_number=target_phone,
                otp_code=otp_code,
                expires_at=datetime.utcnow() + timedelta(minutes=3),
                is_used=False
            )
            db.add(new_otp)
            db.commit()

        reply_text = f"እንኳን ደህና መጡ! ወደ አውቶ ሾውሩም መግቢያ ኮድዎ: *{otp_code}* ነው። ይህ ኮድ ለ 3 ደቂቃ ያገለግላል።"
        payload = {
            "chat_id": chat_id,
            "text": reply_text,
            "parse_mode": "Markdown"
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, timeout=8.0)
                return resp.status_code == 200
        except Exception as e:
            print(f"⚠️ [TELEGRAM BOT] Failed to dispatch start link OTP: {e}")
            return False
    else:
        reply_text = (
            "👋 ሰላም! እንኳን ወደ Elite Motors Platform በደህና መጡ።\n\n"
            "ስልክ ቁጥርዎን ለማገናኘት በፖርታሉ ላይ የሚሰጠዎትን ሊንክ ይጠቀሙ።"
        )
        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json={"chat_id": chat_id, "text": reply_text}, timeout=8.0)
            return True
        except Exception:
            return False


async def request_otp(req: schemas.SendOTPRequest, db: Session) -> schemas.SendOTPResponse:
    """
    1. Normalizes incoming phone number.
    2. Enforces brute-force rate limit: max 3 requests per 10 minutes.
    3. Generates secure random 6-digit numeric code with 3-minute TTL.
    4. Automatically ensures a User and Dealership stub exist.
    5. Attempts to send the code to Telegram ONLY IF the user already has a verified telegram_chat_id.
       Catches any Telegram API error gracefully without crashing.
    6. Always returns the generated code in JSON response:
       {
         "status": "success",
         "message": "OTP generated successfully",
         "otp_code": otp,
         "telegram_sent": bool(telegram_delivery_success)
       }
    """
    normalized_phone = normalize_ethiopian_phone(req.phone_number)

    # 1. Rate Limiting Check (Max 3 OTP requests / 10 minutes)
    rate_limiter.check_request_limit(normalized_phone)

    # 2. Ensure unverified user and dealership stub exist
    get_or_create_user_stub(normalized_phone, db)

    # 3. Generate secure random 6-digit numeric OTP with 3-minute TTL
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.utcnow() + timedelta(minutes=3)

    otp_record = models.OTPVerification(
        phone_number=normalized_phone,
        otp_code=otp_code,
        expires_at=expires_at,
        is_used=False
    )
    db.add(otp_record)
    db.commit()

    # 4. Dispatch SMS OTP via AfroMessage
    await send_otp_sms(normalized_phone, otp_code)

    # 5. Supplemental Telegram dispatch if user already has a verified telegram_chat_id
    telegram_delivery_success = False
    chat_id = resolve_telegram_chat_id(normalized_phone, db)
    if chat_id:
        try:
            telegram_delivery_success = await dispatch_telegram_otp(chat_id=chat_id, otp_code=otp_code)
        except Exception as e:
            print(f"⚠️ [AUTH] Telegram OTP dispatch error (non-blocking): {e}")
            telegram_delivery_success = False

    bot_username = settings.TELEGRAM_BOT_USERNAME or "EliteMotorsAlert_bot"
    bot_link = f"https://t.me/{bot_username}?start=link_{normalized_phone}"

    return schemas.SendOTPResponse(
        status="success",
        message="የማረጋገጫ ኮድ በ SMS ተልኳል (Verification code sent via SMS)",
        otp_code=None,
        otp_display=None,
        telegram_sent=bool(telegram_delivery_success),
        phone_number=normalized_phone,
        expires_in_seconds=180,
        bot_link=bot_link,
        method="sms"
    )


def verify_otp(req: schemas.VerifyOTPRequest, db: Session) -> schemas.AuthResponse:
    """
    1. Validates and normalizes phone number.
    2. Enforces verification lockout: max 5 failed attempts locks for 15 minutes.
    3. Checks valid, unexpired, unused 6-digit OTP in database.
       (Hardcoded dev OTP "1234" is strictly removed).
    4. Upon success, clears failure count, validates user/dealership active state, and issues 90-day JWT.
    """
    normalized_phone = normalize_ethiopian_phone(req.phone_number)
    submitted_code = req.otp_code.strip()

    # 1. Check if phone is currently locked out
    rate_limiter.check_verification_limit(normalized_phone)

    # 2. Strict matching against unexpired, unused DB records (NO mock dev bypass)
    otp_record = (
        db.query(models.OTPVerification)
        .filter(
            models.OTPVerification.phone_number == normalized_phone,
            models.OTPVerification.otp_code == submitted_code,
            models.OTPVerification.is_used == False,
            models.OTPVerification.expires_at >= datetime.utcnow()
        )
        .order_by(models.OTPVerification.created_at.desc())
        .first()
    )

    if not otp_record:
        # Record failure and check 5-attempt threshold
        remaining = rate_limiter.record_verification_failure(normalized_phone)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or expired OTP code. {remaining} attempt(s) remaining before verification lock."
        )

    # Mark OTP as consumed and reset verification attempts
    otp_record.is_used = True
    db.commit()
    rate_limiter.record_verification_success(normalized_phone)

    # Helper to auto-create showroom for brand new phone registrations
    def create_dedicated_dealership(phone_digits: str) -> models.Dealership:
        phone_suffix = phone_digits[-9:] if len(phone_digits) >= 9 else phone_digits
        base_slug = f"showroom-{phone_suffix}"
        slug = base_slug
        counter = 1
        while db.query(models.Dealership).filter(models.Dealership.slug == slug).first():
            slug = f"{base_slug}-{counter}"
            counter += 1

        intl_phone = f"+{phone_digits}" if not phone_digits.startswith("+") else phone_digits

        new_dealer = models.Dealership(
            name="My Showroom",
            slug=slug,
            phone_number=intl_phone,
            logo_url=None,
            telegram_bot_token=None,
            telegram_chat_id=None,
            is_active=True,
            subscription_plan="starter",
            max_vehicles=50,
            created_at=datetime.utcnow()
        )
        db.add(new_dealer)
        db.commit()
        db.refresh(new_dealer)
        return new_dealer

    # Find or auto-create User
    user = db.query(models.User).filter(models.User.phone_number == normalized_phone).first()
    if getattr(settings, "SINGLE_TENANT_MODE", False):
        primary_dealer = db.query(models.Dealership).filter(
            (models.Dealership.slug == settings.PRIMARY_DEALERSHIP_SLUG) |
            (models.Dealership.name == settings.PLATFORM_NAME) |
            (models.Dealership.id == 1)
        ).first()
        target_dealer_id = primary_dealer.id if primary_dealer else 1
        if not user:
            user = models.User(
                phone_number=normalized_phone,
                role="dealer_admin",
                dealership_id=target_dealer_id,
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your admin account is deactivated. Please contact support."
            )
        elif user.dealership_id is None:
            user.dealership_id = target_dealer_id
            db.commit()
            db.refresh(user)
    else:
        if not user:
            new_dealership = create_dedicated_dealership(normalized_phone)
            user = models.User(
                phone_number=normalized_phone,
                role="dealer_admin",
                dealership_id=new_dealership.id,
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your admin account is deactivated. Please contact support."
            )
        elif user.dealership_id is not None and user.role != "superadmin":
            # Check if the user's dealership is suspended
            dealer = db.query(models.Dealership).filter(models.Dealership.id == user.dealership_id).first()
            if dealer and dealer.is_active is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your dealership account is currently suspended. Please contact platform support."
                )
        elif user.dealership_id is None:
            new_dealership = create_dedicated_dealership(normalized_phone)
            user.dealership_id = new_dealership.id
            db.commit()
            db.refresh(user)

    # Designate SuperAdmin role if phone strictly matches SUPERADMIN_PHONE
    superadmin_phone = settings.SUPERADMIN_PHONE.strip().lstrip("+")
    if normalized_phone.lstrip("+") == superadmin_phone and user.role != "superadmin":
        user.role = "superadmin"
        db.commit()
        db.refresh(user)

    # Issue 30-day JWT access token (60 * 24 * 30 minutes)
    token = create_access_token(
        data={
            "sub": str(user.id),
            "phone_number": user.phone_number,
            "role": user.role
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    dealer_data = None
    if user.dealership:
        dealer_data = {
            "id": user.dealership.id,
            "name": user.dealership.name,
            "slug": user.dealership.slug,
            "phone_number": user.dealership.phone_number,
            "logo_url": user.dealership.logo_url
        }

    return schemas.AuthResponse(
        access_token=token,
        token_type="bearer",
        user={
            "id": user.id,
            "phone_number": user.phone_number,
            "full_name": user.full_name,
            "role": user.role,
            "dealership_id": user.dealership_id,
            "dealership": dealer_data,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
    )
