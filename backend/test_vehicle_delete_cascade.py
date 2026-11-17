import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from main import app, create_access_token

client = TestClient(app)

def test_vehicle_deletion_with_foreign_keys():
    print("🚀 Testing Vehicle Deletion With Foreign-Key Dependencies...")
    db = SessionLocal()
    try:
        # 1. Fetch primary dealership
        dealer = db.query(models.Dealership).first()
        assert dealer is not None, "Primary dealership not found"
        print(f"🏢 Dealership: {dealer.name} (ID: {dealer.id})")

        # 2. Get or create admin user for testing
        admin_user = db.query(models.User).filter(models.User.role == "superadmin").first()
        assert admin_user is not None, "Superadmin user not found"
        token = create_access_token(data={
            "sub": str(admin_user.id),
            "phone_number": admin_user.phone_number,
            "role": admin_user.role,
            "dealership_id": dealer.id
        })
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Create a test vehicle
        test_car = models.Vehicle(
            make="Toyota",
            model="Land Cruiser Prado Test",
            year=2024,
            price=15000000.0,
            fuel_type="Diesel",
            body_type="SUV",
            transmission="Automatic",
            status=models.VehicleStatus.AVAILABLE,
            dealership_id=dealer.id,
            has_bank_loan=True,
            cash_price=9000000.0,
            bank_loan_amount=6000000.0,
            bank_name="Awash Bank"
        )
        db.add(test_car)
        db.commit()
        db.refresh(test_car)
        car_id = test_car.id
        print(f"✓ Created test vehicle #{car_id}: {test_car.year} {test_car.make} {test_car.model}")

        # 4. Attach Vehicle Images (with a dummy file)
        test_img_path = backend_dir / "static" / "uploads" / f"test_del_{car_id}.webp"
        test_img_path.parent.mkdir(parents=True, exist_ok=True)
        test_img_path.write_bytes(b"dummy image data")

        v_img = models.VehicleImage(
            vehicle_id=car_id,
            image_url=f"/static/uploads/test_del_{car_id}.webp",
            is_cover=True
        )
        db.add(v_img)

        # 5. Attach an Appointment / Inquiry
        appt = models.Appointment(
            vehicle_id=car_id,
            customer_name="Abebe Kebede",
            phone_number="0911223344",
            preferred_channel="Phone",
            date="2026-11-10",
            time_slot="10:00 AM",
            dealership_id=dealer.id
        )
        db.add(appt)

        # 6. Attach a Rental Booking
        rental = models.RentalBooking(
            vehicle_id=car_id,
            customer_name="Tigist Haile",
            customer_phone="0922334455",
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=3),
            total_days=3,
            total_price=18000.0,
            delivery_type="showroom_pickup",
            status="confirmed",
            dealership_id=dealer.id
        )
        db.add(rental)
        db.commit()

        # Verify child records exist
        assert db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == car_id).count() == 1
        assert db.query(models.Appointment).filter(models.Appointment.vehicle_id == car_id).count() == 1
        assert db.query(models.RentalBooking).filter(models.RentalBooking.vehicle_id == car_id).count() == 1
        assert test_img_path.exists(), "Dummy image file should exist before delete"
        print("✓ Child records attached: 1 image, 1 appointment, 1 rental booking.")

        # 7. Execute DELETE /api/admin/vehicles/{car_id}
        print(f"🗑️ Invoking DELETE /api/admin/vehicles/{car_id}...")
        res = client.delete(f"/api/admin/vehicles/{car_id}", headers=headers)
        print("Response status:", res.status_code)
        print("Response json:", res.json())

        assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}: {res.text}"
        assert f"Vehicle #{car_id} deleted successfully" in res.json()["message"]

        # 8. Verify vehicle and all child records are cleanly gone
        db.expire_all()
        assert db.query(models.Vehicle).filter(models.Vehicle.id == car_id).first() is None, "Vehicle should be deleted from DB"
        assert db.query(models.RentalBooking).filter(models.RentalBooking.vehicle_id == car_id).count() == 0, "Rental bookings should be deleted"
        assert db.query(models.Appointment).filter(models.Appointment.vehicle_id == car_id).count() == 0, "Appointments should be deleted"
        assert db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == car_id).count() == 0, "Vehicle images should be deleted"
        assert not test_img_path.exists(), "Physical upload file should be unlinked"

        print("✓ ALL ASSERTIONS PASSED! Vehicle and foreign-key child records cleanly deleted with zero constraint errors.\n")

    finally:
        db.close()

if __name__ == "__main__":
    test_vehicle_deletion_with_foreign_keys()
