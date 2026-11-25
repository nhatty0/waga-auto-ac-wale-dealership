import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from database import SessionLocal
import models
from main import app
from auth import create_access_token
from settings import settings, superadmin_phones

client = TestClient(app)

def test_dealer_switcher_security_lockdown():
    db = SessionLocal()
    try:
        # Create or ensure 2 dealerships
        d1 = db.query(models.Dealership).filter(models.Dealership.id == 1).first()
        if not d1:
            d1 = models.Dealership(name="Primary Dealer", slug="primary-dealer", is_active=True)
            db.add(d1)
            db.commit()
            db.refresh(d1)

        d2 = db.query(models.Dealership).filter(models.Dealership.slug == "test-secondary-dealer").first()
        if not d2:
            d2 = models.Dealership(name="Secondary Dealer", slug="test-secondary-dealer", is_active=True)
            db.add(d2)
            db.commit()
            db.refresh(d2)

        # Create or ensure regular dealer user (assigned to d1)
        dealer_user = db.query(models.User).filter(models.User.phone_number == "251911223344").first()
        if not dealer_user:
            dealer_user = models.User(
                phone_number="251911223344",
                role="dealer_admin",
                dealership_id=d1.id,
                is_active=True
            )
            db.add(dealer_user)
            db.commit()
            db.refresh(dealer_user)
        else:
            dealer_user.role = "dealer_admin"
            dealer_user.dealership_id = d1.id
            db.commit()

        # Create or ensure SuperAdmin user
        super_phone = superadmin_phones()[0]
        super_user = db.query(models.User).filter(models.User.phone_number == super_phone).first()
        if not super_user:
            super_user = models.User(
                phone_number=super_phone,
                role="superadmin",
                dealership_id=d1.id,
                is_active=True
            )
            db.add(super_user)
            db.commit()
            db.refresh(super_user)
        else:
            super_user.role = "superadmin"
            db.commit()

        dealer_token = create_access_token({"sub": str(dealer_user.id), "phone_number": dealer_user.phone_number, "role": "dealer_admin"})
        super_token = create_access_token({"sub": str(super_user.id), "phone_number": super_user.phone_number, "role": "superadmin"})

        print("\n🔒 Testing Security Test 1: Non-superadmin calling POST /api/admin/switch-dealership...")
        res = client.post(
            "/api/admin/switch-dealership",
            json={"dealership_id": d2.id},
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        assert res.json()["detail"] == "Unauthorized: Tenant switching restricted to SuperAdmin", f"Unexpected detail: {res.json()}"
        print("  ✓ Non-superadmin strictly rejected with 403 and correct error message!")

        print("\n🔒 Testing Security Test 2: Non-superadmin calling with query param ?dealership_id=...")
        res = client.get(
            f"/api/admin/vehicles?dealership_id={d2.id}",
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        assert res.json()["detail"] == "Unauthorized: Tenant switching restricted to SuperAdmin"
        print("  ✓ Non-superadmin parameter tampering strictly rejected with 403!")

        print("\n🔒 Testing Security Test 3: SuperAdmin calling POST /api/admin/switch-dealership...")
        res = client.post(
            "/api/admin/switch-dealership",
            json={"dealership_id": d2.id},
            headers={"Authorization": f"Bearer {super_token}"}
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["dealership_id"] == d2.id
        assert "access_token" in data
        print("  ✓ SuperAdmin successfully authorized and received scoped impersonation token!")

        print("\n🔒 Testing Security Test 4: Cross-tenant vehicle mutation rejection...")
        # Create a car under d2
        car_d2 = models.Vehicle(
            make="Toyota", model="Corolla", year=2022, price=3000000,
            body_type="Sedan", fuel_type="Petrol", dealership_id=d2.id
        )
        db.add(car_d2)
        db.commit()
        db.refresh(car_d2)

        # Dealer 1 attempts to update or delete car_d2
        res_put = client.put(
            f"/api/admin/vehicles/{car_d2.id}",
            json={"make": "Hacked", "model": "Car", "year": 2022, "price": 100, "body_type": "Sedan", "fuel_type": "Petrol", "image_urls": ["https://example.com/car.jpg"]},
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res_put.status_code == 403, f"Expected 403 for cross-dealer update, got {res_put.status_code}"

        res_del = client.delete(
            f"/api/admin/vehicles/{car_d2.id}",
            headers={"Authorization": f"Bearer {dealer_token}"}
        )
        assert res_del.status_code == 403, f"Expected 403 for cross-dealer delete, got {res_del.status_code}"
        print("  ✓ Cross-tenant vehicle mutation strictly blocked with HTTP 403!")

        # Clean up test vehicle
        db.delete(car_d2)
        db.commit()

        print("\n🎉 ALL DEALER SWITCHER & TENANT ISOLATION SECURITY TESTS PASSED! 🚀\n")

    finally:
        db.close()

if __name__ == "__main__":
    test_dealer_switcher_security_lockdown()
