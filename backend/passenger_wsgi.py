"""
Phusion Passenger / LiteSpeed entry point for cPanel "Setup Python App" (Yegara Host).

cPanel form values:
    Application root:         repos/waga-auto-ac-wale-dealership/backend
    Application URL:          api.acwalecarmarket.com / v1
    Application startup file: passenger_wsgi.py
    Application entry point:  application

Notes (learned the hard way on Yegara):
- cPanel's Python selector speaks WSGI; FastAPI is ASGI, so a2wsgi bridges them.
- LiteSpeed loads this file once and then FORKS worker processes. a2wsgi starts a
  background event-loop thread when created, and threads do not survive a fork,
  so the bridge must be created lazily inside each worker (see application()).
- Startup/lifespan events do not run here: tables + migrations are created at import
  time in main.py, and the Telegram poller is replaced by /api/telegram/webhook.
- print()/errors go to backend/app_debug.log (cPanel's stderr.log is not created here).
- If cPanel ever replaces this file with its own template (one that calls
  load_source('wsgi', 'passenger_wsgi.py')), restore it with:
      git checkout -- passenger_wsgi.py
"""
import os
import sys
import traceback
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.chdir(BASE_DIR)

_log = open(BASE_DIR / "app_debug.log", "a", encoding="utf-8", buffering=1)
sys.stdout = _log
sys.stderr = _log

_startup_error = None
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env")

    # The repository is public, so the built-in fallback JWT secret is known to everyone.
    _secret = os.getenv("JWT_SECRET_KEY", "").strip().strip("\"'")
    if not _secret or _secret == "elite_motors_super_secret_jwt_key_2026_ethiopia" or _secret.startswith("your_"):
        raise RuntimeError("JWT_SECRET_KEY is missing or still the public default (backend/.env)")

    from a2wsgi import ASGIMiddleware
    from main import app

    print("APP LOADED (pid %s)" % os.getpid())
except Exception:
    _startup_error = traceback.format_exc()
    print(_startup_error)

_bridge = None
_bridge_pid = None


def application(environ, start_response):
    global _bridge, _bridge_pid
    if _startup_error:
        start_response("500 Internal Server Error", [("Content-Type", "text/plain; charset=utf-8")])
        return [("STARTUP ERROR:\n\n" + _startup_error).encode("utf-8")]
    if _bridge is None or _bridge_pid != os.getpid():
        _bridge = ASGIMiddleware(app)
        _bridge_pid = os.getpid()
        print("ASYNC BRIDGE READY (pid %s)" % _bridge_pid)
    return _bridge(environ, start_response)
