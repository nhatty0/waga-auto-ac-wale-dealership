import os
import sys
from pathlib import Path

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from database import SessionLocal, engine
import models
import schemas
from main import app, create_access_token
from migrate import run_migrations

client = TestClient(app)

def run_tests():
    print("🚀 Starting Multi-Tenant Architecture & Data Isolation Tests...\n")
    db = SessionLocal()

    try:
        # 1. Run migrations
        run_migrations()

        # 2. Verify default tenant
        default_dealer = db.query(models.Dealership).filter(models.Dealership.slug == "elite-motors").first()
        assert default_dealer is not None, "Default dealership 'elite-motors' not found!"
        assert default_dealer.name == "Elite Motors Addis", f"Expected 'Elite Motors Addis', got {default_dealer.name}"
        print(f"✓ Test 1: Default dealership verified (ID: {default_dealer.id}, Name: {default_dealer.name})")

        # 3. Verify all pre-existing records have dealership_id
        unassigned_v = db.query(models.Vehicle).filter(models.Vehicle.dealership_id == None).count()
        unassigned_a = db.query(models.Appointment).filter(models.Appointment.dealership_id == None).count()
        unassigned_u = db.query(models.User).filter(models.User.dealership_id == None).count()
        assert unassigned_v == 0, f"Found {unassigned_v} unassigned vehicles!"
        assert unassigned_a == 0, f"Found {unassigned_a} unassigned appointments!"
        assert unassigned_u == 0, f"Found {unassigned_u} unassigned users!"
        print("✓ Test 2: Pre-existing data integrity verified (0 unassigned records)")

        # 4. Create secondary test dealership & test users
        dealer2 = db.query(models.Dealership).filter(models.Dealership.slug == "test-bole-luxury").first()
        if not dealer2:
            dealer2 = models.Dealership(
                name="Bole Luxury Cars Test",
                slug="test-bole-luxury",
                phone_number="+251 911 223 344",
                logo_url="http://test.com/logo.png"
            )
            db.add(dealer2)
            db.commit()
            db.refresh(dealer2)

        # User 1 belongs to Default Dealership (ID: default_dealer.id)
        user1 = db.query(models.User).filter(models.User.phone_number == "251999000001").first()
        if not user1:
            user1 = models.User(
                phone_number="251999000001",
                full_name="Admin Dealer 1",
                role="dealer_admin",
                dealership_id=default_dealer.id,
                is_active=True
            )
            db.add(user1)
            db.commit()
            db.refresh(user1)
        else:
            user1.dealership_id = default_dealer.id
            db.commit()

        # User 2 belongs to Bole Luxury (ID: dealer2.id)
        user2 = db.query(models.User).filter(models.User.phone_number == "251999000002").first()
        if not user2:
            user2 = models.User(
                phone_number="251999000002",
                full_name="Admin Dealer 2",
                role="dealer_admin",
                dealership_id=dealer2.id,
                is_active=True
            )
            db.add(user2)
            db.commit()
            db.refresh(user2)
        else:
            user2.dealership_id = dealer2.id
            db.commit()

        token1 = create_access_token({"sub": str(user1.id), "phone_number": user1.phone_number, "role": user1.role})
        token2 = create_access_token({"sub": str(user2.id), "phone_number": user2.phone_number, "role": user2.role})

        headers1 = {"Authorization": f"Bearer {token1}"}
        headers2 = {"Authorization": f"Bearer {token2}"}

        # 5. Test GET /api/admin/me returns dealership details
        me1 = client.get("/api/admin/me", headers=headers1)
        assert me1.status_code == 200, f"Failed /api/admin/me for user 1: {me1.text}"
        data1 = me1.json()
        assert data1["dealership"]["id"] == default_dealer.id
        assert data1["dealership"]["slug"] == "elite-motors"
        assert data1["dealership"]["name"] == "Elite Motors Addis"

        me2 = client.get("/api/admin/me", headers=headers2)
        assert me2.status_code == 200, f"Failed /api/admin/me for user 2: {me2.text}"
        data2 = me2.json()
        assert data2["dealership"]["id"] == dealer2.id
        assert data2["dealership"]["slug"] == "test-bole-luxury"
        assert data2["dealership"]["name"] == "Bole Luxury Cars Test"
        print("✓ Test 3: GET /api/admin/me returns scoped dealership details correctly")

        # 6. Test Vehicle creation under User 1 and User 2
        car1_payload = {
            "make": "Toyota",
            "model": "Land Cruiser Test Tenant 1",
            "year": 2024,
            "price": 18000000.0,
            "mileage": 500,
            "condition": "Brand New",
            "fuel_type": "Diesel",
            "transmission": "Automatic",
            "body_type": "SUV",
            "customs_cleared": True,
            "image_urls": ["http://127.0.0.1:8000/uploads/test1.jpg"]
        }
        res_v1 = client.post("/api/admin/vehicles", json=car1_payload, headers=headers1)
        assert res_v1.status_code == 201, f"Failed creating car 1: {res_v1.text}"
        car1_id = res_v1.json()["id"]
        assert res_v1.json()["dealership_id"] == default_dealer.id, "Car 1 dealership_id mismatch!"

        car2_payload = {
            "make": "Mercedes-Benz",
            "model": "G63 AMG Test Tenant 2",
            "year": 2023,
            "price": 25000000.0,
            "mileage": 1200,
            "condition": "Foreign Used",
            "fuel_type": "Gasoline",
            "transmission": "Automatic",
            "body_type": "SUV",
            "customs_cleared": True,
            "image_urls": ["http://127.0.0.1:8000/uploads/test2.jpg"]
        }
        res_v2 = client.post("/api/admin/vehicles", json=car2_payload, headers=headers2)
        assert res_v2.status_code == 201, f"Failed creating car 2: {res_v2.text}"
        car2_id = res_v2.json()["id"]
        assert res_v2.json()["dealership_id"] == dealer2.id, "Car 2 dealership_id mismatch!"
        print(f"✓ Test 4: Auto-assignment of dealership_id in POST /api/admin/vehicles verified (Car1: {car1_id} -> D{default_dealer.id}, Car2: {car2_id} -> D{dealer2.id})")

        # 7. Test Scoped GET /api/admin/vehicles
        v_list1 = client.get("/api/admin/vehicles", headers=headers1).json()
        v1_ids = [v["id"] for v in v_list1]
        assert car1_id in v1_ids, "Car 1 not found in Dealer 1 list"
        assert car2_id not in v1_ids, "Car 2 leaked into Dealer 1 list!"

        v_list2 = client.get("/api/admin/vehicles", headers=headers2).json()
        v2_ids = [v["id"] for v in v_list2]
        assert car2_id in v2_ids, "Car 2 not found in Dealer 2 list"
        assert car1_id not in v2_ids, "Car 1 leaked into Dealer 2 list!"
        print("✓ Test 5: Scoped isolation in GET /api/admin/vehicles verified (Zero cross-tenant vehicle leakage)")

        # 8. Test 403 Forbidden enforcement on PUT, PATCH, DELETE cross-tenant
        # User 1 attempts to update User 2's car
        update_attempt = client.put(f"/api/admin/vehicles/{car2_id}", json=car2_payload, headers=headers1)
        assert update_attempt.status_code == 403, f"Expected 403 on PUT cross-tenant, got {update_attempt.status_code}"

        patch_attempt = client.patch(f"/api/admin/vehicles/{car2_id}/status?new_status=Sold", headers=headers1)
        assert patch_attempt.status_code == 403, f"Expected 403 on PATCH cross-tenant, got {patch_attempt.status_code}"

        del_attempt = client.delete(f"/api/admin/vehicles/{car2_id}", headers=headers1)
        assert del_attempt.status_code == 403, f"Expected 403 on DELETE cross-tenant, got {del_attempt.status_code}"

        # User 2 attempts to update User 1's car
        update_attempt2 = client.put(f"/api/admin/vehicles/{car1_id}", json=car1_payload, headers=headers2)
        assert update_attempt2.status_code == 403, f"Expected 403 on PUT cross-tenant, got {update_attempt2.status_code}"
        print("✓ Test 6: Cross-tenant access control strictly enforced (HTTP 403 Forbidden on unauthorized PUT, PATCH, DELETE)")

        # 9. Test Scoped Appointments
        apt1 = models.Appointment(
            vehicle_id=car1_id,
            dealership_id=default_dealer.id,
            customer_name="Customer Tenant 1",
            phone_number="0911000001",
            preferred_channel="Telegram",
            appointment_type=models.AppointmentType.TEST_DRIVE,
            date="2026-11-01",
            time_slot="10:00 AM",
            status="Pending"
        )
        apt2 = models.Appointment(
            vehicle_id=car2_id,
            dealership_id=dealer2.id,
            customer_name="Customer Tenant 2",
            phone_number="0911000002",
            preferred_channel="Telegram",
            appointment_type=models.AppointmentType.TEST_DRIVE,
            date="2026-11-02",
            time_slot="02:00 PM",
            status="Pending"
        )
        db.add(apt1)
        db.add(apt2)
        db.commit()
        db.refresh(apt1)
        db.refresh(apt2)

        apts_res1 = client.get("/api/admin/appointments", headers=headers1).json()
        apt_ids1 = [a["id"] for a in apts_res1]
        assert apt1.id in apt_ids1, "Appointment 1 not found in Dealer 1 list"
        assert apt2.id not in apt_ids1, "Appointment 2 leaked into Dealer 1 list!"

        apts_res2 = client.get("/api/admin/appointments", headers=headers2).json()
        apt_ids2 = [a["id"] for a in apts_res2]
        assert apt2.id in apt_ids2, "Appointment 2 not found in Dealer 2 list"
        assert apt1.id not in apt_ids2, "Appointment 1 leaked into Dealer 2 list!"
        print("✓ Test 7: Scoped appointments isolation verified (Zero cross-tenant appointment leakage)")

        # -------------------------------------------------------------
        # PHASE 2 STEP 2 TESTS: Public Tenant Resolution & Dynamic Scoping
        # -------------------------------------------------------------

        # Test 8: Public dealership endpoint
        pub_d1 = client.get(f"/api/public/dealerships/{default_dealer.slug}")
        assert pub_d1.status_code == 200, f"Failed getting public dealership 1: {pub_d1.text}"
        pub_data1 = pub_d1.json()
        assert pub_data1["name"] == default_dealer.name
        assert pub_data1["slug"] == default_dealer.slug
        assert "telegram_bot_token" not in pub_data1, "Security issue: telegram_bot_token exposed in public endpoint!"
        assert "telegram_chat_id" not in pub_data1, "Security issue: telegram_chat_id exposed in public endpoint!"

        pub_d2 = client.get(f"/api/public/dealerships/{dealer2.slug}")
        assert pub_d2.status_code == 200, f"Failed getting public dealership 2: {pub_d2.text}"
        assert pub_d2.json()["name"] == dealer2.name

        pub_d_notfound = client.get("/api/public/dealerships/completely-fake-slug")
        assert pub_d_notfound.status_code == 404, f"Expected 404, got {pub_d_notfound.status_code}"
        print("✓ Test 8: GET /api/public/dealerships/{slug} verified (correct data, sensitive tokens hidden, 404 on missing)")

        # Test 9: Public vehicle queries & tenant scoping
        # Default query (no slug) defaults to default_dealer
        pub_v_default = client.get("/api/vehicles").json()
        pub_v_default_ids = [v["id"] for v in pub_v_default]
        assert car1_id in pub_v_default_ids, "Car 1 should appear in default public showroom"
        assert car2_id not in pub_v_default_ids, "Car 2 should NOT bleed into default public showroom!"

        # Explicit slug for dealer 2
        pub_v_d2 = client.get(f"/api/vehicles?dealership_slug={dealer2.slug}").json()
        pub_v_d2_ids = [v["id"] for v in pub_v_d2]
        assert car2_id in pub_v_d2_ids, "Car 2 should appear in Dealer 2 public showroom"
        assert car1_id not in pub_v_d2_ids, "Car 1 should NOT bleed into Dealer 2 public showroom!"

        # Non-existent slug returns empty list
        pub_v_empty = client.get("/api/vehicles?dealership_slug=nonexistent-tenant-slug").json()
        assert len(pub_v_empty) == 0, f"Expected 0 vehicles for invalid slug, got {len(pub_v_empty)}"
        print("✓ Test 9: Public GET /api/vehicles scoping verified (defaults to default dealer, scopes per slug, 0 bleed)")

        # Test 10: POST /api/appointments with explicit dealership_id
        apt_payload = {
            "dealership_id": dealer2.id,
            "customer_name": "Walk-in Lead",
            "phone_number": "0912345678",
            "preferred_channel": "Phone",
            "appointment_type": "In-Person Test Drive",
            "date": "2026-11-03",
            "time_slot": "11:00 AM",
            "notes": "General inquiry with explicit dealership_id"
        }
        res_pub_apt = client.post("/api/appointments", json=apt_payload)
        assert res_pub_apt.status_code == 201, f"Failed creating appointment: {res_pub_apt.text}"
        pub_apt_id = res_pub_apt.json()["id"]
        assert res_pub_apt.json()["dealership_id"] == dealer2.id, "Appointment did not inherit explicit dealership_id!"
        print(f"✓ Test 10: POST /api/appointments with explicit dealership_id verified (Assigned D{dealer2.id})")

        # Cleanup test records
        db.query(models.Appointment).filter(models.Appointment.dealership_id == dealer2.id).delete(synchronize_session=False)
        db.query(models.Appointment).filter(models.Appointment.id.in_([apt1.id, apt2.id, pub_apt_id])).delete(synchronize_session=False)
        v_ids_d2 = [v.id for v in db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealer2.id).all()]
        db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id.in_(v_ids_d2 + [car1_id, car2_id])).delete(synchronize_session=False)
        db.query(models.Vehicle).filter(models.Vehicle.dealership_id == dealer2.id).delete(synchronize_session=False)
        db.query(models.Vehicle).filter(models.Vehicle.id.in_([car1_id, car2_id])).delete(synchronize_session=False)
        db.query(models.User).filter(models.User.id.in_([user1.id, user2.id])).delete(synchronize_session=False)
        db.query(models.Dealership).filter(models.Dealership.id == dealer2.id).delete(synchronize_session=False)
        db.commit()
        print("✓ Cleanup completed: All test records purged.")

        print("\n🎉 ALL MULTI-TENANT ARCHITECTURE TESTS PASSED SUCCESSFULLY! 🚀")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
