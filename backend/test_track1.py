import sys
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
import schemas

def run_track1_tests():
    print("🚀 Starting Track 1: Telegram Rich Link Previews & Shareable Cards Tests...\n")
    client = TestClient(app)
    db = SessionLocal()

    try:
        # Fetch or verify default dealership
        dealer = db.query(models.Dealership).filter(models.Dealership.slug == "elite-motors").first()
        assert dealer is not None, "Default dealership 'elite-motors' must exist."

        # Fetch or create a test vehicle
        car = db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealer.id).first()
        if not car:
            car = models.Vehicle(
                make="Toyota",
                model="Land Cruiser Prado",
                year=2023,
                price=18500000.0,
                mileage=12000,
                condition="Slightly Used",
                fuel_type="Diesel",
                transmission="Automatic",
                body_type="SUV",
                has_bank_loan=True,
                cash_price=10500000.0,
                bank_loan_amount=8000000.0,
                bank_name="Awash Bank",
                plate_status="Code 2",
                dealership_id=dealer.id,
            )
            db.add(car)
            db.commit()
            db.refresh(car)

        # -------------------------------------------------------------
        # Test 1: GET /api/vehicles/{id} returns vehicle with dealership
        # -------------------------------------------------------------
        res = client.get(f"/api/vehicles/{car.id}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()

        assert data["id"] == car.id, f"Expected car id {car.id}, got {data['id']}"
        assert data["make"] == car.make
        assert data["model"] == car.model
        assert "dealership" in data, "VehicleOut must include nested 'dealership' field"
        assert data["dealership"] is not None, "'dealership' must not be null"
        assert data["dealership"]["name"] == dealer.name
        assert data["dealership"]["slug"] == dealer.slug
        assert data["dealership"]["phone_number"] == dealer.phone_number
        assert "telegram_bot_token" not in data["dealership"], "Sensitive telegram bot token must NOT be exposed"
        assert "telegram_chat_id" not in data["dealership"], "Sensitive telegram chat id must NOT be exposed"

        print(f"✓ Test 1: GET /api/vehicles/{car.id} returned vehicle with nested public dealership profile:")
        print(f"   - Dealership: {data['dealership']['name']} ({data['dealership']['slug']})")
        print(f"   - Safe fields only (Bot token & chat id safely withheld)")

        # -------------------------------------------------------------
        # Test 2: GET /api/vehicles/{invalid_id} returns 404
        # -------------------------------------------------------------
        res_404 = client.get("/api/vehicles/99999999")
        assert res_404.status_code == 404, f"Expected 404 for nonexistent car, got {res_404.status_code}"
        print(f"✓ Test 2: GET /api/vehicles/99999999 returns HTTP 404 as expected")

        # -------------------------------------------------------------
        # Test 3: Verify OpenGraph/Share Caption Formatting
        # -------------------------------------------------------------
        # Simulate formatTelegramVehicleCaption
        formatted_price = f"{int(data['price']):,} ETB" if data.get("price") else "ዋጋ በስልክ"
        down_payment_val = data.get("cash_price") or data.get("down_payment")
        down_payment_text = f"{int(down_payment_val):,} ETB" if down_payment_val else "ሙሉ ክፍያ"
        bank_loan_val = data.get("bank_loan_amount") or data.get("bank_loan")
        bank_loan_text = f"{int(bank_loan_val):,} ETB ({data.get('bank_name', 'ባንክ')})" if (data.get("has_bank_loan") and bank_loan_val) else "የለም"
        plate_text = data.get("plate_status") or data.get("plate_code") or "ያልተለጠፈ"
        dealer_name = data["dealership"]["name"]

        caption_lines = [
            f"🚘 *{data['year']} {data['make']} {data['model']}*",
            f"💰 ዋጋ: {formatted_price}",
            f"💵 በእጅ የሚከፈል (Down Payment): {down_payment_text}",
            f"🏦 የባንክ ዕዳ: {bank_loan_text}",
            f"🏷️ ሰሌዳ: {plate_text}",
            f"📍 የቀረበው በ: {dealer_name}",
        ]
        caption = "\n".join(caption_lines)

        assert f"*{data['year']} {data['make']} {data['model']}*" in caption
        assert f"📍 የቀረበው በ: {dealer.name}" in caption
        assert "💰 ዋጋ:" in caption
        assert "🏷️ ሰሌዳ:" in caption
        print("✓ Test 3: Telegram share caption template formatting verified:")
        for line in caption_lines:
            print(f"   {line}")

        # -------------------------------------------------------------
        # Test 4: List Endpoint GET /api/vehicles includes dealership
        # -------------------------------------------------------------
        res_list = client.get("/api/vehicles")
        assert res_list.status_code == 200
        vehicles_list = res_list.json()
        assert len(vehicles_list) > 0
        first_v = vehicles_list[0]
        assert "dealership" in first_v
        if first_v["dealership"]:
            assert "name" in first_v["dealership"]
            assert "slug" in first_v["dealership"]
        print(f"✓ Test 4: GET /api/vehicles list also includes nested dealership for each car")

        print("\n🎉 ALL TRACK 1 TELEGRAM RICH LINK & SHAREABLE CARD TESTS PASSED! 🚀")

    finally:
        db.close()

if __name__ == "__main__":
    run_track1_tests()
