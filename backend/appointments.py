import logging
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
import models
from settings import settings
from telegram import format_booking_lead_caption, send_telegram_lead
from sms import send_lead_sms

logger = logging.getLogger(__name__)


async def dispatch_lead_multichannel(
    booking: Any,
    vehicle_title: str,
    vehicle_price: float = 0.0,
    dealership_id: Optional[int] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Multi-Channel Lead Dispatch:
    - Priority 1 (Telegram): If dealership.telegram_chat_id is present, dispatch the formatted
      lead via the platform bot to that chat ID.
    - Priority 2 (SMS Fallback via AfroMessage): If Telegram is not connected or Telegram dispatch fails,
      dispatch an instant SMS alert to the dealer's registered phone number:
      "አዲስ የመኪና ቀጠሮ ከ Waga! ደንበኛ: [Name] ([Phone]) ለመኪና: [Car Title]። እባክዎ ደውለው ያነጋግሯቸው።"
    """
    local_db = False
    if db is None:
        from database import SessionLocal
        db = SessionLocal()
        local_db = True

    dealer = None
    owner_chats = []
    try:
        if dealership_id:
            dealer = db.query(models.Dealership).filter(models.Dealership.id == dealership_id).first()
        if dealer:
            import gate_pass
            owner_chats = gate_pass.owner_chats(db)
    finally:
        if local_db and db:
            db.close()

    result = {
        "telegram_sent": False,
        "sms_sent": False,
        "channel": None,
        "error": None
    }

    if not dealer:
        logger.warning(f"No dealership found for ID {dealership_id}. Lead dispatch skipped.")
        return result

    # Resolve platform bot token (or dealer custom token if legacy record exists)
    import tg_config
    bot_token = tg_config.token()

    customer_name = getattr(booking, "customer_name", "Valued Customer")
    customer_phone = getattr(booking, "phone_number", "")

    # ==========================================
    # Priority 1: Telegram Notification to every owner chat
    # (dealership chat, TELEGRAM_CHAT_ID, owners who linked their own Telegram)
    # ==========================================
    result["chats"] = []
    if owner_chats and bot_token:
        for chat_id in owner_chats:
            success, info = await send_telegram_lead(
                bot_token=bot_token,
                chat_id=chat_id,
                booking=booking,
                vehicle_title=vehicle_title,
                vehicle_price=vehicle_price,
                dealer_name=dealer.name
            )
            if success:
                result["chats"].append(chat_id)
            else:
                logger.warning(f"⚠️ [LEAD DISPATCH] Telegram to {chat_id} failed: {info}")
                result["error"] = info
        if result["chats"]:
            result["telegram_sent"] = True
            result["channel"] = "telegram"
            logger.info(f"✓ [LEAD DISPATCH] Telegram delivered to {len(result['chats'])} owner chat(s) for {dealer.name}")
            return result
        logger.warning("⚠️ [LEAD DISPATCH] Telegram reached no owner chat. Falling back to Priority 2 (SMS).")

    # ==========================================
    # Priority 2: SMS Fallback via AfroMessage
    # ==========================================
    dealer_phone = getattr(dealer, "phone_number", None)
    if dealer_phone and dealer_phone.strip():
        sms_success = await send_lead_sms(
            dealer_phone=dealer_phone.strip(),
            customer_name=customer_name,
            customer_phone=customer_phone,
            vehicle_title=vehicle_title
        )
        if sms_success:
            result["sms_sent"] = True
            result["channel"] = "sms"
            logger.info(f"✓ [LEAD DISPATCH] Priority 2 (AfroMessage SMS) delivered to dealer {dealer_phone}")
            return result
        else:
            logger.error(f"✗ [LEAD DISPATCH] Priority 2 (AfroMessage SMS) failed to {dealer_phone}")
    else:
        logger.warning(f"⚠️ [LEAD DISPATCH] Dealership {dealer.id} has no phone_number configured for SMS fallback.")

    return result
