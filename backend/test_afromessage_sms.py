import sys
import os
sys.path.insert(0, os.path.abspath("backend"))

import asyncio
from unittest.mock import patch
from fastapi.testclient import TestClient

from main import app
from config import settings
import models
from database import SessionLocal
from sms import send_otp_sms
from auth import rate_limiter

client = TestClient(app)

def test_afromessage_sms_integration():
    print("🚀 Starting AfroMessage SMS Gateway & Secure OTP Tests...\n")
    db = SessionLocal()

    # 1. Test Mock SMS when token is empty or dispatch disabled
    with patch.object(settings, "AFROMESSAGE_API_TOKEN", ""):
        with patch.object(settings, "ENABLE_SMS_DISPATCH", True):
            success = asyncio.run(send_otp_sms("0911223344", "123456"))
            assert success is True
            print("✓ Test 1: Mock SMS mode logged and returned True when API token is empty")

    with patch.object(settings, "AFROMESSAGE_API_TOKEN", "test_token"):
        with patch.object(settings, "ENABLE_SMS_DISPATCH", False):
            success = asyncio.run(send_otp_sms("0911223344", "123456"))
            assert success is True
            print("✓ Test 2: Mock SMS mode logged and returned True when ENABLE_SMS_DISPATCH is False")

    # 2. Test Real HTTP Dispatch with payload & phone normalization
    mock_requests = []

    class FakeResponse:
        def __init__(self, status_code=200, acknowledge="success", message_id="mock_msg_123"):
            self.status_code = status_code
            self.acknowledge = acknowledge
            self.message_id = message_id
            self.text = f'{{"acknowledge": "{acknowledge}", "response": {{"message_id": "{message_id}"}}}}'

        def json(self):
            return {
                "acknowledge": self.acknowledge,
                "response": {"message_id": self.message_id}
            }

    async def fake_afromessage_get(self, url, params=None, headers=None, timeout=None):
        mock_requests.append({
            "url": str(url),
            "params": params,
            "headers": headers
        })
        return FakeResponse()

    with patch("httpx.AsyncClient.get", fake_afromessage_get):
        with patch.object(settings, "AFROMESSAGE_API_TOKEN", "  Bearer live_afro_token_12345  "):
            with patch.object(settings, "AFROMESSAGE_IDENTIFIER_ID", "ident_uuid_9999"):
                with patch.object(settings, "AFROMESSAGE_SENDER_NAME", "AutoShowroom"):
                    with patch.object(settings, "ENABLE_SMS_DISPATCH", True):
                        # Test +251 prefix normalization and token cleaning
                        res = asyncio.run(send_otp_sms("+251912345678", "789012"))
                        assert res is True
                        assert len(mock_requests) == 1
                        req = mock_requests[0]
                        assert req["url"] == "https://api.afromessage.com/api/send"
                        assert req["headers"]["Authorization"] == "Bearer live_afro_token_12345"
                        assert req["params"]["to"] == "0912345678", f"Expected 0912345678, got {req['params']['to']}"
                        assert "789012" in req["params"]["message"]
                        assert req["params"]["sender"] == "AutoShowroom"
                        assert req["params"]["from"] == "ident_uuid_9999"
                        print("✓ Test 3: AfroMessage HTTP dispatch verified with +251 -> 09 normalization, identifier ID, headers, and sender")

                        # Test 251 prefix normalization
                        mock_requests.clear()
                        res2 = asyncio.run(send_otp_sms("251712345678", "654321"))
                        assert res2 is True
                        assert mock_requests[0]["params"]["to"] == "0712345678"
                        assert "654321" in mock_requests[0]["params"]["message"]
                        print("✓ Test 4: AfroMessage HTTP dispatch verified with 2517 -> 07 Safaricom normalization")

    # 3. Test Route Integration: POST /api/auth/request-otp with Zero OTP Leaks
    test_phone = "0988776655"
    norm_phone = "251988776655"
    rate_limiter.reset_for_phone(norm_phone)

    # Clean old OTPs
    db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == norm_phone).delete()
    db.commit()

    # Login lock: only registered, active staff (or owners) get an OTP, so register this number first.
    staff = db.query(models.User).filter(models.User.phone_number == norm_phone).first()
    if not staff:
        staff = models.User(phone_number=norm_phone, role="dealer_admin", dealership_id=1)
        db.add(staff)
    staff.is_active = True
    staff.permissions_json = models.encode_permissions(["vehicles"])
    db.commit()

    sms_dispatches = []
    async def track_sms(phone, otp):
        sms_dispatches.append({"phone": phone, "otp": otp})
        return True

    with patch("auth.send_otp_sms", track_sms):
        res_otp = client.post("/api/auth/request-otp", json={"phone_number": test_phone})
        assert res_otp.status_code == 200, f"Request OTP failed: {res_otp.text}"
        data = res_otp.json()

        # Strict Security Assertions: 0 OTP code in JSON response
        assert data["status"] == "success"
        assert "የማረጋገጫ ኮድ በ SMS ተልኳል" in data["message"]
        assert "otp_code" not in data or data["otp_code"] is None, "CRITICAL: otp_code leaked in response!"
        assert "otp_display" not in data or data["otp_display"] is None, "CRITICAL: otp_display leaked in response!"
        print("✓ Test 5: POST /api/auth/request-otp returned status='success' and strictly ZERO leaked OTP in JSON response")

        # Verify SMS dispatch was triggered with the actual code
        assert len(sms_dispatches) == 1
        dispatched_otp = sms_dispatches[0]["otp"]
        assert len(dispatched_otp) == 6
        assert dispatched_otp.isdigit()
        print(f"✓ Test 6: AfroMessage SMS dispatch was called for {norm_phone} with 6-digit code: {dispatched_otp}")

        # Verify that the code from SMS can be verified successfully
        res_verify = client.post("/api/auth/verify-otp", json={
            "phone_number": test_phone,
            "otp_code": dispatched_otp
        })
        assert res_verify.status_code == 200, f"Verification failed: {res_verify.text}"
        auth_data = res_verify.json()
        assert "access_token" in auth_data
        assert auth_data["user"]["phone_number"] == norm_phone
        print("✓ Test 7: POST /api/auth/verify-otp succeeded using the SMS-dispatched OTP")

    # Cleanup
    db.query(models.OTPVerification).filter(models.OTPVerification.phone_number == norm_phone).delete()
    db.query(models.User).filter(models.User.phone_number == norm_phone).delete()
    db.commit()
    db.close()

    print("\n🎉 ALL AFROMESSAGE SMS GATEWAY & SECURE OTP TESTS PASSED! 🚀")

if __name__ == "__main__":
    test_afromessage_sms_integration()
