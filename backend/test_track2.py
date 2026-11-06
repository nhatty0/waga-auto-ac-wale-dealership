import os
from datetime import timedelta
from fastapi.testclient import TestClient
from main import app, create_access_token
from database import SessionLocal
import models
import schemas

def run_track2_tests():
    print("🚀 Starting Track 2: SuperAdmin Master Platform Portal Tests...\n")
    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. Setup regular dealer and superadmin users
        regular_dealer = db.query(models.Dealership).filter(models.Dealership.slug == "elite-motors").first()
        assert regular_dealer is not None

        regular_user = db.query(models.User).filter(models.User.role == "dealer_admin").first()
        if not regular_user:
            regular_user = models.User(
                phone_number="251911998877",
                role="dealer_admin",
                dealership_id=regular_dealer.id,
                is_active=True
            )
            db.add(regular_user)
            db.commit()
            db.refresh(regular_user)

        superadmin_phone = os.getenv("SUPERADMIN_PHONE", "251918032065").lstrip("+")
        superadmin_user = db.query(models.User).filter(models.User.phone_number == superadmin_phone).first()
        if not superadmin_user:
            superadmin_user = models.User(
                phone_number="251918032065",
                role="superadmin",
                dealership_id=regular_dealer.id,
                is_active=True
            )
            db.add(superadmin_user)
            db.commit()
            db.refresh(superadmin_user)

        regular_token = create_access_token(
            data={"sub": str(regular_user.id), "phone_number": regular_user.phone_number, "role": regular_user.role},
            expires_delta=timedelta(days=1)
        )
        superadmin_token = create_access_token(
            data={"sub": str(superadmin_user.id), "phone_number": superadmin_user.phone_number, "role": superadmin_user.role},
            expires_delta=timedelta(days=1)
        )

        reg_headers = {"Authorization": f"Bearer {regular_token}"}
        super_headers = {"Authorization": f"Bearer {superadmin_token}"}

        # -------------------------------------------------------------
        # Test 1: RBAC Enforcement - Regular admin blocked from SuperAdmin routes
        # -------------------------------------------------------------
        res_blocked = client.get("/api/superadmin/stats", headers=reg_headers)
        assert res_blocked.status_code == 403, f"Expected 403 Forbidden for non-superadmin, got {res_blocked.status_code}"
        print("✓ Test 1: Regular admin access to /api/superadmin/stats strictly blocked (HTTP 403 Forbidden)")

        # -------------------------------------------------------------
        # Test 2: GET /api/superadmin/stats returns platform metrics
        # -------------------------------------------------------------
        res_stats = client.get("/api/superadmin/stats", headers=super_headers)
        assert res_stats.status_code == 200, f"Expected 200, got {res_stats.status_code}: {res_stats.text}"
        stats = res_stats.json()
        assert "total_dealerships" in stats
        assert "total_active_listings" in stats
        assert "total_inventory_value" in stats
        assert "total_leads_generated" in stats
        print(f"✓ Test 2: GET /api/superadmin/stats returned platform metrics:")
        print(f"   - Total Dealerships: {stats['total_dealerships']}")
        print(f"   - Active Listings: {stats['total_active_listings']}")
        print(f"   - Platform Value: {stats['total_inventory_value']:,.2f} ETB")
        print(f"   - Leads Generated: {stats['total_leads_generated']}")

        # -------------------------------------------------------------
        # Test 3: GET /api/superadmin/dealerships lists all tenants
        # -------------------------------------------------------------
        res_dealers = client.get("/api/superadmin/dealerships", headers=super_headers)
        assert res_dealers.status_code == 200
        dealers = res_dealers.json()
        assert len(dealers) > 0
        first_d = dealers[0]
        assert "vehicle_count" in first_d
        assert "subscription_plan" in first_d
        assert "is_active" in first_d
        print(f"✓ Test 3: GET /api/superadmin/dealerships returned {len(dealers)} dealerships with metadata")

        # -------------------------------------------------------------
        # Test 4: PATCH /api/superadmin/dealerships/{id}/status toggles active & plan
        # -------------------------------------------------------------
        # Clean up any lingering test dealership from prior runs
        db.query(models.Dealership).filter(models.Dealership.slug == "suspension-test").delete()
        db.commit()

        # Create a temporary dealership to test suspension
        test_dealer = models.Dealership(
            name="Suspension Test Showroom",
            slug="suspension-test",
            phone_number="+251 900 112 233",
            is_active=True,
            subscription_plan="starter",
            max_vehicles=30
        )
        db.add(test_dealer)
        db.commit()
        db.refresh(test_dealer)

        # Deactivate
        patch_res = client.patch(
            f"/api/superadmin/dealerships/{test_dealer.id}/status",
            headers=super_headers,
            json={"is_active": False, "subscription_plan": "pro", "max_vehicles": 100}
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["is_active"] is False
        assert updated["subscription_plan"] == "pro"
        assert updated["max_vehicles"] == 100
        print(f"✓ Test 4: PATCH /api/superadmin/dealerships/{test_dealer.id}/status updated plan=pro, is_active=False")

        # -------------------------------------------------------------
        # Test 5: Suspended Showroom blocked from public access
        # -------------------------------------------------------------
        pub_res = client.get(f"/api/public/dealerships/{test_dealer.slug}")
        assert pub_res.status_code == 403, f"Expected 403 for suspended dealer, got {pub_res.status_code}"

        cars_res = client.get(f"/api/vehicles?dealership_slug={test_dealer.slug}")
        assert cars_res.status_code == 403, f"Expected 403 for suspended dealer's cars, got {cars_res.status_code}"
        print(f"✓ Test 5: Inactive dealership '{test_dealer.slug}' cleanly blocked from public viewing (HTTP 403)")

        # -------------------------------------------------------------
        # Test 6: Re-activation restores public access
        # -------------------------------------------------------------
        reactivate_res = client.patch(
            f"/api/superadmin/dealerships/{test_dealer.id}/status",
            headers=super_headers,
            json={"is_active": True}
        )
        assert reactivate_res.status_code == 200
        assert reactivate_res.json()["is_active"] is True

        pub_res_active = client.get(f"/api/public/dealerships/{test_dealer.slug}")
        assert pub_res_active.status_code == 200
        print(f"✓ Test 6: Re-activating dealership immediately restored public access (HTTP 200)")

        # Cleanup test dealer
        db.delete(test_dealer)
        db.commit()

        print("\n🎉 ALL TRACK 2 SUPERADMIN BACKEND TESTS PASSED! 🚀")

    finally:
        db.close()

if __name__ == "__main__":
    run_track2_tests()
