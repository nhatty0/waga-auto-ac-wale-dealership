"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Car,
  Calendar,
  Clock,
  UploadCloud,
  X,
  Lock,
  LogOut,
  Pencil,
  Printer,
  Image as ImageIcon,
  Phone,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Settings,
  Send,
  Save,
  CarFront,
  Check,
  ExternalLink,
  Copy,
  QrCode,
  Globe,
  Building2,
} from "lucide-react";
import { Vehicle, Appointment, User } from "@/types";
import PrintFlyerModal from "@/components/admin/PrintFlyerModal";
import ShowroomQrModal from "@/components/admin/ShowroomQrModal";
import { getApiBaseUrl } from "@/lib/api";
import { resolveImageUrl } from "@/lib/images";
import { getPlateLabel, getPlateBadgeClasses, getPlateType, extractPlateNumber } from "@/lib/plates";

// Regex for strictly valid Ethiopian mobile formats (09..., 07..., 9..., 7..., 2519..., +2519..., etc.)
const ETHIOPIAN_PHONE_REGEX = /^(?:\+251|251|0)?([79]\d{8})$/;

// Enforces digits only (with optional leading +) and restricts max length by prefix
const formatAndClampEthiopianPhone = (val: string): string => {
  const trimmed = val.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  let cleaned = hasPlus ? `+${digits}` : digits;

  // Prefix-based maxLength restriction:
  // - Starts with "+251": 13 (e.g. +251912345678)
  // - Starts with "251": 12 (e.g. 251912345678)
  // - Starts with "09" or "07" or "0": 10 (e.g. 0912345678)
  // - Starts with "9" or "7": 9 (e.g. 912345678)
  let max = 13;
  if (cleaned.startsWith("+251")) {
    max = 13;
  } else if (cleaned.startsWith("251")) {
    max = 12;
  } else if (cleaned.startsWith("09") || cleaned.startsWith("07") || cleaned.startsWith("0")) {
    max = 10;
  } else if (cleaned.startsWith("9") || cleaned.startsWith("7")) {
    max = 9;
  } else {
    max = 13;
  }

  if (cleaned.length > max) {
    cleaned = cleaned.slice(0, max);
  }
  return cleaned;
};

const getPhoneMaxLength = (val: string): number => {
  if (val.startsWith("+251")) return 13;
  if (val.startsWith("251")) return 12;
  if (val.startsWith("09") || val.startsWith("07") || val.startsWith("0")) return 10;
  if (val.startsWith("9") || val.startsWith("7")) return 9;
  return 13;
};

const getPhoneValidation = (val: string) => {
  const clean = val.trim();
  if (!clean) {
    return {
      isValid: false,
      status: "empty" as const,
      message: null,
      carrier: null,
    };
  }

  const isValid = ETHIOPIAN_PHONE_REGEX.test(clean);

  if (isValid) {
    const isEthio = clean.includes("9") && (clean.startsWith("09") || clean.startsWith("9") || clean.includes("2519"));
    const carrier = isEthio ? "Ethio Telecom" : "Safaricom";
    return {
      isValid: true,
      status: "valid" as const,
      message: `✓ Valid ${carrier} mobile number`,
      carrier,
    };
  }

  // Check prefix validity:
  if (clean.startsWith("0")) {
    if (clean.length >= 2 && !clean.startsWith("09") && !clean.startsWith("07")) {
      return {
        isValid: false,
        status: "error" as const,
        message: "Must be a valid 09... or 07... number (Ethio Telecom or Safaricom)",
        carrier: null,
      };
    }
    return {
      isValid: false,
      status: "warning" as const,
      message: `Incomplete number (${clean.length}/10 digits). Must be a valid 09... or 07... number.`,
      carrier: clean.startsWith("09") ? "Ethio Telecom" : clean.startsWith("07") ? "Safaricom" : null,
    };
  }

  if (clean.startsWith("9") || clean.startsWith("7")) {
    return {
      isValid: false,
      status: "warning" as const,
      message: `Incomplete number (${clean.length}/9 digits). Must be a valid 9... or 7... number.`,
      carrier: clean.startsWith("9") ? "Ethio Telecom" : "Safaricom",
    };
  }

  if (clean.startsWith("+251") || clean.startsWith("251")) {
    const prefixLen = clean.startsWith("+") ? 4 : 3;
    const expected = clean.startsWith("+") ? 13 : 12;
    if (clean.length > prefixLen) {
      const nextChar = clean[prefixLen];
      if (nextChar !== "9" && nextChar !== "7") {
        return {
          isValid: false,
          status: "error" as const,
          message: "After country code (+251), number must start with 9 or 7.",
          carrier: null,
        };
      }
    }
    return {
      isValid: false,
      status: "warning" as const,
      message: `Incomplete international number (${clean.length}/${expected} digits).`,
      carrier: clean.includes("2519") ? "Ethio Telecom" : clean.includes("2517") ? "Safaricom" : null,
    };
  }

  return {
    isValid: false,
    status: "error" as const,
    message: "Must be a valid 09... or 07... number",
    carrier: null,
  };
};

export default function AdminDashboard() {
  const router = useRouter();
  // Auth states
  const [initialChecking, setInitialChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const dealership = currentUser?.dealership;

  // 2-Step Login state
  const [loginStep, setLoginStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState<string | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingOtp, setOnboardingOtp] = useState<string | null>(null);
  const [telegramBotLink, setTelegramBotLink] = useState<string | null>(null);
  const [responseOtpCode, setResponseOtpCode] = useState<string | null>(null);
  const [telegramSent, setTelegramSent] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Real-time phone validation state
  const phoneValidation = getPhoneValidation(phoneNumber);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAndClampEthiopianPhone(e.target.value);
    setPhoneNumber(formatted);
    setAuthError(null);
  };

  // Dashboard states
  const [activeTab, setActiveTab] = useState<"inventory" | "appointments" | "settings">(
    "inventory"
  );

  // Dealership Settings State
  const [dealershipSettings, setDealershipSettings] = useState({
    id: 0,
    name: "",
    slug: "",
    phone_number: "",
    logo_url: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_bot_username: "",
  });

  // Dealer Share Center State
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedShowroomLink, setCopiedShowroomLink] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestStatus, setTelegramTestStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Logo upload & Toast feedback states
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoImgError, setLogoImgError] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [printingVehicle, setPrintingVehicle] = useState<Vehicle | null>(null);

  const [formData, setFormData] = useState({
    make: "",
    model: "",
    year: 2026,
    price: "",
    mileage: "",
    condition: "Slightly Used",
    fuel_type: "Gasoline",
    body_type: "Hatchback",
    custom_body_type: "",
    transmission: "Automatic",
    drive_train: "FWD",
    engine_size: "1.6L 4-Cylinder",
    exterior_color: "Silver",
    customs_cleared: true,
    description: "",
    has_bank_loan: false,
    cash_price: "",
    bank_loan_amount: "",
    bank_name: "",
    plate_status: "Code 2",
    custom_plate_number: "",
  });

  const resetForm = () => {
    setFormData({
      make: "",
      model: "",
      year: 2026,
      price: "",
      mileage: "",
      condition: "Slightly Used",
      fuel_type: "Gasoline",
      body_type: "Hatchback",
      custom_body_type: "",
      transmission: "Automatic",
      drive_train: "FWD",
      engine_size: "1.6L 4-Cylinder",
      exterior_color: "Silver",
      customs_cleared: true,
      description: "",
      has_bank_loan: false,
      cash_price: "",
      bank_loan_amount: "",
      bank_name: "",
      plate_status: "Code 2",
      custom_plate_number: "",
    });
    setUploadedImages([]);
    setEditingVehicleId(null);
  };

  // Helper to retrieve auth token
  const getAuthToken = () => {
    return typeof window !== "undefined"
      ? localStorage.getItem("token") || localStorage.getItem("dealer_token")
      : null;
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  // Central 401/403 Unauthorized handler: resets state & prompts for login
  const handleUnauthorized = (customError?: string) => {
    localStorage.removeItem("token");
    localStorage.removeItem("dealer_token");
    localStorage.removeItem("dealership");
    sessionStorage.removeItem("dealer_authenticated");
    setIsAuthenticated(false);
    setCurrentUser(null);
    setLoginStep("phone");
    setOtpDigits(["", "", "", "", "", ""]);
    setTelegramLinkUrl(null);
    setIsOnboarding(false);
    setOnboardingOtp(null);
    setTelegramBotLink(null);
    setResponseOtpCode(null);
    setTelegramSent(false);
    setAuthError(customError || "Session expired or unauthorized. Please log in with your phone number.");
  };

  // Check persistent login on mount
  useEffect(() => {
    const checkPersistentAuth = async () => {
      // 1. Check if token exists in localStorage (checking both 'token' and 'dealer_token')
      const token = typeof window !== "undefined"
        ? localStorage.getItem("token") || localStorage.getItem("dealer_token")
        : null;

      if (!token) {
        setIsAuthenticated(false);
        setInitialChecking(false);
        return;
      }

      const baseApi = getApiBaseUrl();

      try {
        // Fetch GET /api/admin/dealership with Authorization: Bearer ${token}
        const res = await fetch(`${baseApi}/api/admin/dealership`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // If the request returns 401/403 (expired or revoked), cleanly call localStorage.removeItem('token') and reset to login
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
          localStorage.removeItem("dealer_token");
          localStorage.removeItem("dealership");
          handleUnauthorized();
          return;
        }

        if (res.ok) {
          const dealerData = await res.json();
          // Store validated dealership in localStorage
          localStorage.setItem("dealership", JSON.stringify(dealerData));

          // Set dealership settings form state
          setDealershipSettings({
            id: dealerData.id || 0,
            name: dealerData.name || "",
            slug: dealerData.slug || "",
            phone_number: dealerData.phone_number || "",
            logo_url: dealerData.logo_url || "",
            telegram_bot_token: dealerData.telegram_bot_token || "",
            telegram_chat_id: dealerData.telegram_chat_id || "",
            telegram_bot_username: dealerData.telegram_bot_username || "",
          });

          // Fetch user profile (/api/admin/me) to set currentUser
          try {
            const meRes = await fetch(`${baseApi}/api/admin/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (meRes.ok) {
              const userData = await meRes.json();
              setCurrentUser(userData);
            } else {
              setCurrentUser({
                id: 1,
                phone_number: dealerData.phone_number || "",
                full_name: dealerData.name,
                role: "dealer_admin",
                dealership_id: dealerData.id,
                dealership: dealerData,
                is_active: dealerData.is_active,
                created_at: dealerData.created_at,
              });
            }
          } catch {
            setCurrentUser({
              id: 1,
              phone_number: dealerData.phone_number || "",
              full_name: dealerData.name,
              role: "dealer_admin",
              dealership_id: dealerData.id,
              dealership: dealerData,
              is_active: dealerData.is_active,
              created_at: dealerData.created_at,
            });
          }

          // Directly set the authenticated dealer state and skip login/OTP view completely
          setIsAuthenticated(true);
          sessionStorage.setItem("dealer_authenticated", "true");
          fetchData(token);
        } else {
          // Token expired, revoked, or invalid
          localStorage.removeItem("token");
          localStorage.removeItem("dealer_token");
          localStorage.removeItem("dealership");
          handleUnauthorized();
        }
      } catch (err) {
        console.error("Auth verification error:", err);
        // If server is unreachable but local token exists, restore cached dealership
        const cachedDealer = localStorage.getItem("dealership");
        if (cachedDealer) {
          try {
            const parsed = JSON.parse(cachedDealer);
            setCurrentUser((prev) => prev || {
              id: 1,
              phone_number: parsed.phone_number || "",
              full_name: parsed.name,
              role: "dealer_admin",
              dealership_id: parsed.id,
              dealership: parsed,
              is_active: true,
              created_at: parsed.created_at,
            });
          } catch {}
        }
        setIsAuthenticated(true);
        fetchData(token);
      } finally {
        setInitialChecking(false);
      }
    };

    checkPersistentAuth();
  }, []);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Step 1: Send OTP handler
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);

    const cleanNumber = phoneNumber.trim();
    if (!ETHIOPIAN_PHONE_REGEX.test(cleanNumber)) {
      setAuthError("Must be a valid 09... or 07... number (Ethio Telecom or Safaricom)");
      return;
    }

    setAuthLoading(true);
    setTelegramLinkUrl(null);
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: cleanNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to send OTP. Please check the number.");
      }

      const receivedCode = data.otp_code || data.otp_display || null;
      setResponseOtpCode(receivedCode);
      const isTelegramDelivered = Boolean(data.telegram_sent);
      setTelegramSent(isTelegramDelivered);
      setTelegramBotLink(data.bot_link || null);

      if (isTelegramDelivered) {
        setAuthSuccessMessage("ኮዱ ወደ ስልክዎ በ SMS (እንዲሁም ወደ ቴሌግራምዎ) ተልኳል");
      } else {
        setAuthSuccessMessage(null);
      }

      setLoginStep("otp");
      setOtpDigits(["", "", "", "", "", ""]);
      setResendCooldown(60);
      setAuthError(null);

      // Focus first OTP input after transition
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setAuthError(err.message || "Failed to send code. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: Verify OTP handler
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const code = otpDigits.join("");
    if (code.length !== 6) {
      setAuthError("Please enter all 6 digits of the code / እባክዎ ባለ 6 አሃዝ ኮድ ያስገቡ");
      return;
    }

    setAuthLoading(true);
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          otp_code: code,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Invalid code. Please try again.");
      }

      // Save token in localStorage and flag in sessionStorage for persistence
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("dealer_token", data.access_token);
      if (data.user?.dealership) {
        localStorage.setItem("dealership", JSON.stringify(data.user.dealership));
      }
      sessionStorage.setItem("dealer_authenticated", "true");

      setCurrentUser(data.user);
      setIsAuthenticated(true);
      fetchData(data.access_token);
    } catch (err: any) {
      setAuthError(err.message || "Verification failed. Incorrect or expired code.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle single OTP digit input
  const handleOtpDigitChange = (index: number, val: string) => {
    const digit = val.slice(-1);
    if (val && !/^\d+$/.test(digit)) return;

    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);
    setAuthError(null);

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle backspace navigation in OTP
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  // Handle clipboard paste of 4 digits
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setOtpDigits(updated);

    const nextIndex = Math.min(pasted.length, 5);
    otpInputsRef.current[nextIndex]?.focus();
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("dealer_token");
    localStorage.removeItem("dealership");
    sessionStorage.removeItem("dealer_authenticated");
    setIsAuthenticated(false);
    setCurrentUser(null);
    setLoginStep("phone");
    setPhoneNumber("");
    setOtpDigits(["", "", "", "", "", ""]);
    setTelegramLinkUrl(null);
    setIsOnboarding(false);
    setOnboardingOtp(null);
    setTelegramBotLink(null);
    setResponseOtpCode(null);
    setTelegramSent(false);
    setAuthError(null);
    setAuthSuccessMessage(null);
    router.push("/");
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchData = async (overrideToken?: string | null, targetDealerId?: number) => {
    const token = overrideToken || getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const baseApi = getApiBaseUrl();
      const dealerQuery = targetDealerId ? `?dealership_id=${targetDealerId}` : "";

      const vRes = await fetch(`${baseApi}/api/admin/vehicles${dealerQuery}`, {
        headers,
      });
      if (vRes.status === 401) {
        handleUnauthorized();
        return;
      }
      const vData = await vRes.json();
      setVehicles(Array.isArray(vData) ? vData : []);

      const aRes = await fetch(`${baseApi}/api/admin/appointments${dealerQuery}`, {
        headers,
      });
      if (aRes.status === 401) {
        handleUnauthorized();
        return;
      }
      const aData = await aRes.json();
      setAppointments(Array.isArray(aData) ? aData : []);

      const dRes = await fetch(`${baseApi}/api/admin/dealership${dealerQuery}`, {
        headers,
      });
      if (dRes.ok) {
        const dData = await dRes.json();
        setDealershipSettings({
          id: dData.id || 0,
          name: dData.name || "",
          slug: dData.slug || "",
          phone_number: dData.phone_number || "",
          logo_url: dData.logo_url || "",
          telegram_bot_token: dData.telegram_bot_token || "",
          telegram_chat_id: dData.telegram_chat_id || "",
          telegram_bot_username: dData.telegram_bot_username || "",
        });
        setCurrentUser((prev) => (prev ? { ...prev, dealership_id: dData.id, dealership: { ...(prev.dealership || {}), ...dData } } : prev));
      }
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsStatus(null);
    setIsSavedSuccess(false);

    const token = getAuthToken();
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/dealership`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dealershipSettings),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update settings");
      }

      const updated = await res.json();
      setDealershipSettings({
        id: updated.id || 0,
        name: updated.name || "",
        slug: updated.slug || "",
        phone_number: updated.phone_number || "",
        logo_url: updated.logo_url || "",
        telegram_bot_token: updated.telegram_bot_token || "",
        telegram_chat_id: updated.telegram_chat_id || "",
        telegram_bot_username: updated.telegram_bot_username || "",
      });

      // Update current user's dealership badge
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          dealership: updated,
        });
      }

      setSettingsStatus({
        type: "success",
        message: "ማስተካከያው በተሳካ ሁኔታ ተቀምጧል! (Settings updated successfully!)",
      });

      // Instant button feedback & floating toast
      setIsSavedSuccess(true);
      setShowSaveToast(true);
      setTimeout(() => setIsSavedSuccess(false), 3000);
      setTimeout(() => setShowSaveToast(false), 3500);
    } catch (err: any) {
      setSettingsStatus({
        type: "error",
        message: err.message || "Failed to save settings",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingLogo(true);
    setSettingsStatus(null);

    const token = getAuthToken();
    const data = new FormData();
    data.append("file", file);

    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/dealership/logo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: data,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to upload logo image");
      }

      const updated = await res.json();
      setDealershipSettings((prev) => ({
        ...prev,
        logo_url: updated.logo_url,
      }));
      setLogoImgError(false);

      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          dealership: updated,
        });
      }

      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 3000);
    } catch (err: any) {
      setSettingsStatus({
        type: "error",
        message: err.message || "Failed to upload logo image",
      });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramTestStatus(null);

    const token = getAuthToken();
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/dealership/test-telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          telegram_bot_token: dealershipSettings.telegram_bot_token,
          telegram_chat_id: dealershipSettings.telegram_chat_id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramTestStatus({
          success: true,
          message: data.message || "ቴሌግራም መልእክት በተሳካ ሁኔታ ደርሷል! (Test alert sent successfully!)",
        });
      } else {
        setTelegramTestStatus({
          success: false,
          message: data.detail || data.message || "ቴሌግራም መልእክት መላክ አልተሳካም። እባክዎ Bot Token እና Chat ID ያረጋግጡ።",
        });
      }
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: err.message || "Network error sending test alert",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const files = Array.from(e.target.files);
    const data = new FormData();
    files.forEach((file) => data.append("files", file));

    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/upload-images`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: data,
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) throw new Error("Upload failed");
      const urls: string[] = await res.json();
      const normalizedUrls = urls.map((u) => resolveImageUrl(u));
      setUploadedImages((prev) => [...prev, ...normalizedUrls]);
    } catch (err) {
      alert("Failed to upload image(s).");
    } finally {
      setUploading(false);
    }
  };

  const removeUploadedImage = (indexToRemove: number) => {
    setUploadedImages((prev) =>
      prev.filter((_, idx) => idx !== indexToRemove)
    );
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicleId(v.id);
    const existingImages = v.images?.map((img) => resolveImageUrl(img.image_url)) || [];
    setUploadedImages(existingImages);

    const standardBodies = ["Sedan", "SUV", "Hatchback", "Crossover", "Pickup"];
    const isCustom = !standardBodies.includes(v.body_type);

    const rawPlate = v.plate_status || "Code 2";
    const pType = getPlateType(rawPlate);
    const customNum = extractPlateNumber(rawPlate) || "";

    setFormData({
      make: v.make,
      model: v.model,
      year: v.year,
      price: v.price != null ? v.price.toString() : "",
      mileage: v.mileage != null ? v.mileage.toString() : "",
      condition: v.condition || "Slightly Used",
      fuel_type: v.fuel_type || "Gasoline",
      body_type: isCustom ? "Other" : v.body_type,
      custom_body_type: isCustom ? v.body_type : "",
      transmission: v.transmission || "Automatic",
      drive_train: v.drive_train || "FWD",
      engine_size: v.engine_size || "1.6L 4-Cylinder",
      exterior_color: v.exterior_color || "Silver",
      customs_cleared: v.customs_cleared ?? true,
      description: v.description || "",
      has_bank_loan: (v as any).has_bank_loan || false,
      cash_price: (v as any).cash_price != null ? (v as any).cash_price.toString() : "",
      bank_loan_amount: (v as any).bank_loan_amount != null ? (v as any).bank_loan_amount.toString() : "",
      bank_name: (v as any).bank_name || "",
      plate_status: pType === "new_series" ? "new_series" : rawPlate,
      custom_plate_number: customNum,
    });
    setShowAddModal(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadedImages.length === 0) {
      alert("Please upload at least one vehicle photo before saving.");
      return;
    }

    try {
      const finalBodyType =
        formData.body_type === "Other" && formData.custom_body_type.trim()
          ? formData.custom_body_type.trim()
          : formData.body_type;

      let finalPlateStatus = formData.plate_status;
      if (formData.plate_status === "new_series") {
        finalPlateStatus = formData.custom_plate_number.trim()
          ? `new_series: ${formData.custom_plate_number.trim()}`
          : "new_series";
      }

      const payload = {
        make: formData.make,
        model: formData.model,
        year: Number(formData.year),
        price: formData.price ? parseFloat(formData.price) : null,
        mileage: formData.mileage ? parseInt(formData.mileage) : 0,
        condition: formData.condition,
        fuel_type: formData.fuel_type,
        transmission: formData.transmission,
        body_type: finalBodyType,
        engine_size: formData.engine_size || null,
        drive_train: formData.drive_train || null,
        exterior_color: formData.exterior_color || null,
        customs_cleared: formData.customs_cleared,
        description: formData.description || null,
        status: "Available",
        image_urls: uploadedImages,
        has_bank_loan: formData.has_bank_loan,
        cash_price: formData.has_bank_loan && formData.cash_price ? parseFloat(formData.cash_price) : null,
        bank_loan_amount: formData.has_bank_loan && formData.bank_loan_amount ? parseFloat(formData.bank_loan_amount) : null,
        bank_name: formData.has_bank_loan ? formData.bank_name.trim() : null,
        plate_status: finalPlateStatus || "Code 2",
      };

      const baseApi = getApiBaseUrl();
      const url = editingVehicleId
        ? `${baseApi}/api/admin/vehicles/${editingVehicleId}`
        : `${baseApi}/api/admin/vehicles`;

      const method = editingVehicleId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to save vehicle");
      }

      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      alert(`Error saving listing: ${err.message || "Please check your inputs."}`);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(
        `${baseApi}/api/admin/vehicles/${id}/status?new_status=${newStatus}`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        }
      );
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      fetchData();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this vehicle?")) return;
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/vehicles/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      fetchData();
    } catch (err) {
      console.error("Failed to delete vehicle", err);
    }
  };

  // Initial session verification loader
  if (initialChecking) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-500 font-mono tracking-wider">
            Verifying dealer credentials...
          </p>
        </div>
      </div>
    );
  }

  // 1. Phone-Based OTP Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative z-10 space-y-5">
          {/* Top Icon Badge */}
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            {loginStep === "phone" ? (
              <Phone size={24} className="animate-pulse" />
            ) : (
              <ShieldCheck size={26} className="text-emerald-400" />
            )}
          </div>

          {/* Heading */}
          <div className="text-center">
            <h2 className="text-lg font-black text-white">Dealership Portal</h2>
            <p className="text-xs text-amber-500/90 font-medium">የሻጮች መግቢያ</p>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              {loginStep === "phone"
                ? "Enter your Ethiopian phone number to receive a 6-digit verification code"
                : "Enter the 6-digit code sent to your Telegram"}
            </p>
          </div>

          {/* Error Alert */}
          {authError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400 animate-in fade-in">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          {/* Success / Dev Note */}
          {authSuccessMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-emerald-400" />
              <span className="font-mono">{authSuccessMessage}</span>
            </div>
          )}

          {/* STEP 1: PHONE NUMBER INPUT */}
          {loginStep === "phone" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-zinc-400 text-xs font-medium">
                    Mobile Number / ስልክ ቁጥር
                  </label>
                  {phoneValidation.carrier && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-in fade-in">
                      🇪🇹 {phoneValidation.carrier}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-400 select-none border-r border-zinc-800 pr-2.5">
                    <span className="text-sm">🇪🇹</span>
                    <span className="text-zinc-400 text-[11px] font-mono">+251</span>
                  </div>
                  <input
                    type="tel"
                    required
                    autoFocus
                    maxLength={getPhoneMaxLength(phoneNumber)}
                    placeholder="0912 345 678"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    className={`w-full bg-zinc-900 border ${
                      phoneValidation.status === "error"
                        ? "border-red-500/80 focus:border-red-500"
                        : phoneValidation.status === "valid"
                        ? "border-emerald-500/80 focus:border-emerald-500"
                        : "border-zinc-800 focus:border-amber-500"
                    } rounded-2xl pl-24 pr-10 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none transition font-mono tracking-wide`}
                  />
                  {phoneValidation.status === "valid" && (
                    <div className="absolute right-3.5 text-emerald-400 pointer-events-none">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                  {phoneValidation.status === "error" && (
                    <div className="absolute right-3.5 text-red-400 pointer-events-none">
                      <AlertCircle size={16} />
                    </div>
                  )}
                </div>

                {/* Inline error or guidance message */}
                {phoneValidation.message ? (
                  <div
                    className={`text-[11px] mt-1.5 flex items-center gap-1.5 ${
                      phoneValidation.status === "error"
                        ? "text-red-400 font-medium"
                        : phoneValidation.status === "valid"
                        ? "text-emerald-400 font-medium"
                        : "text-amber-400/90 font-medium"
                    }`}
                  >
                    {phoneValidation.status === "error" ? (
                      <AlertCircle size={13} className="flex-shrink-0" />
                    ) : phoneValidation.status === "valid" ? (
                      <CheckCircle2 size={13} className="flex-shrink-0" />
                    ) : (
                      <AlertCircle size={13} className="flex-shrink-0" />
                    )}
                    <span>{phoneValidation.message}</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-500 mt-1.5">
                    Accepts 09... or 07... numbers (Ethio Telecom / Safaricom)
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={authLoading || !phoneValidation.isValid}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-2xl text-xs sm:text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {authLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <span>Send OTP / ኮድ ላክ</span>
                )}
              </button>

              {telegramLinkUrl && (
                <div className="pt-2 animate-in fade-in space-y-2">
                  <a
                    href={telegramLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-2xl text-xs sm:text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
                  >
                    <Send size={16} />
                    <span>በቴሌግራም ኮድ ተቀበል (Open Telegram to Receive Code)</span>
                    <ExternalLink size={14} />
                  </a>
                  <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                    ቴሌግራም ከከፈቱ በኋላ <strong>Start</strong> የሚለውን ይጫኑና እዚህ ተመልሰው &ldquo;ኮድ ላክ&rdquo; የሚለውን ይጫኑ።
                  </p>
                </div>
              )}
            </form>
          )}

          {/* STEP 2: 6-DIGIT OTP BOXES */}
          {loginStep === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-300 font-mono mb-2">
                  <span>📱 {phoneNumber}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep("phone");
                      setAuthError(null);
                    }}
                    className="text-amber-400 hover:text-amber-300 text-[10px] font-bold underline ml-1"
                  >
                    Edit
                  </button>
                </div>

                {/* UI hint for SMS delivery */}
                <p className="text-xs text-zinc-300 my-3 leading-relaxed">
                  ባስገቡት ስልክ ቁጥር የማረጋገጫ ኮድ በ SMS ተልኳል። (Enter the 6-digit verification code sent to your phone via SMS).
                </p>

                {/* If Telegram delivery actually succeeded */}
                {telegramSent && (
                  <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-2.5 mb-3 text-xs text-sky-300 flex items-center justify-center gap-2">
                    <Send size={14} className="text-sky-400 shrink-0" />
                    <span>ኮዱ ወደ ስልክዎ በ SMS (እንዲሁም ወደ ቴሌግራምዎ) ተልኳል</span>
                  </div>
                )}

                {/* Optional Telegram Deep-Link button if user wants to open Telegram */}
                {telegramBotLink && (
                  <a
                    href={telegramBotLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 mb-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Send size={13} className="text-sky-400" />
                    <span>ወይም በቴሌግራም ለመቀበል ይጫኑ</span>
                    <ExternalLink size={12} />
                  </a>
                )}

                {/* 6 Digit Boxes */}
                <div className="flex justify-center gap-1.5 sm:gap-2.5 py-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className="w-10 h-13 sm:w-12 sm:h-15 bg-zinc-900 border border-zinc-800 focus:border-amber-500 focus:bg-amber-500/5 rounded-xl text-center text-xl sm:text-2xl font-bold font-mono text-white focus:outline-none transition shadow-inner"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading || otpDigits.join("").length !== 6}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-2xl text-xs sm:text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {authLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify & Enter / አረጋግጥ</span>
                )}
              </button>

              {/* Resend button */}
              <div className="flex items-center justify-center text-xs pt-1">
                <button
                  type="button"
                  disabled={resendCooldown > 0 || authLoading}
                  onClick={() => handleSendOtp()}
                  className="text-zinc-400 hover:text-amber-400 disabled:opacity-40 disabled:hover:text-zinc-400 transition flex items-center gap-1"
                >
                  <RefreshCw size={12} className={authLoading ? "animate-spin" : ""} />
                  <span>
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend SMS / ኮድ በድጋሚ ላክ"}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Footer Back Link */}
          <div className="pt-2 text-center">
            <Link
              href={dealership?.slug ? `/${dealership.slug}` : "/"}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              <ArrowLeft size={13} /> Return to Showroom
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeDealerSlug =
    currentUser?.dealership?.slug ||
    dealership?.slug ||
    dealershipSettings.slug ||
    "elite-motors";

  const activeDealerName =
    currentUser?.dealership?.name ||
    dealership?.name ||
    dealershipSettings.name ||
    "Elite Motors";

  const siteOrigin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://car.wagadelivery.com";

  const showroomUrl = `${siteOrigin}/${activeDealerSlug}`;

  const handleCopyShowroomLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(showroomUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = showroomUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedShowroomLink(true);
      setTimeout(() => setCopiedShowroomLink(false), 2500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const telegramShareText = `🚗 የ${activeDealerName} ዲጂታል ሾውሩም! የመኪና ዝርዝሮችን፣ የባንክ ብድር ስሌት እና ቅድመ ክፍያ መረጃዎችን እዚህ ይመልከቱ።`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(
    showroomUrl
  )}&text=${encodeURIComponent(telegramShareText)}`;

  // 2. Main Dashboard (unlocked)
  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-6 pb-20 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4 mb-6">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link
              href={dealership?.slug ? `/${dealership.slug}` : "/"}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 text-zinc-300 shrink-0"
              title="Return to Showroom"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-bold truncate">
                {dealershipSettings.name || currentUser?.dealership?.name || "Dealership Hub"}
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-500 truncate">
                Inventory & Leads Desk
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto pb-1 sm:pb-0">
          {currentUser && (
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 font-mono text-[11px] shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>+{currentUser.phone_number}</span>
              <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded text-[10px]">
                {currentUser.role}
              </span>
            </div>
          )}

          {/* SUPERADMIN MASTER PORTAL LINK (HIDDEN FOR REGULAR DEALERS) */}
          {currentUser?.role === "superadmin" && (
            <Link
              href="/superadmin"
              className="px-2.5 sm:px-3.5 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:border-purple-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0"
              title="SuperAdmin Master Platform Control"
            >
              <ShieldCheck size={14} className="text-purple-400" />
              <span className="hidden md:inline">SuperAdmin Portal</span>
              <span className="md:hidden">SuperAdmin</span>
            </Link>
          )}

          {/* VIEW MY SHOWROOM BUTTON */}
          <a
            href={showroomUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shrink-0"
            title="Preview Public Digital Showroom in a new tab"
          >
            <ExternalLink size={14} />
            <span>Showroom</span>
          </a>

          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="flex-1 sm:flex-initial bg-amber-500 hover:bg-amber-400 text-black px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 shrink-0 whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Add Vehicle</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-xl transition shrink-0"
            title="Log out of Dealership"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* DEALER SHARE CENTER / "SHARE MY SHOWROOM" ACTION BAR */}
      <div className="mb-6 w-full max-w-full overflow-hidden bg-gradient-to-r from-zinc-900/95 via-zinc-900 to-zinc-950 border border-amber-500/30 rounded-2xl p-3.5 sm:p-5 shadow-xl shadow-black/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full max-w-full">
          {/* Left: Branding & Vanity URL Display */}
          <div className="space-y-1.5 flex-1 min-w-0 w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 truncate">
                የእርስዎ ዲጂታል ሾውሩም ሊንክ • Live Public Showroom Link
              </span>
            </div>

            <div className="flex items-center gap-2 bg-black/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-300 w-full max-w-full overflow-hidden">
              <Globe size={14} className="text-amber-400 shrink-0" />
              <span className="truncate select-all text-amber-200/90 font-semibold flex-1 min-w-0">{showroomUrl}</span>
              <a
                href={showroomUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-zinc-400 hover:text-white transition p-1 shrink-0"
                title="Open showroom in new tab"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* Right: 3 Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto shrink-0">
            {/* Button 1: Copy Link */}
            <button
              type="button"
              onClick={handleCopyShowroomLink}
              className={`w-full justify-center px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                copiedShowroomLink
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {copiedShowroomLink ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span>ተቀድቷል! (Copied)</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>ሊንክ ኮፒ አድርግ (Copy Link)</span>
                </>
              )}
            </button>

            {/* Button 2: Share on Telegram */}
            <a
              href={telegramShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full justify-center px-3.5 py-2.5 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#229ED9] border border-[#229ED9]/40 hover:border-[#229ED9] rounded-xl text-xs font-bold transition flex items-center gap-2"
            >
              <Send size={14} />
              <span>በቴሌግራም አጋራ (Telegram)</span>
            </a>

            {/* Button 3: Showroom QR Code */}
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="w-full justify-center px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-sm shadow-amber-500/20"
            >
              <QrCode size={14} />
              <span>የሾውሩም QR ኮድ (QR)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 w-full mb-6">
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold border transition text-center ${
            activeTab === "inventory"
              ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
          }`}
        >
          <Car size={14} className="shrink-0" />
          <span className="truncate">Inventory ({vehicles.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("appointments")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold border transition text-center ${
            activeTab === "appointments"
              ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
          }`}
        >
          <Calendar size={14} className="shrink-0" />
          <span className="truncate">Appointments ({appointments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold border transition text-center ${
            activeTab === "settings"
              ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
          }`}
        >
          <Settings size={14} className="shrink-0" />
          <span className="truncate">Settings (ማስተካከያ)</span>
        </button>
      </div>

      {/* INVENTORY TAB CONTENT */}
      {activeTab === "inventory" && (
        <div className="space-y-3">
          {vehicles.length === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-10">
              No vehicles in database. Click "Add Vehicle" to create one.
            </p>
          ) : (
            vehicles.map((v) => (
              <div
                key={v.id}
                className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-xl bg-zinc-950 overflow-hidden flex-shrink-0">
                    <img
                      src={
                        resolveImageUrl(
                          v.images?.[0]?.image_url,
                          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=300&q=80"
                        )
                      }
                      alt={v.model}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-500 uppercase">
                      {v.make}
                    </span>
                    <h3 className="font-bold text-sm text-white">
                      {v.year} {v.model}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {v.price != null ? `${v.price.toLocaleString()} ETB` : "Call for Price"} •{" "}
                      {(v.mileage ?? 0).toLocaleString()} km •{" "}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${getPlateBadgeClasses(v.plate_status)}`}>
                        🏷️ {getPlateLabel(v.plate_status, false)}
                      </span>
                    </p>
                    {(v as any).has_bank_loan && (
                      <span className="inline-block mt-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                        🏦 Loan: {(v as any).cash_price?.toLocaleString()} ETB Cash + {(v as any).bank_loan_amount?.toLocaleString()} ETB Bank
                      </span>
                    )}
                  </div>
                </div>

                {/* Status and Action Buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <select
                    value={v.status}
                    onChange={(e) => handleStatusChange(v.id, e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs py-1.5 px-3 rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                    <option value="In Transit">In Transit</option>
                  </select>

                  <button
                    onClick={() => setPrintingVehicle(v)}
                    className="p-2 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
                    title="Print Window Spec Sheet (A4)"
                  >
                    <Printer size={16} className="text-amber-400" />
                    <span className="hidden sm:inline">Flyer</span>
                  </button>

                  <button
                    onClick={() => openEditModal(v)}
                    className="p-2 text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg transition"
                    title="Edit Vehicle Details & Photos"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(v.id)}
                    className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg transition"
                    title="Delete Vehicle"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* APPOINTMENTS TAB CONTENT */}
      {activeTab === "appointments" && (
        <div className="space-y-3">
          {appointments.length === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-10">
              No customer bookings received yet.
            </p>
          ) : (
            appointments.map((a) => {
              const matchedCar = vehicles.find((v) => v.id === a.vehicle_id);
              const vehicleDisplay =
                (a as any).vehicle_title ||
                (matchedCar
                  ? `${matchedCar.year} ${matchedCar.make} ${matchedCar.model}`
                  : a.vehicle_id
                  ? `Vehicle #${a.vehicle_id}`
                  : "General Showroom Inquiry");

              return (
                <div
                  key={a.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white">
                          {a.customer_name}
                        </h3>
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          #{a.id}
                        </span>
                      </div>
                      <p className="text-xs text-amber-400 font-medium flex items-center gap-2">
                        <span>📞 {a.phone_number}</span>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-300 font-normal">
                          {a.preferred_channel}
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-black/40 border border-zinc-800/80 px-2 py-1 rounded-lg w-fit mt-1">
                        <Car size={13} className="text-amber-400 shrink-0" />
                        <span>{vehicleDisplay}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold bg-zinc-800 border border-zinc-700/60 px-2.5 py-1 rounded-lg text-zinc-300 shrink-0 self-start">
                      {a.appointment_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-amber-400" /> {a.date}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-400" /> {a.time_slot}
                    </span>
                  </div>
                  {a.notes && (
                    <p className="text-xs text-zinc-400 italic bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/40">
                      "{a.notes}"
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SETTINGS TAB CONTENT */}
      {activeTab === "settings" && (
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 max-w-2xl">
          <div className="flex items-center justify-between pb-5 border-b border-zinc-800 mb-6">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Settings size={20} className="text-amber-400" />
                <span>Dealership Settings (የድርጅት ማስተካከያ)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Customize your public showroom branding and configure Telegram notification routing.
              </p>
            </div>
            {dealershipSettings.logo_url && !logoImgError ? (
              <img
                src={resolveImageUrl(dealershipSettings.logo_url)}
                alt="Logo preview"
                onError={() => setLogoImgError(true)}
                className="w-12 h-12 rounded-xl object-cover border border-amber-500/30 bg-zinc-950 shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                <CarFront size={22} />
              </div>
            )}
          </div>

          {/* LIVE PUBLIC DIGITAL SHOWROOM LINK CARD */}
          <div className="bg-gradient-to-r from-amber-500/15 via-zinc-950 to-zinc-950 border border-amber-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <ExternalLink size={14} /> Live Public Digital Showroom Link
              </span>
              <p className="text-[11px] text-zinc-400 font-mono break-all">
                {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}
                /?dealer={currentUser?.dealership?.slug || "elite-motors"}
              </p>
            </div>
            <a
              href={`/?dealer=${currentUser?.dealership?.slug || "elite-motors"}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 whitespace-nowrap self-end sm:self-center"
            >
              <span>View My Showroom / የእኔን ሾውሩም እይ</span>
              <ExternalLink size={13} />
            </a>
          </div>

          {settingsStatus && (
            <div
              className={`p-3.5 rounded-xl text-xs mb-5 flex items-center gap-2 ${
                settingsStatus.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}
            >
              {settingsStatus.type === "success" ? (
                <CheckCircle2 size={16} className="flex-shrink-0" />
              ) : (
                <AlertCircle size={16} className="flex-shrink-0" />
              )}
              <span>{settingsStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Dealership Display Name (የድርጅቱ ስም) *
              </label>
              <input
                type="text"
                required
                value={dealershipSettings.name}
                onChange={(e) =>
                  setDealershipSettings({ ...dealershipSettings, name: e.target.value })
                }
                placeholder="e.g. Elite Motors Addis"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Contact Phone Number (የስልክ ቁጥር)
              </label>
              <input
                type="text"
                value={dealershipSettings.phone_number}
                onChange={(e) =>
                  setDealershipSettings({
                    ...dealershipSettings,
                    phone_number: e.target.value,
                  })
                }
                placeholder="e.g. +251 905 445 544"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Shown to customers as the main contact number on your digital showroom.
              </span>
            </div>

            {/* Showroom Logo File Picker */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Showroom Logo (የድርጅቱ ሎጎ)
              </label>

              <input
                type="file"
                ref={logoInputRef}
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />

              <div className="flex items-center gap-4 bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                <div className="flex-shrink-0">
                  {dealershipSettings.logo_url && !logoImgError ? (
                    <div className="relative group">
                      <img
                        src={resolveImageUrl(dealershipSettings.logo_url)}
                        alt="Logo"
                        onError={() => setLogoImgError(true)}
                        className="w-16 h-16 rounded-2xl object-cover border border-amber-500/30 shadow-md bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setDealershipSettings({ ...dealershipSettings, logo_url: "" });
                          setLogoImgError(false);
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-400 text-white rounded-full p-1 shadow transition"
                        title="Remove Logo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                      <CarFront size={30} />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {uploadingLogo ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <UploadCloud size={13} />
                      )}
                      <span>
                        {uploadingLogo
                          ? "Uploading..."
                          : dealershipSettings.logo_url
                          ? "Change Logo (ቀይር)"
                          : "Upload Logo (ፎቶ ምረጥ)"}
                      </span>
                    </button>
                    {dealershipSettings.logo_url && (
                      <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                        ✓ Logo active
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500 block">
                    Upload from photo gallery or camera. Rendered on public showroom header & lot flyers.
                  </span>
                </div>
              </div>
            </div>

            {/* 1-Click Telegram Notification Status Card */}
            {(() => {
              const platformBotUsername = (
                dealershipSettings.telegram_bot_username ||
                currentUser?.dealership?.telegram_bot_username ||
                process.env.NEXT_PUBLIC_TELEGRAM_PLATFORM_BOT_USERNAME ||
                "WagaDealershipBot"
              ).replace(/^@/, "");

              const dealerIdForConnect =
                dealershipSettings.id ||
                currentUser?.dealership?.id ||
                currentUser?.dealership_id ||
                dealershipSettings.slug ||
                "1";

              const telegramConnectUrl = `https://t.me/${platformBotUsername}?start=connect_${dealerIdForConnect}`;
              const isConnected = Boolean(dealershipSettings.telegram_chat_id && dealershipSettings.telegram_chat_id.trim());

              return (
                <div className="pt-4 border-t border-zinc-800 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Send size={14} /> የቴሌግራም ማሳወቂያ ሁኔታ (Telegram Notification Status)
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      የደንበኞች አዲስ ቀጠሮ እና ጥያቄዎች ወዲያውኑ ወደ ቴሌግራምዎ እንዲደርሱ ያገናኙ። (Receive instant booking leads directly in Telegram).
                    </p>
                  </div>

                  {isConnected ? (
                    <div className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg shadow-emerald-500/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                            <CheckCircle2 size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">✓ ቴሌግራም ተገናኝቷል (Telegram Connected)</span>
                              <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold">
                                Active
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400 block mt-0.5 font-mono">
                              Chat ID: {dealershipSettings.telegram_chat_id}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          <button
                            type="button"
                            onClick={handleTestTelegram}
                            disabled={testingTelegram}
                            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {testingTelegram ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            <span>{testingTelegram ? "በመላክ ላይ..." : "የማሳወቂያ ሙከራ (Test Alert)"}</span>
                          </button>

                          <a
                            href={telegramConnectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl text-xs font-medium transition"
                          >
                            እንደገና አገናኝ (Reconnect)
                          </a>
                        </div>
                      </div>

                      {telegramTestStatus && (
                        <div
                          className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                            telegramTestStatus.success
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                              : "bg-red-500/10 border border-red-500/20 text-red-400"
                          }`}
                        >
                          {telegramTestStatus.success ? (
                            <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                          )}
                          <span className="break-all">{telegramTestStatus.message}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-white block">
                            ቴሌግራም ገና አልተገናኘም (Telegram Not Connected)
                          </span>
                          <p className="text-[11px] text-zinc-400">
                            የደንበኞች አዲስ ቀጠሮ ወይም ጥያቄ ሲመጣ ወዲያውኑ በቴሌግራምዎ ማሳወቂያ ለማግኘት ከታች ያለውን ቁልፍ ይጫኑ።
                          </p>
                          <p className="text-[11px] text-amber-400 font-medium">
                            💡 ይህንን ሲጫኑ ቴሌግራም ይከፈታል፤ በመቀጠል &quot;START&quot; የሚለውን ብቻ ይጫኑ።
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <a
                            href={telegramConnectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 text-center"
                          >
                            <Send size={14} />
                            <span>📲 ቴሌግራምን በአንድ ጠቅታ ያገናኙ (Connect Telegram)</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => fetchData()}
                            className="px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                            title="Check if Telegram was connected"
                          >
                            <RefreshCw size={12} />
                            <span>ሁኔታውን አድስ (Refresh)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                type="submit"
                disabled={savingSettings || !dealershipSettings.name.trim()}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition disabled:opacity-50 ${
                  isSavedSuccess
                    ? "bg-emerald-500 text-black shadow-emerald-500/20"
                    : "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                }`}
              >
                {savingSettings ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isSavedSuccess ? (
                  <Check size={14} className="stroke-[3]" />
                ) : (
                  <Save size={14} />
                )}
                <span>
                  {savingSettings
                    ? "Saving..."
                    : isSavedSuccess
                    ? "✓ የተቀመጠ (Saved Successfully!)"
                    : "Save Settings (አስቀምጥ)"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD / EDIT VEHICLE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white">
                {editingVehicleId
                  ? "Edit Vehicle Listing"
                  : "Add New Vehicle to Inventory"}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSaveVehicle}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.target as HTMLElement).tagName !== "TEXTAREA"
                ) {
                  e.preventDefault();
                }
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Make *</label>
                  <input
                    required
                    placeholder="e.g. Toyota"
                    value={formData.make}
                    onChange={(e) =>
                      setFormData({ ...formData, make: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Model *</label>
                  <input
                    required
                    placeholder="e.g. RAV4 Adventure"
                    value={formData.model}
                    onChange={(e) =>
                      setFormData({ ...formData, model: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Year *</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        year: Number(e.target.value),
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">
                    Price (ETB) <span className="text-zinc-500">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="Leave blank for Inquire"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">
                    Mileage (km) <span className="text-zinc-500">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.mileage}
                    onChange={(e) =>
                      setFormData({ ...formData, mileage: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* BANK LOAN / TRANSFER TOGGLE */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.has_bank_loan}
                    onChange={(e) =>
                      setFormData({ ...formData, has_bank_loan: e.target.checked })
                    }
                    className="w-4 h-4 rounded accent-amber-500 bg-zinc-900 border-zinc-700 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-zinc-200">
                    የባንክ ዕዳ አለበት / Bank Loan Transfer Deal
                  </span>
                </label>

                {formData.has_bank_loan && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/80 animate-in fade-in">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">
                        በእጅ የሚከፈል (Cash Upfront)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 1500000"
                        value={formData.cash_price}
                        onChange={(e) =>
                          setFormData({ ...formData, cash_price: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">
                        የባንክ ዕዳ (Remaining Loan)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 1000000"
                        value={formData.bank_loan_amount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            bank_loan_amount: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">
                        ባንክ (Bank Name)
                      </label>
                      <input
                        placeholder="e.g. Awash / CBE"
                        value={formData.bank_name}
                        onChange={(e) =>
                          setFormData({ ...formData, bank_name: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Body Type Selection with Custom Input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Body Type</label>
                  <select
                    value={formData.body_type}
                    onChange={(e) =>
                      setFormData({ ...formData, body_type: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Hatchback">Hatchback</option>
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Crossover">Crossover</option>
                    <option value="Pickup">Pickup</option>
                    <option value="Other">Other (Custom)</option>
                  </select>
                </div>
                {formData.body_type === "Other" && (
                  <div>
                    <label className="text-zinc-400 block mb-1">
                      Custom Body Name
                    </label>
                    <input
                      required
                      placeholder="e.g. Minivan / Coupe"
                      value={formData.custom_body_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          custom_body_type: e.target.value,
                        })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="text-zinc-400 block mb-1">Fuel Type</label>
                  <select
                    value={formData.fuel_type}
                    onChange={(e) =>
                      setFormData({ ...formData, fuel_type: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Gasoline">Gasoline</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Diesel">Diesel</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) =>
                      setFormData({ ...formData, condition: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Brand New">Brand New</option>
                    <option value="Slightly Used">Slightly Used</option>
                    <option value="Excellent Condition">
                      Excellent Condition
                    </option>
                    <option value="Good Condition">Good Condition</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">
                    Transmission
                  </label>
                  <select
                    value={formData.transmission}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        transmission: e.target.value,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">
                    Plate Status (የሰሌዳ ሁኔታ)
                  </label>
                  <select
                    value={formData.plate_status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        plate_status: e.target.value,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Unregistered">Unregistered (ያልተለጠፈ)</option>
                    <option value="new_series">አዲስ ሰሌዳ (AAA / AAB Series) - New Digital Plate</option>
                    <option value="Code 2">Code 2 (ኮድ 2)</option>
                    <option value="Code 3">Code 3 (ኮድ 3)</option>
                  </select>
                </div>
              </div>

              {/* Optional Series Code / Plate Number input when new_series is selected */}
              {formData.plate_status === "new_series" && (
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 animate-in fade-in">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-emerald-400 text-xs font-bold">
                      Digital Plate / Series Number (Optional - ለምሳሌ: AAA 12345)
                    </label>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      AAA / AAB Series
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. AAA 12345 or AAB 78901"
                    value={formData.custom_plate_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        custom_plate_number: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full bg-zinc-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-400 text-sm uppercase tracking-wider"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1.5">
                    Enter the assigned plate number or leave blank to display the general &quot;አዲስ ሰሌዳ • AAA Series&quot; badge.
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-zinc-400 block mb-1">
                  Full Vehicle Description & Options
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste complete specs, feature list, plate status, negotiable details..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              {/* Multi-Photo Uploader Section */}
              <div
                className={`border ${
                  uploadedImages.length === 0
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-zinc-800 bg-zinc-950/60"
                } rounded-xl p-3 space-y-2 transition`}
              >
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                    <ImageIcon size={14} className="text-amber-400" /> Vehicle
                    Gallery Photos
                    <span className="text-red-400 font-bold">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      uploadedImages.length === 0
                        ? "text-amber-400 font-bold"
                        : "text-emerald-400"
                    }`}
                  >
                    {uploadedImages.length === 0
                      ? "Required (Min 1)"
                      : `${uploadedImages.length} uploaded`}
                  </span>
                </div>

                <label className="border-2 border-dashed border-zinc-800 hover:border-amber-500/60 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition bg-zinc-950">
                  <UploadCloud size={20} className="text-zinc-400 mb-1" />
                  <span className="text-[11px] text-zinc-300 font-medium">
                    {uploading ? "Uploading images..." : "Click to Upload Photos"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>

                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {uploadedImages.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative group h-14 rounded-lg overflow-hidden border border-zinc-800"
                      >
                        <img
                          src={resolveImageUrl(url)}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeUploadedImage(idx)}
                          className="absolute top-1 right-1 bg-red-600/90 text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={uploadedImages.length === 0 || uploading}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/20"
              >
                {editingVehicleId ? "Update Vehicle" : "Create Listing"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PRINT LOT WINDOW FLYER MODAL */}
      {printingVehicle && (
        <PrintFlyerModal
          vehicle={printingVehicle}
          onClose={() => setPrintingVehicle(null)}
        />
      )}

      {/* SHOWROOM QR CODE MODAL */}
      <ShowroomQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        dealershipName={activeDealerName}
        dealershipSlug={activeDealerSlug}
        logoUrl={currentUser?.dealership?.logo_url || dealershipSettings.logo_url}
        showroomUrl={showroomUrl}
      />

      {/* FLOATING CONFIRMATION TOAST */}
      {(toastMessage || showSaveToast) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/95 border border-emerald-500/40 text-emerald-200 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-white block">ተሳክቷል (Success)</span>
            <span>{toastMessage || "Dealership settings saved successfully."}</span>
          </div>
          <button
            onClick={() => {
              setToastMessage(null);
              setShowSaveToast(false);
            }}
            className="text-emerald-400/70 hover:text-white p-1 rounded-lg transition ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
