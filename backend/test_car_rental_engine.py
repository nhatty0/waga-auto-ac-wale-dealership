import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from datetime import datetime, timedelta
from fastapi.testclient import TestClient
import main
import auth
import models
from database import SessionLocal

def test_single_tenant_and_car_rental_engine():
    client = TestClient(main.app)

    # 1. Test public dealerships endpoint
    dealerships_res = client.get("/api/public/dealerships")
    assert dealerships_res.status_code == 200, f"Dealerships failed: {dealerships_res.text}"
    dealers = dealerships_res.json()
    assert len(dealers) >= 1
    assert dealers[0]["name"] == "AC Wale Cars", f"Expected AC Wale Cars, got {dealers[0]}"
    print("✓ [TEST 1] Single-tenant dealership verified: AC Wale Cars")

    # 2. Test public vehicles with listing_type=rent
    rent_res = client.get("/api/vehicles?listing_type=rent")
    assert rent_res.status_code == 200
    rent_cars = rent_res.json()
    assert len(rent_cars) >= 1
    rental_car = rent_cars[0]
    assert rental_car.get("rental_daily_rate") is not None
    print(f"✓ [TEST 2] Rental catalog verified: Found {len(rent_cars)} rental vehicle(s)")

    # 3. Test POST /api/public/rentals
    start_date = datetime.utcnow() + timedelta(days=1)
    end_date = start_date + timedelta(days=4)
    booking_payload = {
        "vehicle_id": rental_car["id"],
        "customer_name": "Abebe Tadesse",
        "customer_phone": "0911223344",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "delivery_type": "doorstep_delivery",
        "delivery_address": "Kazanchis, near UNECA",
    }
    booking_res = client.post("/api/public/rentals", json=booking_payload)
    assert booking_res.status_code == 201, f"Booking failed: {booking_res.text}"
    booking = booking_res.json()
    assert booking["total_days"] == 4, f"Expected 4 days, got {booking['total_days']}"
    expected_price = 4 * rental_car["rental_daily_rate"]
    assert booking["total_price"] == expected_price, f"Price mismatch: {booking['total_price']} != {expected_price}"
    assert booking["status"] == "pending"
    booking_id = booking["id"]
    print(f"✓ [TEST 3] Public rental booking confirmed: ID #{booking_id}, {booking['total_days']} days, {booking['total_price']} ETB")

    # 4. Generate admin token
    db = SessionLocal()
    admin_user = db.query(models.User).filter_by(id=1).first()
    token = auth.create_access_token({
        "sub": str(admin_user.id),
        "role": admin_user.role,
        "dealership_id": admin_user.dealership_id,
    })
    db.close()
    headers = {"Authorization": f"Bearer {token}"}

    # 5. Test GET /api/admin/rentals
    admin_rentals_res = client.get("/api/admin/rentals", headers=headers)
    assert admin_rentals_res.status_code == 200
    all_rentals = admin_rentals_res.json()
    assert any(r["id"] == booking_id for r in all_rentals)
    print(f"✓ [TEST 4] Admin rentals retrieved: {len(all_rentals)} booking(s)")

    # 6. Test GET /api/admin/drivers & POST /api/admin/drivers
    drivers_res = client.get("/api/admin/drivers", headers=headers)
    assert drivers_res.status_code == 200
    drivers_list = drivers_res.json()
    assert len(drivers_list) >= 1
    driver_id = drivers_list[0]["id"]
    print(f"✓ [TEST 5] Driver roster verified: {len(drivers_list)} driver(s), first ID #{driver_id}")

    # 7. Test PUT /api/admin/rentals/{id}/assign-driver
    assign_res = client.put(f"/api/admin/rentals/{booking_id}/assign-driver", json={"driver_id": driver_id}, headers=headers)
    assert assign_res.status_code == 200, f"Assign failed: {assign_res.text}"
    assigned_booking = assign_res.json()
    assert assigned_booking["assigned_driver_id"] == driver_id
    assert assigned_booking["status"] == "driver_assigned"
    assert assigned_booking["assigned_driver"]["id"] == driver_id
    print(f"✓ [TEST 6] Driver assigned and status updated: Booking #{booking_id} -> Driver #{driver_id} ({assigned_booking['assigned_driver']['full_name']})")

    # 8. Test PUT /api/admin/rentals/{id}/status
    status_res = client.put(f"/api/admin/rentals/{booking_id}/status", json={"status": "completed"}, headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "completed"
    print("✓ [TEST 7] Rental status lifecycle transition verified: completed")

    print("\n🎉 ALL CAR RENTAL & DRIVER DISPATCH ENGINE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_single_tenant_and_car_rental_engine()
