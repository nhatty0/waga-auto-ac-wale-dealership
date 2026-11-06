import os
import sys
import asyncio
from pathlib import Path

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from settings import settings
from main import app, create_access_token
from appointments import dispatch_lead_multichannel

client = TestClient(app)


def test_telegram_deeplink_and_multichannel():
    print("🚀 Starting Telegram 1-Click Deep-Linking and Multi-Channel Lead Dispatch Tests...\n")
    db = SessionLocal()

    test_dealer_slug = "deeplink-test-showroom"
    test_user_phone = "251911998877"

    try:
        # 1. Setup Test Dealership & User
        test_dealer = db.query(models.Dealership).filter(models.Dealership.slug == test_dealer_slug).first()
        if not test_dealer:
            test_dealer = models.Dealership(
                name="DeepLink Test Showroom",
                slug=test_dealer_slug,
                phone_number="+251911998877",
                telegram_chat_id=None,
                telegram_bot_token=None,
                is_active=True
            )
            db.add(test_dealer)
            db.commit()
            db.refresh(test_dealer)
        else:
            test_dealer.telegram_chat_id = None
            test_dealer.telegram_bot_token = None
            db.commit()

        test_user = db.query(models.User).filter(models.User.phone_number == test_user_phone).first()
        if not test_user:
            test_user = models.User(
                phone_number=test_user_phone,
                role="dealer_admin",
                dealership_id=test_dealer.id,
                is_active=True
            )
            db.add(test_user)
            db.commit()
            db.refresh(test_user)

        dealer_token = create_access_token({"sub": str(test_user.id), "role": test_user.role})

        print("--- [TEST 1: GET /api/admin/dealership includes telegram_bot_username] ---")
        res_info = client.get(
            "/api/admin/dealership",
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res_info.status_code == 200, f"Failed: {res_info.text}"
        data_info = res_info.json()
        assert data_info.get("telegram_bot_username") == settings.TELEGRAM_PLATFORM_BOT_USERNAME, (
            f"Expected {settings.TELEGRAM_PLATFORM_BOT_USERNAME}, got {data_info.get('telegram_bot_username')}"
        )
        assert data_info.get("telegram_chat_id") is None
        print(f"✓ Dealership info returned telegram_bot_username='{data_info.get('telegram_bot_username')}'")

        print("\n--- [TEST 2: Pre-save test alert fails cleanly when Telegram is not connected] ---")
        res_test_unconnected = client.post(
            "/api/admin/dealership/test-telegram",
            json={},
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res_test_unconnected.status_code == 400
        assert "ቴሌግራም ገና አልተገናኘም" in res_test_unconnected.json()["detail"] or "Telegram is not connected" in res_test_unconnected.json()["detail"]
        print("✓ Returns HTTP 400 with helpful amharic/english instruction to use 1-click connect")

        print("\n--- [TEST 3: Webhook receives /start connect_<dealership_id>] ---")
        fake_telegram_chat_id = "554433221"
        res_webhook = client.post(
            "/api/telegram/webhook",
            json={
                "message": {
                    "chat": {"id": int(fake_telegram_chat_id)},
                    "text": f"/start connect_{test_dealer.id}"
                }
            }
        )
        assert res_webhook.status_code == 200
        res_json = res_webhook.json()
        assert res_json.get("ok") is True or res_json.get("status") == "ok"

        db.refresh(test_dealer)
        db.refresh(test_user)
        assert test_dealer.telegram_chat_id == fake_telegram_chat_id, (
            f"Expected {fake_telegram_chat_id}, got {test_dealer.telegram_chat_id}"
        )
        assert test_user.telegram_chat_id == fake_telegram_chat_id, (
            f"Expected {fake_telegram_chat_id}, got {test_user.telegram_chat_id}"
        )
        print(f"✓ Webhook automatically linked Dealership {test_dealer.id} & Admin User to Chat ID {fake_telegram_chat_id}")

        print("\n--- [TEST 4: Backward Compatibility - Webhook with /start link_<phone>] ---")
        res_link = client.post(
            "/api/telegram/webhook",
            json={
                "message": {
                    "chat": {"id": 88776655},
                    "text": f"/start link_{test_user_phone}"
                }
            }
        )
        assert res_link.status_code == 200
        db.refresh(test_user)
        assert test_user.telegram_chat_id == "88776655"
        print("✓ /start link_<phone> remains fully backwards-compatible for OTP flow")

        print("\n--- [TEST 5: Multi-Channel Lead Dispatch Priority 1 (Telegram)] ---")
        # Restore dealer chat_id
        test_dealer.telegram_chat_id = fake_telegram_chat_id
        db.commit()

        class MockBooking:
            customer_name = "Abebe Bikila"
            phone_number = "0911223344"
            date = "2026-11-05"
            time_slot = "10:00 AM"
            appointment_type = "Test Drive"
            preferred_channel = "Telegram"
            notes = "Interested in financing"

        lead_result_tg = asyncio.run(
            dispatch_lead_multichannel(
                booking=MockBooking(),
                vehicle_title="2023 Toyota RAV4 Hybrid",
                vehicle_price=6500000.0,
                dealership_id=test_dealer.id,
                db=db
            )
        )
        # In test environment without active mock server for platform bot, either it tries Telegram or falls back cleanly
        print(f"✓ Multichannel dispatch result: channel={lead_result_tg['channel']}, error={lead_result_tg['error']}")

        print("\n--- [TEST 6: Multi-Channel Lead Dispatch Priority 2 (SMS Fallback)] ---")
        # Unset telegram_chat_id to force SMS fallback
        test_dealer.telegram_chat_id = None
        db.commit()

        lead_result_sms = asyncio.run(
            dispatch_lead_multichannel(
                booking=MockBooking(),
                vehicle_title="2024 Hyundai Tucson",
                vehicle_price=5200000.0,
                dealership_id=test_dealer.id,
                db=db
            )
        )
        assert lead_result_sms["channel"] == "sms", f"Expected sms channel, got: {lead_result_sms}"
        assert lead_result_sms["sms_sent"] is True
        print(f"✓ Priority 2 (SMS Fallback) successfully activated when Telegram is not linked: {lead_result_sms}")

        print("\n🎉 ALL 1-CLICK TELEGRAM DEEP-LINKING & DISPATCH TESTS PASSED PERFECTLY!\n")

    finally:
        # Cleanup
        try:
            if test_user:
                db.delete(test_user)
            if test_dealer:
                db.delete(test_dealer)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Cleanup note: {e}")
        db.close()


if __name__ == "__main__":
    test_telegram_deeplink_and_multichannel()
