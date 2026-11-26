"""
One source of truth for the Telegram bot.

  token:     Settings (dealership.telegram_bot_token) if set, else .env
             TELEGRAM_PLATFORM_BOT_TOKEN / TELEGRAM_BOT_TOKEN.
  username:  Settings (dealership.telegram_bot_username) if set, else .env
             TELEGRAM_PLATFORM_BOT_USERNAME / TELEGRAM_BOT_USERNAME.
             "@Name", "t.me/Name" and "https://t.me/Name" are normalized; anything that isn't a
             valid bot username counts as not configured.
             When Telegram's getMe answers for the token, ITS username is used for links (the
             token decides which bot receives /start). A different configured value is reported
             as a mismatch in the status check.

Nothing here raises: when the bot isn't configured, link_username() returns "" and callers show
"Bot username not configured" instead of building a t.me link.
"""
import logging
import os
import re
import threading
import time
from typing import Dict, Optional

import httpx

import models
from settings import settings

logger = logging.getLogger(__name__)

_USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{3,31}$")
_CACHE_TTL = 30.0          # config read from the DB
_GETME_TTL = 600.0         # getMe answers
_lock = threading.Lock()
_cache: Dict[str, object] = {"at": 0.0, "value": None}
_getme: Dict[str, tuple] = {}

NOT_CONFIGURED = "Bot username not configured. Set it in Settings or TELEGRAM_PLATFORM_BOT_USERNAME in .env."


def normalize_username(raw: Optional[str]) -> str:
    v = (raw or "").strip().strip("\"'").strip()
    v = re.sub(r"^(https?://)?(www\.)?(t|telegram)\.me/", "", v, flags=re.I)
    v = v.split("?")[0].strip("/").lstrip("@").strip()
    return v if _USERNAME_RE.match(v) else ""


def _clean_token(raw: Optional[str]) -> str:
    v = (raw or "").strip().strip("\"'").strip()
    return "" if (not v or "your_" in v) else v


def _env_token() -> str:
    return _clean_token(os.getenv("TELEGRAM_PLATFORM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
                        or settings.TELEGRAM_PLATFORM_BOT_TOKEN)


def _env_username_raw() -> str:
    return (os.getenv("TELEGRAM_PLATFORM_BOT_USERNAME") or os.getenv("TELEGRAM_BOT_USERNAME")
            or settings.TELEGRAM_PLATFORM_BOT_USERNAME or "")


def _primary_dealer(db):
    return db.query(models.Dealership).order_by(models.Dealership.id).first()


def _read(db=None) -> dict:
    """Uncached resolution. Opens its own session when none is given."""
    own = db is None
    if own:
        from database import SessionLocal
        db = SessionLocal()
    try:
        dealer = None
        try:
            dealer = _primary_dealer(db)
        except Exception:  # table missing during very early startup
            db.rollback()
        db_token = _clean_token(dealer.telegram_bot_token if dealer else None)
        db_user_raw = (dealer.telegram_bot_username or "").strip() if dealer else ""
        env_token, env_user_raw = _env_token(), _env_username_raw()
        token = db_token or env_token
        user_raw = db_user_raw or env_user_raw
        return {
            "token": token,
            "token_source": "settings" if db_token else ("env" if env_token else None),
            "username_configured": normalize_username(user_raw),
            "username_raw": user_raw.strip(),
            "username_source": "settings" if db_user_raw else ("env" if env_user_raw.strip() else None),
            "dealer_chat_id": ((dealer.telegram_chat_id or "").strip() if dealer else "") or settings.TELEGRAM_CHAT_ID,
        }
    finally:
        if own:
            db.close()


def config(db=None, fresh: bool = False) -> dict:
    now = time.monotonic()
    with _lock:
        if not fresh and _cache["value"] is not None and now - float(_cache["at"]) < _CACHE_TTL:
            return dict(_cache["value"])  # type: ignore[arg-type]
    value = _read(db)
    with _lock:
        _cache.update(at=now, value=value)
    return dict(value)


def invalidate():
    with _lock:
        _cache.update(at=0.0, value=None)
        _getme.clear()


def token(db=None) -> str:
    return config(db)["token"]


def get_me(tok: Optional[str] = None, fresh: bool = False) -> Optional[dict]:
    """Telegram getMe for the token (cached 10 min). None when unreachable / no token."""
    tok = tok if tok is not None else token()
    if not tok:
        return None
    hit = _getme.get(tok)
    if hit and not fresh and time.monotonic() - hit[0] < _GETME_TTL:
        return hit[1]
    if os.getenv("TESTING") == "true" and os.getenv("TELEGRAM_LIVE_TESTS") != "true":
        return None  # never call Telegram from the test suite unless explicitly asked
    result = None
    try:
        r = httpx.get(f"https://api.telegram.org/bot{tok}/getMe", timeout=8.0)
        data = r.json()
        result = data.get("result") if data.get("ok") else {"error": data.get("description") or f"HTTP {r.status_code}"}
    except Exception as e:
        result = {"error": str(e)}
    if result is not None and "error" not in result:
        _getme[tok] = (time.monotonic(), result)
    return result


def link_username(db=None) -> str:
    """Username to put in t.me links: getMe's (authoritative) when reachable, else the configured one."""
    cfg = config(db)
    me = get_me(cfg["token"]) if cfg["token"] else None
    if me and me.get("username"):
        return me["username"]
    return cfg["username_configured"]


def start_link(payload: str, db=None) -> Optional[str]:
    u = link_username(db)
    return f"https://t.me/{u}?start={payload}" if u else None


def default_webhook_url() -> str:
    explicit = (os.getenv("TELEGRAM_WEBHOOK_URL") or settings.TELEGRAM_WEBHOOK_URL or "").strip()
    if explicit:
        return explicit
    api = (os.getenv("PUBLIC_API_URL") or settings.PUBLIC_API_URL or "").strip().rstrip("/")
    return f"{api}/api/telegram/webhook" if api else ""


def webhook_secret() -> str:
    return (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip().strip("\"'")


def _api(method: str, tok: str, payload: Optional[dict] = None) -> dict:
    try:
        r = httpx.post(f"https://api.telegram.org/bot{tok}/{method}", json=payload or {}, timeout=12.0)
        return r.json()
    except Exception as e:
        return {"ok": False, "description": str(e)}


def status(db=None) -> dict:
    """Owner check in Settings: where the config comes from, getMe, getWebhookInfo."""
    cfg = config(db, fresh=True)
    out = {
        "token_set": bool(cfg["token"]),
        "token_source": cfg["token_source"],
        "username": cfg["username_configured"] or None,
        "username_source": cfg["username_source"],
        "username_invalid": bool(cfg["username_raw"]) and not cfg["username_configured"],
        "reachable": False,
        "bot_username": None,
        "bot_name": None,
        "username_mismatch": False,
        "link_username": None,
        "error": None,
        "webhook": None,
        "default_webhook_url": default_webhook_url() or None,
        "webhook_secret_set": bool(webhook_secret()),
        "owner_chat_set": bool(cfg["dealer_chat_id"]),
    }
    if not cfg["token"]:
        out["error"] = "No bot token. Set TELEGRAM_PLATFORM_BOT_TOKEN in backend/.env (or the token in Settings)."
        return out
    me = get_me(cfg["token"], fresh=True)
    if me and "error" not in me:
        out.update(reachable=True, bot_username=me.get("username"), bot_name=me.get("first_name"))
        if cfg["username_configured"] and me.get("username", "").lower() != cfg["username_configured"].lower():
            out["username_mismatch"] = True
    else:
        out["error"] = (me or {}).get("error") or "Telegram did not answer getMe."
    out["link_username"] = (out["bot_username"] or cfg["username_configured"]) or None
    if out["reachable"]:
        info = _api("getWebhookInfo", cfg["token"])
        if info.get("ok"):
            r = info.get("result") or {}
            last = r.get("last_error_date")
            out["webhook"] = {
                "url": r.get("url") or "",
                "pending_update_count": r.get("pending_update_count", 0),
                "allowed_updates": r.get("allowed_updates") or [],
                "last_error_message": r.get("last_error_message") or "",
                "last_error_date": (time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(last)) if last else None),
                "has_callback_query": "callback_query" in (r.get("allowed_updates") or []) or not r.get("allowed_updates"),
            }
        else:
            out["webhook"] = {"error": info.get("description") or "getWebhookInfo failed"}
    return out


def set_webhook(url: str, db=None) -> dict:
    url = (url or "").strip()
    if not url.lower().startswith("https://"):
        return {"ok": False, "description": "The webhook URL must start with https://"}
    tok = config(db, fresh=True)["token"]
    if not tok:
        return {"ok": False, "description": "No bot token configured."}
    payload = {"url": url, "allowed_updates": ["message", "callback_query"], "drop_pending_updates": False}
    secret = webhook_secret()
    if secret:
        payload["secret_token"] = secret
    res = _api("setWebhook", tok, payload)
    logger.info(f"[telegram] setWebhook {url}: {res.get('ok')} {res.get('description')}")
    return {"ok": bool(res.get("ok")), "description": res.get("description") or "",
            "secret_token_used": bool(secret)}
