import os
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock
from datetime import datetime, timedelta

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
import schemas
from main import app, create_access_token, send_telegram_alert

client = TestClient(app)

def test_phase3():
    print("🚀 Starting Phase 3: Dealer Settings Management & Dynamic Telegram Routing Tests...\n")
    db = SessionLocal()

    try:
        # Setup dealer & admin
        dealer = db.query(models.Dealership).filter(models.Dealership.slug == "elite-motors").first()
        assert dealer is not None, "Elite motors dealership must exist"

        admin = db.query(models.User).filter(models.User.dealership_id == dealer.id).first()
        assert admin is not None, "Admin user must exist"

        token = create_access_token({"sub": str(admin.id), "phone_number": admin.phone_number, "role": admin.role})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test GET /api/admin/dealership
        res_get = client.get("/api/admin/dealership", headers=headers)
        assert res_get.status_code == 200, f"GET failed: {res_get.text}"
        data = res_get.json()
        assert data["id"] == dealer.id
        assert data["name"] == dealer.name
        assert data["slug"] == dealer.slug
        assert "telegram_bot_token" in data
        assert "telegram_chat_id" in data
        print(f"✓ Test 1: GET /api/admin/dealership returned settings for '{data['name']}' (ID: {data['id']})")

        # 2. Test PUT /api/admin/dealership
        original_name = dealer.name
        original_phone = dealer.phone_number
        original_logo = dealer.logo_url
        original_token = dealer.telegram_bot_token
        original_chat = dealer.telegram_chat_id

        update_payload = {
            "name": "Elite Motors Premium Addis",
            "phone_number": "+251 905 999 888",
            "logo_url": "https://example.com/elite-logo.png",
            "telegram_bot_token": "123456789:TEST_BOT_TOKEN_PHASE3",
            "telegram_chat_id": "987654321"
        }

        # Verify PUT /api/admin/dealership ONLY updates database fields without sending any Telegram alert
        put_posts = []
        async def put_fake_post(self, url, json=None, timeout=None):
            put_posts.append(url)
            class MockResponse:
                status_code = 200
                text = '{"ok": true}'
            return MockResponse()

        with patch("httpx.AsyncClient.post", put_fake_post):
            res_put = client.put("/api/admin/dealership", json=update_payload, headers=headers)
            assert res_put.status_code == 200, f"PUT failed: {res_put.text}"
            assert len(put_posts) == 0, f"PUT /api/admin/dealership must NOT trigger any Telegram alerts! Found: {put_posts}"
            updated_data = res_put.json()
            assert updated_data["name"] == update_payload["name"]
            assert updated_data["phone_number"] == update_payload["phone_number"]
            assert updated_data["logo_url"] == update_payload["logo_url"]
            assert updated_data["telegram_bot_token"] == update_payload["telegram_bot_token"]
            assert updated_data["telegram_chat_id"] == update_payload["telegram_chat_id"]
            print("✓ Test 2: PUT /api/admin/dealership ONLY updated database fields (0 auto-alert calls triggered)")

        # 3. Test isolated Telegram dispatch with custom credentials
        # Create a second dealer with dedicated telegram credentials
        dealer2 = db.query(models.Dealership).filter(models.Dealership.slug == "phase3-tenant2").first()
        if not dealer2:
            dealer2 = models.Dealership(
                name="Tenant 2 Motors",
                slug="phase3-tenant2",
                phone_number="+251 911 000 222",
                telegram_bot_token="BOT_TOKEN_DEALER_2",
                telegram_chat_id="CHAT_ID_DEALER_2"
            )
            db.add(dealer2)
            db.commit()
            db.refresh(dealer2)

        admin2 = db.query(models.User).filter(models.User.phone_number == "251999888777").first()
        if not admin2:
            admin2 = models.User(
                phone_number="251999888777",
                full_name="Tenant 2 Admin",
                role="dealer_admin",
                dealership_id=dealer2.id,
                is_active=True
            )
            db.add(admin2)
            db.commit()
            db.refresh(admin2)

        token2 = create_access_token({"sub": str(admin2.id), "phone_number": admin2.phone_number, "role": admin2.role})
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Mock httpx.AsyncClient.post to verify targeted Telegram routing
        mock_posts = []

        async def fake_post(self, url, json=None, timeout=None):
            mock_posts.append({"url": str(url), "json": json})
            class MockResponse:
                status_code = 200
                text = '{"ok": true, "result": {}}'
            return MockResponse()

        with patch("httpx.AsyncClient.post", fake_post):
            # Test POST /api/admin/dealership/test-telegram for Admin 2
            res_test_tg = client.post("/api/admin/dealership/test-telegram", headers=headers2)
            assert res_test_tg.status_code == 200, f"Test alert failed: {res_test_tg.text}"
            assert res_test_tg.json()["success"] is True

            assert len(mock_posts) == 1
            assert "BOT_TOKEN_DEALER_2" in mock_posts[0]["url"], f"Expected BOT_TOKEN_DEALER_2 in URL: {mock_posts[0]['url']}"
            assert mock_posts[0]["json"]["chat_id"] == "CHAT_ID_DEALER_2"
            assert "Tenant 2 Motors" in mock_posts[0]["json"]["text"]
            print("✓ Test 3: POST /api/admin/dealership/test-telegram routed to dealer-specific Telegram bot & chat")

            # 4. Test Appointment creation routes Telegram alert dynamically
            mock_posts.clear()
            apt_payload = {
                "dealership_id": dealer2.id,
                "customer_name": "Test Customer Phase 3",
                "phone_number": "0911223344",
                "preferred_channel": "Telegram",
                "appointment_type": "Virtual Video Tour",
                "date": "2026-11-05",
                "time_slot": "02:00 PM",
                "notes": "Testing isolated dispatch"
            }
            res_apt = client.post("/api/appointments", json=apt_payload)
            assert res_apt.status_code == 201, f"Appointment failed: {res_apt.text}"

            assert len(mock_posts) == 1
            assert "BOT_TOKEN_DEALER_2" in mock_posts[0]["url"]
            assert mock_posts[0]["json"]["chat_id"] == "CHAT_ID_DEALER_2"
            assert "Tenant 2 Motors" in mock_posts[0]["json"]["text"]
            print("✓ Test 4: POST /api/appointments dynamically dispatched alert to dealer-specific Telegram endpoint")

        # 5. Test Logo upload via POST /api/admin/dealership/logo
        import io
        fake_file = io.BytesIO(b"fake_logo_png_bytes")
        files = {"file": ("showroom_emblem.png", fake_file, "image/png")}
        res_logo = client.post("/api/admin/dealership/logo", files=files, headers=headers)
        assert res_logo.status_code == 200, f"Logo upload failed: {res_logo.text}"
        assert "logo_1_" in res_logo.json()["logo_url"]
        print("✓ Test 5: POST /api/admin/dealership/logo uploaded file and updated logo_url")

        # 6. Test Tenant Isolation on new phone number registration
        new_reg_phone = "0944332211"
        # Ensure phone doesn't exist
        db.query(models.User).filter(models.User.phone_number == "251944332211").delete()
        db.commit()

        db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == "251944332211").delete()
        db.add(models.OTPVerification(phone_number="251944332211", otp_code="849201", expires_at=datetime.utcnow() + timedelta(minutes=3), is_used=False))
        db.commit()
        res_reg = client.post("/api/auth/verify-otp", json={"phone_number": new_reg_phone, "otp_code": "849201"})
        assert res_reg.status_code == 200, f"Registration failed: {res_reg.text}"
        reg_user = res_reg.json()["user"]
        assert reg_user["dealership"] is not None
        assert reg_user["dealership"]["name"] == "My Showroom"
        assert reg_user["dealership"]["slug"].startswith("showroom-")
        assert reg_user["dealership_id"] != dealer.id, "New registering phone must NOT inherit Dealership #1!"
        
        # Verify new tenant has 0 vehicles
        reg_token = res_reg.json()["access_token"]
        res_reg_v = client.get("/api/admin/vehicles", headers={"Authorization": f"Bearer {reg_token}"})
        assert len(res_reg_v.json()) == 0, "New registering user must have an empty showroom!"
        print("✓ Test 6: Tenant Isolation for new phone registrations verified (creates dedicated showroom, 0 data bleeding)")

        # Cleanup new registering tenant
        db.query(models.User).filter(models.User.id == reg_user["id"]).delete()
        db.query(models.Dealership).filter(models.Dealership.id == reg_user["dealership_id"]).delete()
        db.commit()

        # Revert dealer 1 settings to original
        revert_payload = {
            "name": original_name,
            "phone_number": original_phone,
            "logo_url": original_logo,
            "telegram_bot_token": original_token,
            "telegram_chat_id": original_chat
        }
        client.put("/api/admin/dealership", json=revert_payload, headers=headers)

        # Cleanup test dealer 2 & admin 2
        db.query(models.Appointment).filter(models.Appointment.dealership_id == dealer2.id).delete(synchronize_session=False)
        db.query(models.User).filter(models.User.id == admin2.id).delete(synchronize_session=False)
        db.query(models.Dealership).filter(models.Dealership.id == dealer2.id).delete(synchronize_session=False)
        db.commit()
        print("✓ Cleanup completed: Test tenant purged, original settings restored.")

        print("\n🎉 ALL PHASE 3 TESTS PASSED SUCCESSFULLY! 🚀")

    finally:
        db.close()

if __name__ == "__main__":
    test_phase3()
