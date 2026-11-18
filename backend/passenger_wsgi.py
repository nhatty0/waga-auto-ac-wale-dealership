"""
Phusion Passenger entry point for cPanel "Setup Python App" (Yegara Host).

cPanel's Python selector only speaks WSGI, while FastAPI is ASGI, so the app is
wrapped with a2wsgi. Startup/lifespan events do NOT run under this adapter:
tables and migrations are already created at import time in main.py, and the
Telegram long-poller is replaced by the /api/telegram/webhook endpoint.

cPanel form values:
    Application startup file: passenger_wsgi.py
    Application entry point:  application
"""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.chdir(BASE_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BASE_DIR / ".env")

# The repository is public, so the built-in fallback JWT secret is known to everyone.
# Refuse to start in production until a real secret is configured.
_DEFAULT_SECRET = "elite_motors_super_secret_jwt_key_2026_ethiopia"
_secret = os.getenv("JWT_SECRET_KEY", "").strip().strip("\"'")
if not _secret or _secret == _DEFAULT_SECRET or _secret.startswith("your_"):
    raise RuntimeError(
        "JWT_SECRET_KEY is missing or still the public default. "
        "Set a long random value in backend/.env or the cPanel Python App environment variables."
    )

from a2wsgi import ASGIMiddleware  # noqa: E402
from main import app  # noqa: E402

application = ASGIMiddleware(app)
