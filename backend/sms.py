import httpx
import logging
from config import settings

logger = logging.getLogger(__name__)

async def send_otp_sms(phone_number: str, otp_code: str) -> bool:
    token = (settings.AFROMESSAGE_API_TOKEN or "").strip().strip("\"'")
    if not token or not settings.ENABLE_SMS_DISPATCH:
        logger.warning(f"[MOCK SMS] Dispatching to {phone_number}: OTP={otp_code}")
        return True

    # Remove "Bearer " if accidentally included in the .env variable
    if token.lower().startswith("bearer "):
        token = token[7:].strip().strip("\"'")

    # Normalize phone number to standard 10-digit Ethiopian format (09... or 07...)
    normalized_phone = phone_number.replace("+251", "0") if phone_number.startswith("+251") else phone_number
    if normalized_phone.startswith("251"):
        normalized_phone = "0" + normalized_phone[3:]

    # AfroMessage single SMS API expects an HTTP GET request with query parameters:
    # https://api.afromessage.com/api/send?from=...&sender=...&to=...&message=...
    url = "https://api.afromessage.com/api/send"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    params = {
        "to": normalized_phone,
        "message": f"የአውቶ ሾውሩም መግቢያ ኮድ: {otp_code} ነው። በ 3 ደቂቃ ውስጥ ይጠቀሙበት። (AutoShowroom Login Code: {otp_code})",
    }

    if settings.AFROMESSAGE_SENDER_NAME:
        params["sender"] = settings.AFROMESSAGE_SENDER_NAME.strip().strip("\"'")
    if hasattr(settings, "AFROMESSAGE_IDENTIFIER_ID") and settings.AFROMESSAGE_IDENTIFIER_ID:
        params["from"] = settings.AFROMESSAGE_IDENTIFIER_ID.strip().strip("\"'")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, params=params, headers=headers)
            
            if res.status_code == 200:
                data = res.json()
                if data.get("acknowledge") == "success":
                    msg_id = data.get("response", {}).get("message_id")
                    logger.info(f"✓ [AFROMESSAGE] SMS sent successfully to {normalized_phone} (ID: {msg_id})")
                    return True
                else:
                    logger.error(f"✗ [AFROMESSAGE] API returned error: {data.get('response')}")
                    return False
            else:
                logger.error(f"✗ [AFROMESSAGE] HTTP {res.status_code}: {res.text}")
                return False
    except Exception as e:
        logger.error(f"✗ [AFROMESSAGE] Exception during dispatch: {e}")
        return False


async def send_lead_sms(
    dealer_phone: str,
    customer_name: str,
    customer_phone: str,
    vehicle_title: str
) -> bool:
    """
    Dispatches an instant SMS alert to the dealer's registered phone number via AfroMessage.
    Format:
    "አዲስ የመኪና ቀጠሮ ከ Waga! ደንበኛ: [Name] ([Phone]) ለመኪና: [Car Title]። እባክዎ ደውለው ያነጋግሯቸው።"
    """
    token = (settings.AFROMESSAGE_API_TOKEN or "").strip().strip("\"'")
    if not token or not settings.ENABLE_SMS_DISPATCH:
        logger.warning(
            f"[MOCK LEAD SMS] Dispatching to {dealer_phone}: Customer {customer_name} ({customer_phone}) for {vehicle_title}"
        )
        return True

    # Remove "Bearer " if accidentally included in the .env variable
    if token.lower().startswith("bearer "):
        token = token[7:].strip().strip("\"'")

    raw_phone = str(dealer_phone or "")
    normalized_phone = raw_phone.replace("+251", "0") if raw_phone.startswith("+251") else raw_phone
    if normalized_phone.startswith("251"):
        normalized_phone = "0" + normalized_phone[3:]

    message_body = (
        f"አዲስ የመኪና ቀጠሮ ከ Waga! ደንበኛ: {customer_name} ({customer_phone}) "
        f"ለመኪና: {vehicle_title}። እባክዎ ደውለው ያነጋግሯቸው።"
    )

    url = "https://api.afromessage.com/api/send"
    headers = {
        "Authorization": f"Bearer {token}"
    }

    params = {
        "to": normalized_phone,
        "message": message_body,
    }

    if settings.AFROMESSAGE_SENDER_NAME:
        params["sender"] = settings.AFROMESSAGE_SENDER_NAME.strip().strip("\"'")
    if hasattr(settings, "AFROMESSAGE_IDENTIFIER_ID") and settings.AFROMESSAGE_IDENTIFIER_ID:
        params["from"] = settings.AFROMESSAGE_IDENTIFIER_ID.strip().strip("\"'")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, params=params, headers=headers)
            if res.status_code == 200:
                data = res.json()
                if data.get("acknowledge") == "success":
                    msg_id = data.get("response", {}).get("message_id")
                    logger.info(f"✓ [AFROMESSAGE LEAD SMS] Lead SMS sent successfully to {normalized_phone} (ID: {msg_id})")
                    return True
                else:
                    logger.error(f"✗ [AFROMESSAGE LEAD SMS] API returned error: {data.get('response')}")
                    return False
            else:
                logger.error(f"✗ [AFROMESSAGE LEAD SMS] HTTP {res.status_code}: {res.text}")
                return False
    except Exception as e:
        logger.error(f"✗ [AFROMESSAGE LEAD SMS] Exception during dispatch: {e}")
        return False
