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
import schemas
from settings import settings
from main import app, create_access_token
from auth import rate_limiter, TELEGRAM_LINKED_CHATS

client = TestClient(app)


def test_security_lockdown():
    print("🔒 Starting Security Lockdown, SuperAdmin Master Guard, and Telegram OTP Tests...\n")
    db = SessionLocal()

    try:
        # =============================================================
        # 1. SuperAdmin Strict Locking
        # =============================================================
        print("--- [SECTION 1: SuperAdmin Strict Locking] ---")
        dealer1 = db.query(models.Dealership).filter(models.Dealership.id == 1).first()
        assert dealer1 is not None

        # 1.1 Master SuperAdmin (role == "superadmin" AND phone == settings.SUPERADMIN_PHONE)
        master_phone = settings.SUPERADMIN_PHONE.strip().lstrip("+")
        superadmin_user = db.query(models.User).filter(models.User.phone_number == master_phone).first()
        if not superadmin_user:
            superadmin_user = models.User(
                phone_number=master_phone,
                role="superadmin",
                dealership_id=dealer1.id,
                is_active=True
            )
            db.add(superadmin_user)
            db.commit()
            db.refresh(superadmin_user)
        else:
            superadmin_user.role = "superadmin"
            db.commit()

        master_token = create_access_token(
            data={"sub": str(superadmin_user.id), "phone_number": superadmin_user.phone_number, "role": "superadmin"}
        )
        res_super = client.get("/api/superadmin/stats", headers={"Authorization": f"Bearer {master_token}"})
        assert res_super.status_code == 200, f"Master superadmin failed: {res_super.text}"
        print("✓ 1.1 Master SuperAdmin verified with SUPERADMIN_PHONE (HTTP 200)")

        # 1.2 Imposter SuperAdmin (role == "superadmin" BUT unauthorized phone)
        imposter_user = db.query(models.User).filter(models.User.phone_number == "251911999999").first()
        if not imposter_user:
            imposter_user = models.User(
                phone_number="251911999999",
                role="superadmin",
                dealership_id=dealer1.id,
                is_active=True
            )
            db.add(imposter_user)
            db.commit()
            db.refresh(imposter_user)

        imposter_token = create_access_token(
            data={"sub": str(imposter_user.id), "phone_number": imposter_user.phone_number, "role": "superadmin"}
        )
        res_imposter = client.get("/api/superadmin/stats", headers={"Authorization": f"Bearer {imposter_token}"})
        assert res_imposter.status_code == 403, f"Expected 403 for imposter, got {res_imposter.status_code}"
        assert res_imposter.json()["detail"] == "Access denied: platform owner privileges required"
        print("✓ 1.2 Imposter SuperAdmin with wrong phone number strictly blocked with HTTP 403 ('Access denied: platform owner privileges required')")

        # 1.3 Regular Admin blocked
        regular_user = db.query(models.User).filter(models.User.phone_number == "251911223344").first()
        if not regular_user:
            regular_user = models.User(
                phone_number="251911223344",
                role="dealer_admin",
                dealership_id=dealer1.id,
                is_active=True
            )
            db.add(regular_user)
            db.commit()
            db.refresh(regular_user)

        reg_token = create_access_token(
            data={"sub": str(regular_user.id), "phone_number": regular_user.phone_number, "role": "dealer_admin"}
        )
        res_reg_super = client.get("/api/superadmin/stats", headers={"Authorization": f"Bearer {reg_token}"})
        assert res_reg_super.status_code == 403
        print("✓ 1.3 Regular dealer_admin blocked from superadmin endpoints (HTTP 403)")

        # =============================================================
        # 2. Deactivated Dealership Suspension Handling
        # =============================================================
        print("\n--- [SECTION 2: Dealership Suspension Lockdown] ---")
        suspended_dealer = db.query(models.Dealership).filter(models.Dealership.slug == "suspended-dealer-test").first()
        if not suspended_dealer:
            suspended_dealer = models.Dealership(
                name="Suspended Motors",
                slug="suspended-dealer-test",
                phone_number="+251922001122",
                is_active=False,
                subscription_plan="starter"
            )
            db.add(suspended_dealer)
            db.commit()
            db.refresh(suspended_dealer)
        else:
            suspended_dealer.is_active = False
            db.commit()

        # Create user belonging to suspended dealership
        susp_user = db.query(models.User).filter(models.User.phone_number == "251922001122").first()
        if not susp_user:
            susp_user = models.User(
                phone_number="251922001122",
                role="dealer_admin",
                dealership_id=suspended_dealer.id,
                is_active=True
            )
            db.add(susp_user)
            db.commit()
            db.refresh(susp_user)

        susp_token = create_access_token(
            data={"sub": str(susp_user.id), "phone_number": susp_user.phone_number, "role": "dealer_admin"}
        )

        # 2.1 Subsequent user requests instantly rejected with 403
        res_susp_req = client.get("/api/admin/vehicles", headers={"Authorization": f"Bearer {susp_token}"})
        assert res_susp_req.status_code == 403, f"Expected 403, got {res_susp_req.status_code}"
        assert res_susp_req.json()["detail"] == "Your dealership account is currently suspended. Please contact platform support."
        print("✓ 2.1 Suspended dealership user request rejected with HTTP 403 ('Your dealership account is currently suspended. Please contact platform support.')")

        # 2.2 Public GET /api/vehicles with suspended slug
        res_pub_cars = client.get("/api/vehicles?dealership_slug=suspended-dealer-test")
        assert res_pub_cars.status_code == 403
        pub_cars_json = res_pub_cars.json()
        assert pub_cars_json.get("error") == "dealership_inactive"
        assert pub_cars_json.get("message") == "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
        print("✓ 2.2 Public GET /api/vehicles returned error: 'dealership_inactive' with Amharic suspension message")

        # 2.3 Public GET /api/public/dealerships/{slug}
        res_pub_dealer = client.get("/api/public/dealerships/suspended-dealer-test")
        assert res_pub_dealer.status_code == 403
        pub_dealer_json = res_pub_dealer.json()
        assert pub_dealer_json.get("error") == "dealership_inactive"
        assert pub_dealer_json.get("message") == "ይህ ሾውሩም ለጊዜው አገልግሎት አይሰጥም።"
        print("✓ 2.3 Public GET /api/public/dealerships/{slug} returned error: 'dealership_inactive' with Amharic suspension message")

        # =============================================================
        # 3. Telegram OTP & Brute-Force Rate Limiting
        # =============================================================
        print("\n--- [SECTION 3: Telegram OTP & Brute-Force Rate Limiter] ---")
        test_phone_unlinked = "0977112233"
        rate_limiter.reset_for_phone("251977112233")
        TELEGRAM_LINKED_CHATS.pop("251977112233", None)
        db.query(models.User).filter(models.User.phone_number == "251977112233").delete()
        db.query(models.Dealership).filter(models.Dealership.phone_number.like("%977112233%")).delete()
        db.commit()

        # 3.1 First-time registration returns success with transparent otp_code and deep-link
        res_unlinked = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert res_unlinked.status_code == 200
        unlinked_data = res_unlinked.json()
        assert unlinked_data["status"] == "success"
        assert unlinked_data.get("otp_code") is None, "Security leak: otp_code must NOT be exposed in response!"
        assert unlinked_data.get("otp_display") is None, "Security leak: otp_display must NOT be exposed in response!"
        assert unlinked_data["telegram_sent"] is False
        assert "start=link_251977112233" in unlinked_data["bot_link"]
        assert "የማረጋገጫ ኮድ በ SMS ተልኳል" in unlinked_data["message"]

        # Check stub user and dealership created, and OTP recorded in DB
        otp_rec = db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == "251977112233").order_by(models.OTPVerification.id.desc()).first()
        assert otp_rec is not None
        assert len(otp_rec.otp_code) == 6
        assert otp_rec.otp_code.isdigit()

        stub_user = db.query(models.User).filter(models.User.phone_number == "251977112233").first()
        assert stub_user is not None
        assert stub_user.dealership_id is not None
        print("✓ 3.1 First-time dealer registration dispatches SMS OTP with 0 code leak in JSON response, and creates showroom stub")

        # 3.2 Telegram Bot /start link_<phone> handler links chat_id and dispatches OTP
        res_webhook = client.post("/api/telegram/webhook", json={
            "message": {
                "chat": {"id": 99887766},
                "text": f"/start link_251977112233"
            }
        })
        assert res_webhook.status_code == 200
        db.refresh(stub_user)
        assert stub_user.telegram_chat_id == "99887766"
        assert stub_user.dealership.telegram_chat_id == "99887766"
        print("✓ 3.2 Telegram Bot /start link_<phone> handler extracted phone & linked chat_id to User & Dealership")

        # 3.3 Subsequent request-otp returns status='success', otp_code, and telegram_sent flag
        rate_limiter.reset_for_phone("251977112233")
        res_linked_otp = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert res_linked_otp.status_code == 200
        linked_data = res_linked_otp.json()
        assert linked_data["status"] == "success"
        assert linked_data.get("otp_code") is None, "Security leak: otp_code must NOT be exposed in response!"
        assert linked_data.get("otp_display") is None, "Security leak: otp_display must NOT be exposed in response!"
        assert "telegram_sent" in linked_data
        assert linked_data["expires_in_seconds"] == 180
        print("✓ 3.3 Subsequent request-otp for linked user returns status: 'success' and 0 exposed OTP in JSON")

        # 3.3 Default OTP "1234" is strictly rejected
        res_bypass = client.post("/api/auth/verify-otp", json={"phone_number": test_phone_unlinked, "otp_code": "1234"})
        assert res_bypass.status_code == 400
        print("✓ 3.3 Default dev OTP '1234' strictly rejected (HTTP 400)")

        # 3.4 Rate Limit: Max 3 OTP requests / 10 minutes
        rate_limiter.reset_for_phone("251977112233")
        r1 = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert r1.status_code == 200
        r2 = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert r2.status_code == 200
        r3 = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert r3.status_code == 200
        # 4th request must be rate limited
        r4 = client.post("/api/auth/send-otp", json={"phone_number": test_phone_unlinked})
        assert r4.status_code == 429
        assert "Rate limit exceeded" in r4.json()["detail"]
        print("✓ 3.4 Brute-force OTP request rate limit enforced (4th request blocked with HTTP 429)")

        # 3.5 Rate Limit: Max 5 failed verification attempts triggers 15-minute lockout
        rate_limiter.reset_for_phone("251977112233")
        for i in range(4):
            fail_res = client.post("/api/auth/verify-otp", json={"phone_number": test_phone_unlinked, "otp_code": "000000"})
            assert fail_res.status_code == 400

        # 5th failed attempt should trigger lockout
        fail_res_5 = client.post("/api/auth/verify-otp", json={"phone_number": test_phone_unlinked, "otp_code": "000000"})
        assert fail_res_5.status_code == 429, f"Expected 429, got {fail_res_5.status_code}"
        assert "locked for 15 minutes" in fail_res_5.json()["detail"]

        # Subsequent attempt remains locked
        fail_res_6 = client.post("/api/auth/verify-otp", json={"phone_number": test_phone_unlinked, "otp_code": "000000"})
        assert fail_res_6.status_code == 429
        print("✓ 3.5 Brute-force verification lockout enforced (5 failed attempts locks for 15 minutes, HTTP 429)")

        # 3.6 Valid 6-digit OTP verification success
        rate_limiter.reset_for_phone("251977112233")
        real_otp_code = "951753"
        db.add(models.OTPVerification(
            phone_number="251977112233",
            otp_code=real_otp_code,
            expires_at=datetime.utcnow() + timedelta(minutes=3),
            is_used=False
        ))
        db.commit()

        success_res = client.post("/api/auth/verify-otp", json={"phone_number": test_phone_unlinked, "otp_code": real_otp_code})
        assert success_res.status_code == 200
        assert "access_token" in success_res.json()
        print("✓ 3.6 Valid 6-digit OTP verified successfully (HTTP 200, JWT token issued)")

        # =============================================================
        # 4. Input Validation & Tenant Protection
        # =============================================================
        print("\n--- [SECTION 4: Input Validation & Cross-Tenant Protection] ---")

        # 4.1 Schema Negative Financial Values Rejection
        test_car_payload = {
            "make": "Toyota",
            "model": "Yaris",
            "year": 2024,
            "fuel_type": "Gasoline",
            "image_urls": ["https://example.com/car.webp"]
        }

        # Negative price
        bad_price = {**test_car_payload, "price": -500000.0}
        r_neg_price = client.post("/api/admin/vehicles", json=bad_price, headers={"Authorization": f"Bearer {reg_token}"})
        assert r_neg_price.status_code == 422, f"Expected 422 for negative price, got {r_neg_price.status_code}"
        print("✓ 4.1.a Negative price rejected with HTTP 422")

        # Negative down_payment
        bad_down = {**test_car_payload, "has_bank_loan": True, "down_payment": -100000.0}
        r_neg_down = client.post("/api/admin/vehicles", json=bad_down, headers={"Authorization": f"Bearer {reg_token}"})
        assert r_neg_down.status_code == 422
        print("✓ 4.1.b Negative down_payment rejected with HTTP 422")

        # Negative bank_loan
        bad_loan = {**test_car_payload, "has_bank_loan": True, "bank_loan": -250000.0}
        r_neg_loan = client.post("/api/admin/vehicles", json=bad_loan, headers={"Authorization": f"Bearer {reg_token}"})
        assert r_neg_loan.status_code == 422
        print("✓ 4.1.c Negative bank_loan rejected with HTTP 422")

        # 4.2 Cross-Tenant Edit & Delete Protection
        # Create Vehicle for Dealer 1
        v1 = models.Vehicle(
            make="Hyundai",
            model="Tucson",
            year=2025,
            price=4500000.0,
            fuel_type="Hybrid",
            body_type="SUV",
            dealership_id=dealer1.id
        )
        db.add(v1)
        db.commit()
        db.refresh(v1)

        # Create Second Dealer & User
        dealer2 = db.query(models.Dealership).filter(models.Dealership.slug == "dealer-two-test").first()
        if not dealer2:
            dealer2 = models.Dealership(
                name="Dealer Two",
                slug="dealer-two-test",
                phone_number="+251933557799",
                is_active=True
            )
            db.add(dealer2)
            db.commit()
            db.refresh(dealer2)

        user2 = db.query(models.User).filter(models.User.phone_number == "251933557799").first()
        if not user2:
            user2 = models.User(
                phone_number="251933557799",
                role="dealer_admin",
                dealership_id=dealer2.id,
                is_active=True
            )
            db.add(user2)
            db.commit()
            db.refresh(user2)

        token2 = create_access_token(
            data={"sub": str(user2.id), "phone_number": user2.phone_number, "role": "dealer_admin"}
        )
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Attempt to UPDATE Dealer 1's vehicle as User 2 -> 403 Forbidden
        update_payload = {
            "make": "Hacked",
            "model": "Car",
            "year": 2025,
            "fuel_type": "Gasoline",
            "body_type": "SUV",
            "image_urls": ["https://example.com/hacked.webp"]
        }
        res_cross_put = client.put(f"/api/admin/vehicles/{v1.id}", json=update_payload, headers=headers2)
        assert res_cross_put.status_code == 403, f"Expected 403 on cross-tenant PUT, got {res_cross_put.status_code}"
        print("✓ 4.2.a Cross-tenant vehicle update (PUT) strictly blocked (HTTP 403 Forbidden)")

        # Attempt to PATCH status of Dealer 1's vehicle as User 2 -> 403 Forbidden
        res_cross_patch = client.patch(f"/api/admin/vehicles/{v1.id}/status?new_status=Sold", headers=headers2)
        assert res_cross_patch.status_code == 403
        print("✓ 4.2.b Cross-tenant vehicle status patch strictly blocked (HTTP 403 Forbidden)")

        # Attempt to DELETE Dealer 1's vehicle as User 2 -> 403 Forbidden
        res_cross_del = client.delete(f"/api/admin/vehicles/{v1.id}", headers=headers2)
        assert res_cross_del.status_code == 403
        print("✓ 4.2.c Cross-tenant vehicle delete strictly blocked (HTTP 403 Forbidden)")

        # Cleanup
        db.delete(v1)
        if imposter_user:
            db.delete(imposter_user)
        if susp_user:
            db.delete(susp_user)
        if suspended_dealer:
            db.delete(suspended_dealer)
        if user2:
            db.delete(user2)
        if dealer2:
            db.delete(dealer2)
        db.query(models.User).filter(models.User.phone_number == "251977112233").delete()
        db.query(models.Dealership).filter(models.Dealership.phone_number.like("%977112233%")).delete()
        TELEGRAM_LINKED_CHATS.pop("251977112233", None)
        db.commit()

        print("\n🎉 ALL SECURITY LOCKDOWN & TELEGRAM OTP TRANSITION TESTS PASSED! 🚀")

    finally:
        db.close()


if __name__ == "__main__":
    test_security_lockdown()
