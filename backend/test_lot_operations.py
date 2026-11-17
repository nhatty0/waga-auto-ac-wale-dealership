import os
import sys
from datetime import datetime

# Add current dir to path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from auth import create_access_token

def test_lot_operations():
    client = TestClient(app)
    db = SessionLocal()

    # Get superadmin user or dealer user
    user = db.query(models.User).first()
    assert user is not None, "A user should exist in the database"

    token = create_access_token(data={"sub": str(user.id), "phone": user.phone_number, "role": user.role, "dealership_id": user.dealership_id})
    headers = {"Authorization": f"Bearer {token}"}

    print("1. Testing POST /api/admin/lot-intakes (Simple Intake)...")
    payload1 = {
        "vehicle_name": "Suzuki Dzire",
        "year_of_production": 2022,
        "plate_number": "2-B12345 AA",
        "primary_cash_price": 2400000.0,
        "primary_bank_price": 0.0,
        "final_cash_price": 2350000.0,
        "final_bank_price": 0.0,
        "owner_name": "Abebe Kebede",
        "owner_phone": "0911223344",
        "remark": "ቁልፍ እና ሊብሬ ተረክበናል",
        "received_by_name": "Kidus Girma",
        "publish_to_showroom": False
    }
    res1 = client.post("/api/admin/lot-intakes", json=payload1, headers=headers)
    assert res1.status_code == 201, f"Failed: {res1.text}"
    intake1 = res1.json()
    assert intake1["id"] is not None
    assert intake1["vehicle_name"] == "Suzuki Dzire"
    assert intake1["plate_number"] == "2-B12345 AA"
    assert intake1["is_in_lot"] is True
    assert intake1["published_vehicle_id"] is None
    print(f"✓ Intake created: ID #{intake1['id']} ({intake1['plate_number']})")

    print("2. Testing POST /api/admin/lot-intakes with publish_to_showroom=True...")
    payload2 = {
        "vehicle_name": "Toyota Rav4",
        "year_of_production": 2023,
        "plate_number": "3-A98765 AA",
        "primary_cash_price": 5500000.0,
        "primary_bank_price": 1000000.0,
        "final_cash_price": 5300000.0,
        "final_bank_price": 1000000.0,
        "owner_name": "Tigist Haile",
        "owner_phone": "0922334455",
        "remark": "ሙሉ ሰነድ ተሟልቷል",
        "received_by_name": "Kidus Girma",
        "publish_to_showroom": True
    }
    res2 = client.post("/api/admin/lot-intakes", json=payload2, headers=headers)
    assert res2.status_code == 201, f"Failed: {res2.text}"
    intake2 = res2.json()
    assert intake2["published_vehicle_id"] is not None
    # Verify the vehicle exists in database
    v = db.query(models.Vehicle).filter(models.Vehicle.id == intake2["published_vehicle_id"]).first()
    assert v is not None
    assert v.make == "Toyota"
    assert v.model == "Rav4"
    assert v.cash_price == 5500000.0
    print(f"✓ Intake with Showroom Vehicle created: ID #{intake2['id']}, Vehicle #{v.id}")

    print("3. Testing GET /api/admin/lot-intakes (filter in_lot=True)...")
    res_list = client.get("/api/admin/lot-intakes?in_lot=true", headers=headers)
    assert res_list.status_code == 200
    active_intakes = res_list.json()
    assert len(active_intakes) >= 2
    print(f"✓ Found {len(active_intakes)} active intakes in lot")

    print("4. Testing POST /api/admin/lot-intakes/{id}/gate-pass (Release Pass)...")
    pass_payload = {
        "driver_name": "Dawit Bekele",
        "release_reason": "ለገዢ ሙከራ",
        "authorized_by": "Manager Wale"
    }
    res_pass = client.post(f"/api/admin/lot-intakes/{intake1['id']}/gate-pass", json=pass_payload, headers=headers)
    assert res_pass.status_code == 201, f"Failed: {res_pass.text}"
    gate_pass = res_pass.json()
    assert gate_pass["slip_number"].startswith("AC-")
    assert gate_pass["driver_name"] == "Dawit Bekele"
    assert gate_pass["plate_number"] == "2-B12345 AA"
    assert gate_pass["release_reason"] == "ለገዢ ሙከራ"
    assert gate_pass["lot_intake_id"] == intake1["id"]
    print(f"✓ Gate pass created: Slip #{gate_pass['slip_number']} for plate {gate_pass['plate_number']}")

    print("5. Verifying intake1 is now released (is_in_lot=False)...")
    res_check = client.get(f"/api/admin/lot-intakes/{intake1['id']}", headers=headers)
    assert res_check.status_code == 200
    updated_intake1 = res_check.json()
    assert updated_intake1["is_in_lot"] is False
    assert len(updated_intake1["gate_passes"]) >= 1
    print("✓ Intake updated to is_in_lot = False")

    print("6. Testing GET /api/admin/gate-passes...")
    res_passes = client.get("/api/admin/gate-passes", headers=headers)
    assert res_passes.status_code == 200
    passes = res_passes.json()
    assert len(passes) >= 1
    print(f"✓ Gate passes listed successfully: {len(passes)} found")

    print("\n🎉 ALL LOT OPERATIONS ENDPOINTS TESTED & PASSED!")
    db.close()

if __name__ == "__main__":
    test_lot_operations()
