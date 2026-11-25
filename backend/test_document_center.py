"""
Document Center (/api/superadmin/documents): superadmin-only, numbering per type, draft/final,
search/date/status filters, archive/restore/permanent delete, vehicle links, rental-booking prefill,
the rental total auto-calculation, and the gate-pass "disappears" fixes.

Run (uses whatever DATABASE_URL points at; use a copy of the DB):
    SUPERADMIN_PHONE="251900061300,251918032065" python test_document_center.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import models
from main import app
from database import SessionLocal
from auth import create_access_token
from settings import superadmin_phones

client = TestClient(app)
OWNER = superadmin_phones()[0]
BASE = "/api/superadmin/documents"
TYPES = ("intake", "gatepass", "handover", "downpayment", "rental")


def _owner():
    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.phone_number == OWNER).first()
        assert u is not None, "migrate.py should have created the owner row"
        return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": OWNER, "role": "superadmin"})}
    finally:
        db.close()


def _staff_all_perms():
    phone = f"25197{uuid.uuid4().int % 10**7:07d}"
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, role="dealer_admin", dealership_id=1, is_active=True,
                        permissions_json=models.encode_permissions(models.STAFF_PERMISSIONS))
        db.add(u)
        db.commit()
        db.refresh(u)
        return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": phone, "role": u.role})}
    finally:
        db.close()


def _plate():
    return f"3-T{uuid.uuid4().int % 10**5:05d} AA"


def _intake(h, plate, status="final"):
    r = client.post(f"{BASE}/intake", headers=h, json={"status": status, "data": {
        "vehicle_name": "Toyota Vitz", "year_of_production": 2015, "plate_number": plate,
        "owner_name": "Almaz Test", "owner_phone": "0911000111", "final_cash_price": 1500000}})
    assert r.status_code == 201, r.text
    return r.json()


def test_staff_get_403_everywhere():
    staff = _staff_all_perms()
    assert client.get(f"{BASE}/summary", headers=staff).status_code == 403
    for t in TYPES:
        assert client.get(f"{BASE}/{t}", headers=staff).status_code == 403, t
        assert client.post(f"{BASE}/{t}", headers=staff, json={"status": "draft", "data": {}}).status_code == 403, t
    assert client.get(f"{BASE}/lookup?q=a", headers=staff).status_code == 403
    assert client.get(f"{BASE}/vehicle/1", headers=staff).status_code == 403
    assert client.get(f"{BASE}/summary").status_code == 401
    print("✓ staff (all permissions) get 403 on every Document Center endpoint")


def test_numbering_and_drafts():
    h = _owner()
    a = client.post(f"{BASE}/downpayment", headers=h, json={"status": "draft", "data": {"buyer_name": "Draft Buyer"}})
    assert a.status_code == 201, a.text
    b = client.post(f"{BASE}/downpayment", headers=h, json={"status": "draft", "data": {}})
    a, b = a.json(), b.json()
    assert a["number"].startswith("DP-") and b["number"].startswith("DP-")
    assert int(b["number"][3:]) == int(a["number"][3:]) + 1
    assert a["status"] == "draft" and a["data"]["seller_name"] == "ኤሲ ዋለ መኪና መሸጫ"
    assert a["date"], "every document gets a date"

    # Final needs the required fields
    r = client.put(f"{BASE}/downpayment/{a['id']}", headers=h, json={"status": "final", "data": {}})
    assert r.status_code == 422 and "amount" in r.json()["detail"]["missing"]
    r = client.put(f"{BASE}/downpayment/{a['id']}", headers=h, json={"status": "final", "data": {
        "plate_number": "2-A11111", "amount": "250000", "amount_words": "ሁለት መቶ ሃምሳ ሺህ ብር"}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "final" and d["amount"] == 250000 and d["data"]["buyer_name"] == "Draft Buyer"
    # Final never goes back to draft
    r = client.put(f"{BASE}/downpayment/{a['id']}", headers=h, json={"status": "draft", "data": {"buyer_city": "አ/አ"}})
    assert r.json()["status"] == "final" and r.json()["data"]["buyer_city"] == "አ/አ"

    ra = client.post(f"{BASE}/rental", headers=h, json={"status": "draft", "data": {}}).json()
    assert ra["number"].startswith("RA-")
    it = _intake(h, _plate())
    assert it["number"].startswith("IN-")
    ho = client.post(f"{BASE}/handover", headers=h, json={"data": {
        "owner_full_name": "Hailu", "owner_phone": "0911", "vehicle_type": "Vitz", "plate_number": _plate()}}).json()
    assert ho["number"].startswith("AC-rec-")
    # Reopen any time
    assert client.get(f"{BASE}/downpayment/{a['id']}", headers=h).json()["number"] == a["number"]
    print("✓ automatic numbers per type (DP/RA/IN/AC-rec), drafts, final validation, reopen")


def test_rental_total_and_booking_prefill():
    h = _owner()
    r = client.post(f"{BASE}/rental", headers=h, json={"status": "final", "data": {
        "renter_name": "Rent Er", "renter_mobile": "0922000000", "plate_number": _plate(),
        "pickup_date": "2026-11-01", "return_date": "2026-11-05", "daily_rate": "3500", "deposit": "4000",
        "checklist": {"battery": "ok", "jack": "no", "bogus": "ok", "spare_tyre": "maybe"}}})
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert d["days"] == "4" and d["total"] == "14000" and d["balance"] == "10000"
    assert d["checklist"] == {"battery": "ok", "jack": "no"}
    assert r.json()["amount"] == 14000

    # Prefill from an existing booking
    db = SessionLocal()
    try:
        v = models.Vehicle(make="Hyundai", model="Tucson", year=2021, fuel_type="Gasoline", body_type="SUV",
                           plate_status="2-B77777", rental_daily_rate=5000, listing_type="rent", dealership_id=1)
        db.add(v)
        db.commit()
        b = models.RentalBooking(vehicle_id=v.id, customer_name="Booking Person", customer_phone="0933000000",
                                 start_date=datetime(2026, 12, 1, 9, 0), end_date=datetime(2026, 12, 4, 9, 0),
                                 total_days=3, total_price=15000, dealership_id=1)
        db.add(b)
        db.commit()
        bid, vid = b.id, v.id
    finally:
        db.close()
    p = client.get(f"{BASE}/rental-booking/{bid}", headers=h)
    assert p.status_code == 200, p.text
    p = p.json()
    assert p["renter_name"] == "Booking Person" and p["days"] == "3" and p["daily_rate"] == "5000"
    assert p["plate_number"] == "2-B77777" and p["vehicle_id"] == vid and p["pickup_time"] == "09:00"
    saved = client.post(f"{BASE}/rental", headers=h, json={"status": "draft", "data": p}).json()
    assert saved["extra"]["rental_booking_id"] == bid and saved["data"]["total"] == "15000"
    # It shows up on the vehicle
    docs = client.get(f"{BASE}/vehicle/{vid}", headers=h).json()["documents"]
    assert any(x["type"] == "rental" and x["id"] == saved["id"] for x in docs)
    print("✓ rental: days from dates, rate x days = total, balance, checklist cleaned, booking prefill, vehicle link")


def test_search_date_status_filters():
    h = _owner()
    plate = _plate()
    dp = client.post(f"{BASE}/downpayment", headers=h, json={"data": {
        "buyer_name": "Zerihun Searchable", "buyer_phone": "0944123456", "plate_number": plate,
        "amount": 1000, "date": "2026-03-15"}}).json()
    for q in (plate, "Zerihun", "0944123456", dp["number"]):
        rows = client.get(f"{BASE}/downpayment", headers=h, params={"q": q}).json()
        assert any(r["id"] == dp["id"] for r in rows), q
    rows = client.get(f"{BASE}/downpayment", headers=h, params={"date_from": "2026-03-15", "date_to": "2026-03-15"}).json()
    assert any(r["id"] == dp["id"] for r in rows)
    rows = client.get(f"{BASE}/downpayment", headers=h, params={"date_from": "2026-03-16"}).json()
    assert not any(r["id"] == dp["id"] for r in rows)
    assert not any(r["id"] == dp["id"] for r in client.get(f"{BASE}/downpayment", headers=h, params={"status": "draft"}).json())
    assert any(r["id"] == dp["id"] for r in client.get(f"{BASE}/downpayment", headers=h, params={"status": "final"}).json())
    # Newest first
    rows = client.get(f"{BASE}/downpayment", headers=h, params={"status": "all"}).json()
    dates = [r["date"] for r in rows]
    assert dates == sorted(dates, reverse=True)
    print("✓ search by plate / name / phone / number, date range, status filter, newest first")


def test_archive_restore_permanent_delete():
    h = _owner()
    dp = client.post(f"{BASE}/downpayment", headers=h, json={"status": "draft", "data": {"buyer_name": "Archive Me"}}).json()
    assert client.delete(f"{BASE}/downpayment/{dp['id']}", headers=h).status_code == 409, "must archive first"
    a = client.post(f"{BASE}/downpayment/{dp['id']}/archive", headers=h).json()
    assert a["status"] == "archived" and a["archived_by"]
    assert not any(r["id"] == dp["id"] for r in client.get(f"{BASE}/downpayment", headers=h).json())
    assert any(r["id"] == dp["id"] for r in client.get(f"{BASE}/downpayment", headers=h, params={"status": "archived"}).json())
    assert client.put(f"{BASE}/downpayment/{dp['id']}", headers=h, json={"data": {}}).status_code == 409
    assert client.post(f"{BASE}/downpayment/{dp['id']}/restore", headers=h).json()["status"] == "draft"
    client.post(f"{BASE}/downpayment/{dp['id']}/archive", headers=h)
    assert client.delete(f"{BASE}/downpayment/{dp['id']}", headers=h).status_code == 204
    assert client.get(f"{BASE}/downpayment/{dp['id']}", headers=h).status_code == 404

    # An intake with passes can't be permanently deleted (the passes keep it as their record).
    it = _intake(h, _plate())
    client.post(f"{BASE}/gatepass", headers=h, json={"data": {"lot_intake_id": it["id"], "driver_name": "D",
                                                               "release_reason": "የዕለት መልስ"}})
    client.post(f"{BASE}/intake/{it['id']}/archive", headers=h)
    assert client.delete(f"{BASE}/intake/{it['id']}", headers=h).status_code == 409
    print("✓ archive (soft) / restore / permanent delete only from the archive; intake with passes protected")


def test_gate_pass_never_disappears():
    h = _owner()
    plate = _plate()
    it = _intake(h, plate)

    # Draft pass: car stays in the lot; finalizing releases it.
    gp = client.post(f"{BASE}/gatepass", headers=h, json={"status": "draft", "data": {
        "lot_intake_id": it["id"], "driver_name": "Driver One", "release_reason": "የዕለት መልስ"}})
    assert gp.status_code == 201, gp.text
    gp = gp.json()
    assert gp["plate_number"] == plate and gp["title"] == "Toyota Vitz" and gp["status"] == "draft"
    assert client.get(f"{BASE}/intake/{it['id']}", headers=h).json()["extra"]["is_in_lot"] is True
    gp = client.put(f"{BASE}/gatepass/{gp['id']}", headers=h, json={"status": "final", "data": {}}).json()
    assert gp["status"] == "final"
    assert client.get(f"{BASE}/intake/{it['id']}", headers=h).json()["extra"]["is_in_lot"] is False

    # Released car: the pass is still in the gate pass list (new and legacy endpoint).
    assert any(r["id"] == gp["id"] for r in client.get(f"{BASE}/gatepass", headers=h, params={"q": plate}).json())
    # Archiving the INTAKE must not hide the pass any more.
    client.post(f"{BASE}/intake/{it['id']}/archive", headers=h)
    assert any(r["id"] == gp["id"] for r in client.get(f"{BASE}/gatepass", headers=h).json())
    assert any(p["id"] == gp["id"] for p in client.get("/api/admin/gate-passes", headers=h).json())
    assert client.get(f"{BASE}/gatepass/{gp['id']}", headers=h).json()["data"]["vehicle_name"] == "Toyota Vitz"

    # Slip numbers: a hand-typed number that breaks the sequence no longer causes a failed save.
    it2 = _intake(h, _plate())
    r1 = client.post(f"/api/admin/lot-intakes/{it2['id']}/gate-pass", headers=h,
                     json={"driver_name": "X", "release_reason": "R", "authorized_by": "A", "slip_number": "HANDWRITTEN-7"})
    assert r1.status_code == 201, r1.text
    it3 = _intake(h, _plate())
    r2 = client.post(f"/api/admin/lot-intakes/{it3['id']}/gate-pass", headers=h,
                     json={"driver_name": "Y", "release_reason": "R", "authorized_by": "A"})
    assert r2.status_code == 201, r2.text
    assert r2.json()["slip_number"].startswith("AC-")

    # Latest pass of an intake is the newest one (relationship ordered by id).
    passes = client.get(f"/api/admin/lot-intakes/{it3['id']}", headers=h).json()["gate_passes"]
    assert [p["id"] for p in passes] == sorted(p["id"] for p in passes)
    print("✓ gate pass: draft keeps car in lot, final releases, released/archived-intake passes stay listed, safe slip numbers")


def test_summary_lookup_and_vehicle_links():
    h = _owner()
    s = client.get(f"{BASE}/summary", headers=h).json()
    assert set(s) == set(TYPES) and "in_lot" in s["intake"]
    db = SessionLocal()
    try:
        v = models.Vehicle(make="Suzuki", model="Dzire", year=2022, fuel_type="Gasoline", body_type="Sedan",
                           plate_status="2-C" + str(uuid.uuid4().int % 10**5), exterior_color="White", dealership_id=1)
        db.add(v)
        db.commit()
        vid, plate = v.id, v.plate_status
    finally:
        db.close()
    client.post(f"{BASE}/handover", headers=h, json={"data": {
        "owner_full_name": "Owner", "owner_phone": "09", "vehicle_type": "Suzuki Dzire", "plate_number": plate,
        "chassis_number": "CH-123", "engine_number": "EN-456", "horsepower": "90", "vehicle_id": vid}})
    found = client.get(f"{BASE}/lookup", headers=h, params={"q": plate}).json()
    hit = next(x for x in found if x["vehicle_id"] == vid and x["source"] == "vehicle")
    assert hit["chassis_number"] == "CH-123" and hit["engine_number"] == "EN-456" and hit["color"] == "White"
    dp = client.post(f"{BASE}/downpayment", headers=h, json={"data": {
        "buyer_name": "B", "plate_number": plate, "amount": 5, "vehicle_id": vid}}).json()
    docs = client.get(f"{BASE}/vehicle/{vid}", headers=h).json()["documents"]
    kinds = {d["type"] for d in docs}
    assert {"handover", "downpayment"} <= kinds and any(d["id"] == dp["id"] for d in docs)
    print("✓ summary counts, vehicle picker with chassis/engine from earlier documents, documents per vehicle")


if __name__ == "__main__":
    test_staff_get_403_everywhere()
    test_numbering_and_drafts()
    test_rental_total_and_booking_prefill()
    test_search_date_status_filters()
    test_archive_restore_permanent_delete()
    test_gate_pass_never_disappears()
    test_summary_lookup_and_vehicle_links()
    print("\nAll Document Center tests passed.")
