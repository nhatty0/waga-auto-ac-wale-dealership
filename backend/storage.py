import os
import io
import uuid
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Upload directories for static file serving & fallback
# STATIC_ROOT lets production keep media outside the code folder (e.g. on cPanel:
# /home/<user>/acwale_data/static) so redeploys never wipe uploaded vehicle photos.
_static_root_env = os.getenv("STATIC_ROOT", "").strip().strip("\"'")
STATIC_DIR = Path(_static_root_env) if _static_root_env else Path(__file__).resolve().parent / "static"
UPLOAD_DIR = STATIC_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Dual-write legacy upload directory for backward compatibility.
# Disabled when STATIC_ROOT is set (it only doubled disk usage; /uploads is served from UPLOAD_DIR).
LEGACY_UPLOAD_DIR = UPLOAD_DIR if _static_root_env else Path(__file__).resolve().parent / "uploads"
LEGACY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Cloud Storage Configuration (Cloudflare R2 / AWS S3)
USE_S3_STORAGE = os.getenv("USE_S3_STORAGE", "false").lower() in ("true", "1", "yes")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
S3_PUBLIC_CUSTOM_DOMAIN = os.getenv("S3_PUBLIC_CUSTOM_DOMAIN")
S3_REGION_NAME = os.getenv("S3_REGION_NAME", "auto")

# Base URL for local static file serving (relative path /static/uploads by default)
LOCAL_BASE_URL = os.getenv("LOCAL_BASE_URL", "/static/uploads")

_s3_client = None

def get_s3_client():
    """Lazily initializes and returns the S3/R2 client if credentials are configured."""
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config

        session = boto3.session.Session()
        _s3_client = session.client(
            service_name="s3",
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            endpoint_url=S3_ENDPOINT_URL,
            region_name=S3_REGION_NAME,
            config=Config(s3={"addressing_style": "virtual" if not S3_ENDPOINT_URL else "path"})
        )
    return _s3_client


def is_s3_configured() -> bool:
    """Checks whether valid S3 / Cloudflare R2 credentials and bucket are present."""
    return bool(USE_S3_STORAGE and S3_BUCKET_NAME and S3_ACCESS_KEY and S3_SECRET_KEY)


def optimize_image_to_webp(image_bytes: bytes, max_width: int = 1600, quality: int = 80) -> bytes:
    """
    Compresses and optimizes an image:
      1. Corrects EXIF rotation (smartphones/iPhone photos).
      2. Converts CMYK / P modes cleanly to RGB or RGBA.
      3. Resizes down to max_width preserving aspect ratio.
      4. Exports to high-efficiency WebP format with quality=80.
    """
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(image_bytes)) as img:
        # Correct orientation from EXIF tags
        img = ImageOps.exif_transpose(img)

        # Mode normalization: handle palette or CMYK modes
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale proportionally if width exceeds max_width
        orig_width, orig_height = img.size
        if orig_width > max_width:
            target_height = max(1, int((max_width / orig_width) * orig_height))
            img = img.resize((max_width, target_height), Image.Resampling.LANCZOS)

        output_buffer = io.BytesIO()
        img.save(output_buffer, format="WEBP", quality=quality, method=4)
        return output_buffer.getvalue()


def upload_media_file(
    file_bytes: bytes,
    prefix: str = "img",
    max_width: int = 1600,
    quality: int = 80
) -> str:
    """
    Processes the raw file bytes through the optimization pipeline and saves it
    either to Cloudflare R2 / AWS S3 or to local disk uploads. Returns the public access URL.
    """
    # 1. Compress and convert to .webp
    try:
        optimized_webp = optimize_image_to_webp(file_bytes, max_width=max_width, quality=quality)
    except Exception as e:
        print(f"Image optimization notice ({e}), storing original binary.")
        optimized_webp = file_bytes

    # Generate unique filename
    unique_filename = f"{prefix}_{uuid.uuid4().hex[:12]}.webp"

    # 2. Upload to Cloudflare R2 / AWS S3 if enabled
    if is_s3_configured():
        try:
            s3 = get_s3_client()
            key = f"uploads/{unique_filename}"
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=key,
                Body=optimized_webp,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000"
            )

            # Determine public CDN URL
            if S3_PUBLIC_CUSTOM_DOMAIN:
                return f"{S3_PUBLIC_CUSTOM_DOMAIN.rstrip('/')}/{key}"
            elif S3_ENDPOINT_URL:
                # Direct bucket endpoint URL
                return f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET_NAME}/{key}"
            else:
                return f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{key}"
        except Exception as err:
            print(f"Cloud Storage upload failed ({err}). Falling back to local storage.")

    # 3. Graceful Local Storage Fallback
    local_path = UPLOAD_DIR / unique_filename
    with open(local_path, "wb") as f:
        f.write(optimized_webp)

    # Dual-write to legacy upload directory for backward compatibility
    try:
        legacy_path = LEGACY_UPLOAD_DIR / unique_filename
        with open(legacy_path, "wb") as f:
            f.write(optimized_webp)
    except Exception as e:
        print(f"Notice: legacy dual-write skipped ({e})")

    # Clean and resolve public URL
    base = LOCAL_BASE_URL.strip().rstrip('/')
    if base.startswith("http://127.0.0.1:8000/uploads") or base.startswith("http://localhost:8000/uploads"):
        base = "/static/uploads"
    elif base.startswith("http://127.0.0.1:8000/static") or base.startswith("http://localhost:8000/static"):
        base = "/static" + base.split("/static", 1)[1]
    elif not base.startswith('/') and not base.startswith('http'):
        base = f"/{base}"

    return f"{base}/{unique_filename}"


def delete_media_file(file_url: str) -> bool:
    """
    Deletes physical media file from local upload directories and S3 if configured.
    """
    if not file_url:
        return False
    try:
        # Strip query parameters and directory prefixes to isolate filename
        filename = Path(file_url.split("?")[0]).name
        if not filename or filename in (".", ".."):
            return False

        deleted = False

        # 1. Local upload directory
        local_path = UPLOAD_DIR / filename
        if local_path.is_file():
            try:
                local_path.unlink()
                deleted = True
            except Exception as e:
                print(f"Notice: Failed to delete local file {local_path}: {e}")

        # 2. Legacy upload directory
        legacy_path = LEGACY_UPLOAD_DIR / filename
        if legacy_path.is_file():
            try:
                legacy_path.unlink()
                deleted = True
            except Exception as e:
                pass

        # 3. Cloud S3 / Cloudflare R2 if configured
        if is_s3_configured():
            try:
                s3 = get_s3_client()
                key = f"uploads/{filename}"
                s3.delete_object(Bucket=S3_BUCKET_NAME, Key=key)
                deleted = True
            except Exception as e:
                print(f"Notice: Failed to delete S3 object {filename}: {e}")

        return deleted
    except Exception as err:
        print(f"Error in delete_media_file: {err}")
        return False

