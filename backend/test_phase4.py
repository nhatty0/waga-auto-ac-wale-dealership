import os
import sys
import io
from pathlib import Path
from unittest.mock import patch, MagicMock
from PIL import Image

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from main import app, create_access_token
from storage import optimize_image_to_webp, upload_media_file, is_s3_configured

client = TestClient(app)

def create_sample_image(width=2000, height=1200, format="JPEG") -> bytes:
    """Helper to generate an in-memory sample image for compression testing."""
    img = Image.new("RGB", (width, height), color=(255, 120, 30))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()

def test_phase4():
    print("🚀 Starting Phase 4: Media Optimization & Cloud Storage Tests...\n")

    # 1. Test image compression pipeline
    raw_jpeg = create_sample_image(width=2400, height=1600, format="JPEG")
    optimized_webp = optimize_image_to_webp(raw_jpeg, max_width=1600, quality=80)

    # Verify WebP header signature
    assert optimized_webp[:4] == b"RIFF" and b"WEBP" in optimized_webp[:16], "Output is not valid WebP format"

    # Verify resolution is resized to 1600px width
    with Image.open(io.BytesIO(optimized_webp)) as webp_img:
        assert webp_img.format == "WEBP", f"Expected WEBP, got {webp_img.format}"
        assert webp_img.width == 1600, f"Expected max width 1600, got {webp_img.width}"
        assert webp_img.height == 1066, f"Expected aspect ratio preserved height ~1066, got {webp_img.height}"

    # Verify size reduction
    size_reduction_pct = (1.0 - (len(optimized_webp) / len(raw_jpeg))) * 100
    print(f"✓ Test 1: Image resized from 2400px to 1600px and converted to WebP (Size: {len(raw_jpeg)}B -> {len(optimized_webp)}B, {size_reduction_pct:.1f}% reduction)")

    # 2. Test Local Storage WebP Upload
    local_url = upload_media_file(raw_jpeg, prefix="test_car", max_width=1600, quality=80)
    assert local_url.endswith(".webp"), f"Local URL must end with .webp: {local_url}"
    assert "http://127.0.0.1:8000/uploads/" in local_url
    filename = local_url.split("/")[-1]
    saved_path = backend_dir / "uploads" / filename
    assert saved_path.exists(), f"Saved WebP file not found at {saved_path}"
    # Cleanup saved test file
    saved_path.unlink(missing_ok=True)
    print(f"✓ Test 2: Local storage fallback wrote optimized WebP file: {local_url}")

    # 3. Test Pluggable S3 / Cloudflare R2 Upload Adaptor
    mock_s3 = MagicMock()
    with patch("storage.USE_S3_STORAGE", True), \
         patch("storage.S3_BUCKET_NAME", "my-showroom-bucket"), \
         patch("storage.S3_ACCESS_KEY", "mock_key"), \
         patch("storage.S3_SECRET_KEY", "mock_secret"), \
         patch("storage.S3_PUBLIC_CUSTOM_DOMAIN", "https://cdn.showroom.et"), \
         patch("storage.get_s3_client", return_value=mock_s3):

        s3_url = upload_media_file(raw_jpeg, prefix="cloud_car")
        assert s3_url.startswith("https://cdn.showroom.et/uploads/cloud_car_"), f"Unexpected S3 CDN URL: {s3_url}"
        assert s3_url.endswith(".webp")

        # Verify S3 client was called with correct parameters
        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args[1]
        assert call_kwargs["Bucket"] == "my-showroom-bucket"
        assert call_kwargs["ContentType"] == "image/webp"
        assert call_kwargs["CacheControl"] == "public, max-age=31536000"
        print(f"✓ Test 3: Pluggable S3/R2 Cloud Storage Adaptor uploaded WebP to CDN: {s3_url}")

    # 4. Test API endpoint POST /api/admin/upload-images with WebP compression
    db = SessionLocal()
    try:
        dealer = db.query(models.Dealership).filter(models.Dealership.slug == "elite-motors").first()
        admin = db.query(models.User).filter(models.User.dealership_id == dealer.id).first()
        token = create_access_token({"sub": str(admin.id), "phone_number": admin.phone_number, "role": admin.role})
        headers = {"Authorization": f"Bearer {token}"}

        test_files = [
            ("files", ("photo1.jpg", io.BytesIO(create_sample_image(2000, 1500)), "image/jpeg")),
            ("files", ("photo2.png", io.BytesIO(create_sample_image(1800, 1200)), "image/png"))
        ]
        res_upload = client.post("/api/admin/upload-images", files=test_files, headers=headers)
        assert res_upload.status_code == 200, f"Upload images failed: {res_upload.text}"
        urls = res_upload.json()
        assert len(urls) == 2
        for url in urls:
            assert url.endswith(".webp"), f"Vehicle photo URL must be .webp: {url}"
            fname = url.split("/")[-1]
            (backend_dir / "uploads" / fname).unlink(missing_ok=True)
        print("✓ Test 4: POST /api/admin/upload-images compressed incoming images to .webp")

        # 5. Test API endpoint POST /api/admin/dealership/logo with WebP compression
        logo_file = {"file": ("my_dealership_logo.png", io.BytesIO(create_sample_image(1200, 1200)), "image/png")}
        res_logo = client.post("/api/admin/dealership/logo", files=logo_file, headers=headers)
        assert res_logo.status_code == 200, f"Upload logo failed: {res_logo.text}"
        logo_url = res_logo.json()["logo_url"]
        assert logo_url.endswith(".webp"), f"Logo URL must be .webp: {logo_url}"
        logo_fname = logo_url.split("/")[-1]
        (backend_dir / "uploads" / logo_fname).unlink(missing_ok=True)
        print("✓ Test 5: POST /api/admin/dealership/logo compressed incoming logo to .webp")

        print("\n🎉 ALL PHASE 4 MEDIA OPTIMIZATION TESTS PASSED! 🚀")
    finally:
        db.close()

if __name__ == "__main__":
    test_phase4()
