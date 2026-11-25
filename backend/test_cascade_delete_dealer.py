import os
import sys
from pathlib import Path

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from settings import settings, superadmin_phones
from main import app, create_access_token
from storage import UPLOAD_DIR

client = TestClient(app)


def test_cascade_delete_dealership():
    print("🚀 Starting Cascade Delete Dealer Verification Tests...\n")
    db = SessionLocal()

    try:
        # 1. Setup SuperAdmin user
        superadmin_phone = superadmin_phones()[0]
        superadmin = db.query(models.User).filter(models.User.phone_number == superadmin_phone).first()
        if not superadmin:
            superadmin = models.User(
                phone_number=superadmin_phone,
                role="superadmin",
                dealership_id=1,
                is_active=True
            )
            db.add(superadmin)
            db.commit()
            db.refresh(superadmin)
        else:
            superadmin.role = "superadmin"
            db.commit()

        superadmin_token = create_access_token({"sub": str(superadmin.id), "role": "superadmin"})

        # 2. Setup Dealer to be deleted
        target_phone = "251977665544"
        # Pre-clean any test residue
        pre_user = db.query(models.User).filter(models.User.phone_number == target_phone).first()
        if pre_user:
            db.delete(pre_user)
            db.commit()

        for del_slug in ["temp-demo-showroom-del", "other-dealer-protected"]:
            d_res = db.query(models.Dealership).filter(models.Dealership.slug == del_slug).first()
            if d_res:
                v_ids = [v.id for v in db.query(models.Vehicle).filter(models.Vehicle.dealership_id == d_res.id).all()]
                if v_ids:
                    db.query(models.Appointment).filter(models.Appointment.vehicle_id.in_(v_ids)).delete(synchronize_session=False)
                    db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id.in_(v_ids)).delete(synchronize_session=False)
                db.query(models.Appointment).filter(models.Appointment.dealership_id == d_res.id).delete(synchronize_session=False)
                db.query(models.Vehicle).filter(models.Vehicle.dealership_id == d_res.id).delete(synchronize_session=False)
                db.delete(d_res)
                db.commit()

        target_dealer = models.Dealership(
            name="Temporary Demo Showroom",
            slug="temp-demo-showroom-del",
            phone_number="+251977665544",
            is_active=True
        )
        db.add(target_dealer)
        db.commit()
        db.refresh(target_dealer)

        # Create dealer admin user
        dealer_user = models.User(
            phone_number=target_phone,
            role="dealer_admin",
            dealership_id=target_dealer.id,
            is_active=True
        )
        db.add(dealer_user)

        # Create vehicles for this dealership
        car1 = models.Vehicle(
            make="Toyota",
            model="Corolla",
            year=2021,
            price=3200000.0,
            fuel_type="Petrol",
            transmission="Automatic",
            body_type="Sedan",
            dealership_id=target_dealer.id
        )
        db.add(car1)
        db.commit()
        db.refresh(car1)

        # Create dummy physical file
        dummy_filename = f"test_del_{car1.id}.webp"
        dummy_path = UPLOAD_DIR / dummy_filename
        with open(dummy_path, "wb") as f:
            f.write(b"RIFFdummydataWEBP")

        car1_img = models.VehicleImage(
            vehicle_id=car1.id,
            image_url=f"/static/uploads/{dummy_filename}",
            is_cover=True
        )
        db.add(car1_img)

        # Create appointment for this vehicle
        appt1 = models.Appointment(
            dealership_id=target_dealer.id,
            vehicle_id=car1.id,
            customer_name="Dawit Tesfaye",
            phone_number="0911002233",
            date="2026-11-10",
            time_slot="02:00 PM",
            appointment_type=models.AppointmentType.TEST_DRIVE,
            status="Pending"
        )
        db.add(appt1)
        db.commit()

        dealer_user_token = create_access_token({"sub": str(dealer_user.id), "role": "dealer_admin"})

        print("--- [TEST 1: Non-existent dealership returns 404] ---")
        res_del_root = client.delete(
            "/api/admin/dealerships/9999999",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert res_del_root.status_code == 404, f"Expected 404, got {res_del_root.status_code}"
        print("✓ Non-existent dealership returns 404 as expected.")

        print("\n--- [TEST 2: Unauthorized dealer cannot delete another dealership] ---")
        # Another random dealership
        other_dealer = models.Dealership(
            name="Other Dealer",
            slug="other-dealer-protected",
            phone_number="+251988776655",
            is_active=True
        )
        db.add(other_dealer)
        db.commit()
        db.refresh(other_dealer)

        res_unauth = client.delete(
            f"/api/admin/dealerships/{other_dealer.id}",
            headers={"Authorization": f"Bearer {dealer_user_token}"}
        )
        assert res_unauth.status_code == 403, f"Expected 403, got {res_unauth.status_code}"
        print("✓ Non-superadmin forbidden from deleting other dealerships (HTTP 403).")

        car1_id = car1.id
        dealer_user_id = dealer_user.id
        target_dealer_id = target_dealer.id

        print("\n--- [TEST 3: SuperAdmin Cascade Deletes Target Dealership] ---")
        assert dummy_path.exists(), "Dummy file should exist before cascade delete"

        res_del = client.delete(
            f"/api/admin/dealerships/{target_dealer_id}",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert res_del.status_code == 200, f"Expected 200, got {res_del.status_code}: {res_del.text}"
        assert res_del.json()["status"] == "success"

        # Verify DB cascade
        assert db.query(models.Dealership).filter(models.Dealership.id == target_dealer_id).first() is None
        assert db.query(models.Vehicle).filter(models.Vehicle.dealership_id == target_dealer_id).first() is None
        assert db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == car1_id).first() is None
        assert db.query(models.Appointment).filter(models.Appointment.dealership_id == target_dealer_id).first() is None
        assert db.query(models.User).filter(models.User.id == dealer_user_id).first() is None

        # Verify physical disk cleanup
        assert not dummy_path.exists(), "Physical image file was NOT cleaned up from static/uploads/!"

        print("✓ All appointments, vehicle images, vehicles, users, and dealership erased from DB.")
        print("✓ Physical vehicle image files successfully deleted from server disk!")

        print("\n--- [TEST 4: Deleting non-existent dealership returns 404] ---")
        res_404 = client.delete(
            "/api/admin/dealerships/99999999",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert res_404.status_code == 404
        print("✓ Non-existent dealership returns HTTP 404.")

        # Cleanup other_dealer
        db.delete(other_dealer)
        db.commit()

        print("\n🎉 ALL CASCADE DELETE DEALER TESTS PASSED PERFECTLY!\n")

    finally:
        db.close()


if __name__ == "__main__":
    test_cascade_delete_dealership()
