"""
Staff (HR) documents in the Document Center: Employment Contract (EC-0001) and Property Handover
(PH-0001). Superadmin-only (403 for staff), own numbering series, draft/final rules, Team-member
link (name/phone fallback), items still held, per-member listing, and unlink on staff removal.

Run on a COPY of the database:
    DATABASE_URL=sqlite:///C:/path/to/copy.db python test_staff_documents.py
"""
import os
import re
import sys
import uuid

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("SUPERADMIN_PHONE", "251900061300,251918032065")
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import models
from main import app
from database import SessionLocal
from auth import create_access_token
from migrate import run_migrations
from settings import superadmin_phones

run_migrations()
client = TestClient(app)
OWNER = superadmin_phones()[0]
BASE = "/api/superadmin/documents"


def _token(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.id), "phone_number": u.phone_number, "role": u.role})}


def _owner():
    db = SessionLocal()
    try:
        return _token(db.query(models.User).filter(models.User.phone_number == OWNER).first())
    finally:
        db.close()


def _member(name="Abebe Kebede"):
    phone = f"25196{uuid.uuid4().int % 10**7:07d}"
    db = SessionLocal()
    try:
        u = models.User(phone_number=phone, full_name=name, role="dealer_admin", dealership_id=1, is_active=True,
                        permissions_json=models.encode_permissions(models.STAFF_PERMISSIONS))
        db.add(u)
        db.commit()
        db.refresh(u)
        return u
    finally:
        db.close()


def _seq(number, prefix):
    m = re.match(rf"{prefix}-(\d{{4,}})$", number)
    assert m, number
    return int(m.group(1))


def test_staff_get_403():
    staff = _token(_member())
    for t in ("employment", "property"):
        assert client.get(f"{BASE}/{t}", headers=staff).status_code == 403, t
        assert client.post(f"{BASE}/{t}", headers=staff, json={"status": "draft", "data": {}}).status_code == 403, t
        assert client.get(f"{BASE}/{t}/1", headers=staff).status_code == 403, t
        assert client.put(f"{BASE}/{t}/1", headers=staff, json={"data": {}}).status_code == 403, t
        assert client.post(f"{BASE}/{t}/1/archive", headers=staff).status_code == 403, t
        assert client.post(f"{BASE}/{t}/1/stamped", headers=staff).status_code == 403, t
    assert client.get(f"{BASE}/staff-summary", headers=staff).status_code == 403
    assert client.get(f"{BASE}/staff/1", headers=staff).status_code == 403
    assert client.get(f"{BASE}/employment").status_code == 401
    print("✓ staff get 403 (no token: 401) on every staff-document endpoint")


def test_numbering():
    h = _owner()
    a = client.post(f"{BASE}/employment", headers=h, json={"status": "draft", "data": {}}).json()
    b = client.post(f"{BASE}/employment", headers=h, json={"status": "draft", "data": {}}).json()
    p = client.post(f"{BASE}/property", headers=h, json={"status": "draft", "data": {}}).json()
    q = client.post(f"{BASE}/property", headers=h, json={"status": "draft", "data": {}}).json()
    assert _seq(b["number"], "EC") == _seq(a["number"], "EC") + 1
    assert _seq(q["number"], "PH") == _seq(p["number"], "PH") + 1
    # Separate series: a property form doesn't advance the contract numbers and vice versa.
    c = client.post(f"{BASE}/employment", headers=h, json={"status": "draft", "data": {}}).json()
    assert _seq(c["number"], "EC") == _seq(b["number"], "EC") + 1
    # Other series untouched by staff docs.
    dp1 = client.post(f"{BASE}/downpayment", headers=h, json={"status": "draft", "data": {}}).json()
    client.post(f"{BASE}/employment", headers=h, json={"status": "draft", "data": {}})
    dp2 = client.post(f"{BASE}/downpayment", headers=h, json={"status": "draft", "data": {}}).json()
    assert _seq(dp2["number"], "DP") == _seq(dp1["number"], "DP") + 1
    # Archived numbers are never reused.
    client.post(f"{BASE}/property/{q['id']}/archive", headers=h)
    r = client.post(f"{BASE}/property", headers=h, json={"status": "draft", "data": {}}).json()
    assert _seq(r["number"], "PH") == _seq(q["number"], "PH") + 1
    assert a["data"]["employer_name"] == "ኤሲ ዋለ መኪና መሸጫ" and a["date"]
    print("✓ EC-/PH- numbering: own series, sequential, never reused, other series unaffected")


def test_final_rules_and_member_link():
    h = _owner()
    m = _member("Sara Tesfaye")
    r = client.post(f"{BASE}/employment", headers=h, json={"status": "final", "data": {"employee_name": "X"}})
    assert r.status_code == 422 and {"job_position", "salary"} <= set(r.json()["detail"]["missing"])
    r = client.post(f"{BASE}/employment", headers=h, json={"data": {
        "staff_user_id": m.id, "job_position": "ሻጭ", "salary": "12,000", "salary_words": "አስራ ሁለት ሺህ ብር"}})
    assert r.status_code == 422 and r.json()["detail"]["missing"] == ["employee_name"]
    r = client.post(f"{BASE}/employment", headers=h, json={"data": {
        "staff_user_id": m.id, "employee_name": "Sara Tesfaye", "job_position": "ሻጭ", "salary": "12,000"}})
    assert r.status_code == 201, r.text
    ec = r.json()
    assert ec["status"] == "final" and ec["amount"] == 12000 and ec["extra"]["staff_user_id"] == m.id
    assert ec["party_phone"] == m.phone_number, "phone falls back to the linked member"
    assert ec["plate_number"] is None and ec["vehicle_id"] is None and ec["title"] == "ሻጭ"
    assert ec["data"]["staff_user_id"] == m.id

    r = client.post(f"{BASE}/property", headers=h, json={"data": {"staff_name": "Sara", "items": [{"item": ""}]}})
    assert r.status_code == 422 and r.json()["detail"]["missing"] == ["items"]
    r = client.post(f"{BASE}/property", headers=h, json={"data": {
        "staff_user_id": m.id, "staff_name": "Sara Tesfaye", "staff_position": "ሻጭ",
        "items": [
            {"item": "ላፕቶፕ", "handed_by": "Owner", "received_by": "Sara", "time": "09:00"},
            {"item": "ቁልፍ", "returned": True, "returned_date": "2026-11-20", "remarks": "OK"},
            {"item": "  "},
            {"item": "ስልክ", "returned": False, "returned_date": "2026-11-01"},
        ]}})
    assert r.status_code == 201, r.text
    ph = r.json()
    items = ph["data"]["items"]
    assert [i["item"] for i in items] == ["ላፕቶፕ", "ቁልፍ", "ስልክ"], "empty rows dropped, order kept"
    assert items[2]["returned_date"] == "", "return date only kept for returned rows"
    assert ph["extra"]["holding"] == 2 and ph["extra"]["item_count"] == 3

    # Search by name, phone and number
    for term in ("Sara Tesfaye", m.phone_number[-6:], ph["number"]):
        rows = client.get(f"{BASE}/property", headers=h, params={"q": term}).json()
        assert any(x["id"] == ph["id"] for x in rows), term

    s = client.get(f"{BASE}/staff-summary", headers=h).json()[str(m.id)]
    assert s == {"documents": 2, "holding": 2}
    one = client.get(f"{BASE}/staff/{m.id}", headers=h).json()
    assert {d["number"] for d in one["documents"]} == {ec["number"], ph["number"]}
    assert one["holding"] == 2 and {i["item"] for i in one["holding_items"]} == {"ላፕቶፕ", "ስልክ"}

    # Mark the laptop returned -> holding drops; archived forms don't count.
    items[0]["returned"] = True
    items[0]["returned_date"] = "2026-11-28"
    r = client.put(f"{BASE}/property/{ph['id']}", headers=h, json={"data": {"items": items}})
    assert r.json()["extra"]["holding"] == 1
    client.post(f"{BASE}/property/{ph['id']}/archive", headers=h)
    assert client.get(f"{BASE}/staff-summary", headers=h).json()[str(m.id)] == {"documents": 1, "holding": 0}
    client.post(f"{BASE}/property/{ph['id']}/restore", headers=h)

    # Unknown member -> 404
    assert client.post(f"{BASE}/property", headers=h, json={"status": "draft", "data": {"staff_user_id": 99999999}}).status_code == 404
    # Stamp only on final; drafts refused.
    d = client.post(f"{BASE}/employment", headers=h, json={"status": "draft", "data": {}}).json()
    assert client.post(f"{BASE}/employment/{d['id']}/stamped", headers=h).status_code == 409
    assert client.post(f"{BASE}/employment/{ec['id']}/stamped", headers=h).json()["stamped"] is True

    # Removing the member keeps the documents but clears the link.
    assert client.delete(f"/api/superadmin/staff/{m.id}/permanent", headers=h).status_code == 204
    kept = client.get(f"{BASE}/employment/{ec['id']}", headers=h).json()
    assert kept["party_name"] == "Sara Tesfaye" and kept["extra"]["staff_user_id"] is None
    print("✓ final-field rules, Team link + phone fallback, items held/returned, per-member list, stamp, unlink on removal")


def test_summary_and_vehicle_isolation():
    h = _owner()
    s = client.get(f"{BASE}/summary", headers=h).json()
    assert "employment" in s and "property" in s
    print("✓ summary includes the staff document tiles")


if __name__ == "__main__":
    test_staff_get_403()
    test_numbering()
    test_final_rules_and_member_link()
    test_summary_and_vehicle_isolation()
    print("\nAll staff document tests passed.")
