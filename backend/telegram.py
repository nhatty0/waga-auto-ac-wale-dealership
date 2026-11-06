import logging
from typing import Any, Optional, Tuple
import httpx

logger = logging.getLogger(__name__)


def normalize_ethiopian_phone_digits(phone: str) -> str:
    """Normalizes phone number to international Ethiopian format digits (e.g. 251911223344)."""
    raw_digits = "".join(filter(str.isdigit, str(phone or "")))
    if raw_digits.startswith("09") or raw_digits.startswith("07"):
        return f"251{raw_digits[1:]}"
    elif (raw_digits.startswith("9") or raw_digits.startswith("7")) and len(raw_digits) == 9:
        return f"251{raw_digits}"
    elif raw_digits.startswith("251"):
        return raw_digits
    return raw_digits


def format_booking_lead_caption(
    booking: Any,
    vehicle_title: Optional[str] = None,
    vehicle_price: float = 0.0,
    dealer_name: Optional[str] = None
) -> Tuple[str, dict]:
    """
    Formats the new booking lead notification message for Telegram with Amharic and English headers.
    Returns (message_text, reply_markup).
    """
    raw_phone = getattr(booking, "phone_number", "")
    intl_phone = normalize_ethiopian_phone_digits(raw_phone)

    customer_name = getattr(booking, "customer_name", "Valued Customer")
    safe_name = str(customer_name).replace("*", "").replace("_", " ")

    appointment_type = getattr(booking, "appointment_type", "Test Drive")
    appointment_type_str = getattr(appointment_type, "value", str(appointment_type))

    preferred_channel = getattr(booking, "preferred_channel", "Telegram")
    date_val = getattr(booking, "date", "")
    time_val = getattr(booking, "time_slot", "")
    schedule_display = f"{date_val} at {time_val}".strip() if time_val else date_val

    dealer_header = f"🏢 *ሾውሩም:* {dealer_name}\n" if dealer_name else ""
    price_line = f"💰 *ዋጋ:* {vehicle_price:,.0f} ETB\n" if vehicle_price > 0 else ""

    message_text = (
        f"🚗 *አዲስ የደንበኛ ቀጠሮ (New Booking Lead)*\n"
        f"{dealer_header}"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🚘 *መኪና:* {vehicle_title or 'General Showroom Inquiry'}\n"
        f"👤 *ደንበኛ:* {safe_name} (`+{intl_phone}`)\n"
        f"📅 *ቀን:* {schedule_display}\n"
        f"💬 *መንገድ (Channel):* {preferred_channel}\n"
        f"📍 *አይነት (Type):* {appointment_type_str}\n"
        f"{price_line}"
    )

    notes = getattr(booking, "notes", None)
    if notes:
        safe_notes = str(notes).replace("*", "").replace("_", " ")
        message_text += f"📝 *ማስታወሻ (Notes):* _{safe_notes}_\n"

    reply_markup = {
        "inline_keyboard": [
            [
                {
                    "text": "💬 Open Telegram Chat",
                    "url": f"https://t.me/+{intl_phone}"
                }
            ]
        ]
    }

    return message_text, reply_markup


async def send_telegram_lead(
    bot_token: str,
    chat_id: str,
    booking: Any,
    vehicle_title: Optional[str] = None,
    vehicle_price: float = 0.0,
    dealer_name: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Dispatches a formatted booking lead to the dealership's specific Telegram channel/chat.
    """
    message_text, reply_markup = format_booking_lead_caption(
        booking=booking,
        vehicle_title=vehicle_title,
        vehicle_price=vehicle_price,
        dealer_name=dealer_name
    )

    payload = {
        "chat_id": chat_id,
        "text": message_text,
        "parse_mode": "Markdown",
        "reply_markup": reply_markup
    }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, timeout=8.0)
            if resp.status_code == 200:
                logger.info(f"Telegram lead successfully delivered to chat {chat_id}")
                return True, "Delivered successfully"
            else:
                try:
                    desc = resp.json().get("description", resp.text)
                except Exception:
                    desc = resp.text
                err_msg = f"Telegram API error ({resp.status_code}): {desc}"
                logger.warning(err_msg)
                return False, err_msg
        except Exception as e:
            err_msg = f"Network error sending Telegram lead: {str(e)}"
            logger.error(err_msg)
            return False, err_msg


async def send_telegram_test_message(
    bot_token: str,
    chat_id: str,
    dealer_name: str
) -> Tuple[bool, str]:
    """
    Sends a test verification ping to verify bot token and chat ID connectivity.
    Returns (success, message_or_error).
    """
    test_message = (
        "🔔 *የቴሌግራም ቦት ማረጋገጫ (Bot Verified)*\n\n"
        f"ድርጅት: {dealer_name}\n"
        "ሁኔታ: ቦቱ በትክክል ተገናኝቷል! የደንበኞች ቀጠሮ እና ጥያቄዎች እዚህ ይደርሳሉ።"
    )

    payload = {
        "chat_id": chat_id,
        "text": test_message,
        "parse_mode": "Markdown"
    }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, timeout=8.0)
            if resp.status_code == 200:
                return True, f"Test alert sent successfully to Telegram Chat ID: {chat_id}!"
            else:
                try:
                    desc = resp.json().get("description", resp.text)
                except Exception:
                    desc = resp.text
                return False, f"Telegram API Error ({resp.status_code}): {desc}"
        except Exception as e:
            return False, f"Network error connecting to Telegram: {str(e)}"
