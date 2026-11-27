"""
Company stamp (ማህተም) for printed Document Center documents. Superadmin-only.

The image lives in backend/private/ (committed to git, deployed by git pull) and is NEVER under a
static mount: /static and /uploads serve backend/static only. The only way to get the image is
GET /api/superadmin/stamp with a superadmin token; staff and anonymous callers get 401/403.

The frontend turns the response into a data: URL before printing, because the print iframe /
print view cannot fetch with an Authorization header.
"""
import io
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

import models
from auth import get_current_superadmin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/superadmin", tags=["stamp"])

PRIVATE_DIR = Path(__file__).resolve().parent.parent / "private"
STAMP_PATH = Path(os.getenv("STAMP_PATH", "").strip() or PRIVATE_DIR / "ac-wale-stamp.png")

# ~3.5 cm on paper; 640 px keeps it sharp at 450+ dpi while the data URL stays small.
STAMP_MAX_PX = 640

_cache: dict = {"mtime": None, "png": None}


def _stamp_png() -> Optional[bytes]:
    if not STAMP_PATH.is_file():
        return None
    mtime = STAMP_PATH.stat().st_mtime
    if _cache["mtime"] == mtime and _cache["png"]:
        return _cache["png"]
    raw = STAMP_PATH.read_bytes()
    try:
        from PIL import Image

        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGBA")
            im.thumbnail((STAMP_MAX_PX, STAMP_MAX_PX), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=True)
            png = buf.getvalue()
    except Exception as e:  # Pillow missing or the file is odd: send the original
        logger.warning(f"Stamp resize failed, sending the original: {e}")
        png = raw
    _cache.update(mtime=mtime, png=png)
    return png


@router.get("/stamp")
def get_stamp(user: models.User = Depends(get_current_superadmin)):
    png = _stamp_png()
    if png is None:
        raise HTTPException(status_code=404, detail="No company stamp is installed on the server.")
    return Response(
        content=png,
        media_type="image/png",
        headers={
            # Never cached by the browser or a proxy: it is fetched fresh, kept in memory only.
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
        },
    )
