from unittest.mock import patch
import uuid
from fastapi.testclient import TestClient
from main import app, create_access_token, send_telegram_alert
from database import SessionLocal
import models
import schemas
from settings import settings

client = TestClient(app)


def test_telegram_multitenant_flow():
    db = SessionLocal()
    # Clean up previous runs if any in correct foreign key order
    old_dealers = db.query(models.Dealership).filter(models.Dealership.slug.like("test-multitenant-%")).all()
    for od in old_dealers:
        db.query(models.Appointment).filter(models.Appointment.dealership_id == od.id).delete()
        db.query(models.Vehicle).filter(models.Vehicle.dealership_id == od.id).delete()
        db.query(models.User).filter(models.User.dealership_id == od.id).delete()
        db.delete(od)
    db.commit()

    unique_suffix = uuid.uuid4().hex[:6]
    test_slug = f"test-multitenant-{unique_suffix}"
    test_phone = f"251911{uuid.uuid4().int % 1000000:06d}"

    test_dealer = None
    try:
        # 1. Setup a test dealership with specific Telegram credentials
        test_dealer = models.Dealership(
            name="Test MultiTenant Motors",
            slug=test_slug,
            phone_number=test_phone,
            telegram_bot_token="111111:SPECIFIC_DEALER_BOT_TOKEN",
            telegram_chat_id="-10099887766"
        )
        db.add(test_dealer)
        db.commit()
        db.refresh(test_dealer)

        # Create admin user for this dealership
        user = models.User(
            phone_number=test_phone,
            role="dealer_admin",
            dealership_id=test_dealer.id,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token({"sub": str(user.id), "phone_number": user.phone_number, "role": user.role})
        headers = {"Authorization": f"Bearer {token}"}

        # Setup a vehicle for this dealer
        car = models.Vehicle(
            dealership_id=test_dealer.id,
            make="Toyota",
            model="Land Cruiser",
            year=2024,
            price=25000000.0,
            status=models.VehicleStatus.AVAILABLE,
            fuel_type="Petrol",
            transmission="Automatic",
            body_type="SUV"
        )
        db.add(car)
        db.commit()
        db.refresh(car)

        # 2. Test testing with credentials passed in request body (testing before save)
        mock_posts = []

        async def fake_success_post(self, url, json=None, timeout=None):
            mock_posts.append({"url": str(url), "json": json})
            class MockResponse:
                status_code = 200
                text = '{"ok": true, "result": {}}'
                def json(self):
                    return {"ok": True, "result": {}}
            return MockResponse()

        with patch("httpx.AsyncClient.post", fake_success_post):
            res_body_test = client.post(
                "/api/admin/dealership/test-telegram",
                json={
                    "telegram_bot_token": "999999:TEST_BEFORE_SAVE_TOKEN",
                    "telegram_chat_id": "-10011223344"
                },
                headers=headers
            )
            assert res_body_test.status_code == 200, res_body_test.text
            assert "999999:TEST_BEFORE_SAVE_TOKEN" in mock_posts[0]["url"]
            assert mock_posts[0]["json"]["chat_id"] == "-10011223344"
            print("✓ Test passed: POST /api/admin/dealership/test-telegram respects body credentials before saving")

        # 3. Test alias endpoint /api/admin/telegram/test with stored credentials
        mock_posts.clear()
        with patch("httpx.AsyncClient.post", fake_success_post):
            res_alias_test = client.post(
                "/api/admin/telegram/test",
                headers=headers
            )
            assert res_alias_test.status_code == 200, res_alias_test.text
            assert "111111:SPECIFIC_DEALER_BOT_TOKEN" in mock_posts[0]["url"]
            assert mock_posts[0]["json"]["chat_id"] == "-10099887766"
            print("✓ Test passed: POST /api/admin/telegram/test uses stored dealership credentials")

        # 4. Test error handling when Telegram returns an error (HTTP 400 Bad Request, chat not found)
        async def fake_error_post(self, url, json=None, timeout=None):
            class MockErrorResponse:
                status_code = 400
                text = '{"ok": false, "error_code": 400, "description": "Bad Request: chat not found"}'
                def json(self):
                    return {"ok": False, "error_code": 400, "description": "Bad Request: chat not found"}
            return MockErrorResponse()

        with patch("httpx.AsyncClient.post", fake_error_post):
            res_err = client.post(
                "/api/admin/dealership/test-telegram",
                json={"telegram_bot_token": "INVALID", "telegram_chat_id": "INVALID"},
                headers=headers
            )
            assert res_err.status_code == 400
            assert "chat not found" in res_err.json()["detail"]
            print("✓ Test passed: Invalid Telegram credentials return HTTP 400 with Telegram error detail")

        # 5. Test booking creation sends lead to dealer's specific Telegram bot & chat
        mock_posts.clear()
        with patch("httpx.AsyncClient.post", fake_success_post):
            apt_payload = {
                "vehicle_id": car.id,
                "customer_name": "Abebe Kebede",
                "phone_number": "0912345678",
                "preferred_channel": "Telegram",
                "appointment_type": "In-Person Test Drive",
                "date": "2026-11-01",
                "time_slot": "10:00 AM",
                "notes": "Interested in white color"
            }
            res_apt = client.post("/api/appointments", json=apt_payload)
            assert res_apt.status_code == 201
            data = res_apt.json()
            assert data["dealership_id"] == test_dealer.id
            assert "Toyota Land Cruiser" in data.get("vehicle_title", "")

            # Verify Telegram dispatch
            assert len(mock_posts) == 1
            assert "111111:SPECIFIC_DEALER_BOT_TOKEN" in mock_posts[0]["url"]
            assert mock_posts[0]["json"]["chat_id"] == "-10099887766"
            msg = mock_posts[0]["json"]["text"]
            assert "አዲስ የደንበኛ ቀጠሮ" in msg
            assert "2024 Toyota Land Cruiser" in msg
            assert "Abebe Kebede" in msg
            assert "0912345678" in msg or "251912345678" in msg
            print("✓ Test passed: Booking dispatches properly formatted lead to dealer Telegram bot")

        # 6. Test vehicle inquire alias endpoint
        mock_posts.clear()
        with patch("httpx.AsyncClient.post", fake_success_post):
            inquire_payload = {
                "customer_name": "Sara Haile",
                "phone_number": "0922334455",
                "preferred_channel": "Telegram",
                "appointment_type": "Virtual Video Tour",
                "date": "2026-11-02",
                "time_slot": "02:00 PM",
                "notes": "Video call please"
            }
            res_inquire = client.post(f"/api/vehicles/{car.id}/inquire", json=inquire_payload)
            assert res_inquire.status_code == 201
            assert res_inquire.json()["dealership_id"] == test_dealer.id
            print("✓ Test passed: POST /api/vehicles/{id}/inquire successfully books appointment and routes lead")

        # 7. Test GET /api/admin/appointments returns appointments with vehicle_title
        res_apts = client.get("/api/admin/appointments", headers=headers)
        assert res_apts.status_code == 200
        admin_apts = res_apts.json()
        assert len(admin_apts) >= 2
        for apt in admin_apts:
            assert apt["customer_name"] in ["Abebe Kebede", "Sara Haile"]
            assert "Toyota Land Cruiser" in (apt.get("vehicle_title") or "")
        print("✓ Test passed: GET /api/admin/appointments includes vehicle_title for customer bookings")

    finally:
        # Cleanup
        if test_dealer and test_dealer.id:
            db.rollback()
            db.query(models.Appointment).filter(models.Appointment.dealership_id == test_dealer.id).delete()
            db.query(models.Vehicle).filter(models.Vehicle.dealership_id == test_dealer.id).delete()
            db.query(models.User).filter(models.User.dealership_id == test_dealer.id).delete()
            db.query(models.Dealership).filter(models.Dealership.id == test_dealer.id).delete()
            db.commit()
        db.close()


if __name__ == "__main__":
    test_telegram_multitenant_flow()
    print("\n🎉 ALL TELEGRAM MULTI-TENANT TESTS PASSED! 🎉")
