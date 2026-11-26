"use client";
import React, { useEffect, useState, useRef } from "react";
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
  Key,
  Truck,
  UserCheck,
  FileText,
  Sparkles,
  DoorOpen,
} from "lucide-react";
import { Vehicle, Appointment, User, AssignedPerson, RentalBooking, StaffPermission, STAFF_PERMISSIONS } from "@/types";
import PrintFlyerModal from "@/components/admin/PrintFlyerModal";
import ShowroomQrModal from "@/components/admin/ShowroomQrModal";
import VehicleDocumentsSheet from "@/components/documents/VehicleDocumentsSheet";
import GateDesk from "@/components/admin/GateDesk";
import TelegramStatusCard from "@/components/admin/TelegramStatusCard";
import AppointmentsPanel, { activeAppointmentCount } from "@/components/admin/AppointmentsPanel";
import { isSuperadminUser } from "@/lib/documents";
import { getApiBaseUrl } from "@/lib/api";
import { resolveImageUrl } from "@/lib/images";
import { compressImage } from "@/lib/compressImage";
import { formatMileage, parseMileageInput } from "@/lib/mileage";
import { runPool, uploadWithRetry, UploadError } from "@/lib/uploadPhotos";
import { getShowroomUrl, PRIMARY_DEALER_NAME, PRIMARY_DEALER_SLUG } from "@/lib/site";
import { dealerPhoneLines } from "@/lib/contact";
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

/** Owner-only desks: rendered inside /superadmin, never in the staff /admin portal. */
export type OwnerSection = "settings";

interface AdminDashboardProps {
  /**
   * "staff" (/admin): inventory, appointments, rentals, gate. (Drivers are Team members: /superadmin -> Team.)
   * "owner" (embedded in /superadmin): settings. (Documents live in the Document Center.) The backend
   * enforces the same split (403 for non-superadmins), this only decides what is shown.
   */
  portal?: "staff" | "owner";
  /** Which owner desk to show when portal === "owner". */
  ownerSection?: OwnerSection;
}

export default function AdminDashboard({ portal = "staff", ownerSection = "settings" }: AdminDashboardProps) {
  const router = useRouter();
  const isOwnerPortal = portal === "owner";
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
  const [staffTab, setActiveTab] = useState<
    "inventory" | "appointments" | "rentals" | "gate" | "settings"
  >("inventory");

  // Staff tabs follow the permissions the owner ticked in /superadmin -> Staff (the backend
  // enforces the same rules with 403). Owners have every permission.
  const userPerms: StaffPermission[] = isSuperadminUser(currentUser)
    ? [...STAFF_PERMISSIONS]
    : currentUser?.permissions ?? [];
  const can = (perm: StaffPermission) => userPerms.includes(perm);
  const STAFF_TAB_PERMISSION = {
    inventory: "vehicles",
    appointments: "appointments",
    rentals: "rentals",
    gate: "gate",
  } as const;
  const allowedStaffTabs = (Object.keys(STAFF_TAB_PERMISSION) as (keyof typeof STAFF_TAB_PERMISSION)[]).filter(
    (tab) => can(STAFF_TAB_PERMISSION[tab])
  );
  const firstAllowedTab = allowedStaffTabs[0] ?? "inventory";
  // Owner portal: the /superadmin navigation picks the desk. Staff: fall back to a permitted tab.
  const activeTab = isOwnerPortal
    ? ownerSection
    : (allowedStaffTabs as string[]).includes(staffTab)
    ? staffTab
    : firstAllowedTab;

  // Phones: keep the selected tab fully visible in the horizontally scrolling tab row.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-admin-tab="${activeTab}"]`);
    const row = el?.parentElement;
    if (!el || !row || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [activeTab]);

  // Owner: the documents sheet of one inventory car (opens the Document Center).
  const [docsVehicle, setDocsVehicle] = useState<Vehicle | null>(null);

  // Car Rental & Driver Dispatch States
  const [rentals, setRentals] = useState<RentalBooking[]>([]);
  // Team members with the Driver role (rental assignment).
  const [drivers, setDrivers] = useState<AssignedPerson[]>([]);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [rentalStatusFilter, setRentalStatusFilter] = useState("all");
  const [assigningBooking, setAssigningBooking] = useState<RentalBooking | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | "">("");
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Dealership Settings State
  const [dealershipSettings, setDealershipSettings] = useState({
    id: 0,
    name: "",
    slug: "",
    phone_number: "",
    phone_number_2: "",
    email: "",
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
  const [disconnectingTelegram, setDisconnectingTelegram] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
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
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [failedUploads, setFailedUploads] = useState<{ file: File; reason: string }[]>([]);
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
    listing_type: "sale" as "sale" | "rent" | "both",
    rental_daily_rate: "",
    rental_available: true,
    with_driver_only: false,
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
      listing_type: "sale",
      rental_daily_rate: "",
      rental_available: true,
      with_driver_only: false,
    });
    setUploadedImages([]);
    setFailedUploads([]);
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
          // Show the server's reason (deactivated, or a Telegram-only Driver/Gatekeeper account).
          const body = await res.json().catch(() => ({}));
          handleUnauthorized(typeof body?.detail === "string" ? body.detail : undefined);
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
            phone_number_2: dealerData.phone_number_2 || "",
            email: dealerData.email || "",
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

      // Fresh profile first: permissions may have changed since login, and a deactivated
      // account must go back to the login screen with the server's message.
      const meRes = await fetch(`${baseApi}/api/admin/me`, { headers });
      if (meRes.status === 401) {
        const body = await meRes.json().catch(() => ({}));
        handleUnauthorized(body?.detail);
        return;
      }
      const me: User | null = meRes.ok ? await meRes.json() : null;
      if (me) setCurrentUser((prev) => (prev ? { ...prev, ...me, dealership: prev.dealership || me.dealership } : me));
      const perms: string[] = me?.is_superadmin ? [...STAFF_PERMISSIONS] : me?.permissions ?? [];

      if (perms.includes("vehicles")) {
        const vRes = await fetch(`${baseApi}/api/admin/vehicles${dealerQuery}`, {
          headers,
        });
        if (vRes.status === 401) {
          handleUnauthorized();
          return;
        }
        const vData = await vRes.json();
        setVehicles(Array.isArray(vData) ? vData : []);
      }

      if (perms.includes("appointments")) {
        const aRes = await fetch(`${baseApi}/api/admin/appointments${dealerQuery}`, {
          headers,
        });
        if (aRes.status === 401) {
          handleUnauthorized();
          return;
        }
        const aData = await aRes.json();
        setAppointments(Array.isArray(aData) ? aData : []);
      }

      if (perms.includes("rentals")) {
      // Fetch Rentals
      try {
        const rRes = await fetch(`${baseApi}/api/admin/rentals`, { headers });
        if (rRes.ok) {
          const rData = await rRes.json();
          setRentals(Array.isArray(rData) ? rData : []);
        }
      } catch (rErr) {
        console.error("Failed to fetch rentals", rErr);
      }

      // Team members with the Driver role
      try {
        const drRes = await fetch(`${baseApi}/api/admin/team/drivers`, { headers });
        if (drRes.ok) {
          const drData = await drRes.json();
          setDrivers(Array.isArray(drData) ? drData : []);
        }
      } catch (drErr) {
        console.error("Failed to fetch drivers", drErr);
      }
      }

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
          phone_number_2: dData.phone_number_2 || "",
          email: dData.email || "",
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

  const handleAssignDriver = async (bookingId: number, driverId: number) => {
    setAssigningLoading(true);
    const token = getAuthToken();
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/rentals/${bookingId}/assign-driver`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: driverId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to assign driver");
      }

      const updatedBooking: RentalBooking = await res.json();
      setRentals((prev) =>
        prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b))
      );
      setAssigningBooking(null);
      setSelectedDriverId("");
      showToast("አሽከርካሪው ተመድቧል! (Driver assigned & SMS dispatch alert sent)");
    } catch (err: any) {
      alert(err.message || "Failed to assign driver");
    } finally {
      setAssigningLoading(false);
    }
  };

  const handleUpdateRentalStatus = async (bookingId: number, newStatus: string) => {
    const token = getAuthToken();
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/rentals/${bookingId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update status");
      }

      const updatedBooking: RentalBooking = await res.json();
      setRentals((prev) =>
        prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b))
      );
      showToast(`ሁኔታው ወደ "${newStatus}" ተቀይሯል!`);
    } catch (err: any) {
      alert(err.message || "Failed to update status");
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
        phone_number_2: updated.phone_number_2 || "",
        email: updated.email || "",
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

    try {
      const data = new FormData();
      data.append("file", await compressImage(file, 800));
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/dealership/logo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: data,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to upload logo image (HTTP ${res.status})`);
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

  const handleDisconnectTelegram = async () => {
    if (
      !window.confirm(
        "እርግጠኛ ነዎት የቴሌግራም ቦት ግንኙነትን ማቋረጥ እና መረጃዎችን ማስወገድ ይፈልጋሉ? (Are you sure you want to disconnect Telegram?)"
      )
    ) {
      return;
    }
    setDisconnectingTelegram(true);
    setTelegramTestStatus(null);
    const token = getAuthToken();
    try {
      const baseApi = getApiBaseUrl();
      const res = await fetch(`${baseApi}/api/admin/dealership/disconnect-telegram`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "ቴሌግራምን ማቋረጥ አልተቻለም።");
      }
      const updated = await res.json();
      setDealershipSettings((prev) => ({
        ...prev,
        telegram_bot_token: "",
        telegram_chat_id: "",
        telegram_bot_username: "",
      }));
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          dealership: updated,
        });
      }
      showToast("የቴሌግራም ቦት መረጃዎች በተሳካ ሁኔታ ተወግደዋል! (Telegram disconnected)");
    } catch (err: any) {
      alert(err.message || "Failed to disconnect Telegram");
    } finally {
      setDisconnectingTelegram(false);
    }
  };

  // Uploads photos one per request (small bodies for shared hosting), two at a time,
  // in selection order. Each photo is retried on transient errors; photos that still
  // fail go to `failedUploads` so they can be retried with one tap.
  const uploadPhotoBatch = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadNote("");
    setUploadProgress({ done: 0, total: files.length });

    const endpoint = `${getApiBaseUrl()}/api/admin/upload-images`;
    const batchUrls: (string[] | null)[] = files.map(() => null);
    const failed: { index: number; file: File; reason: string }[] = [];
    let unauthorized = false;

    // Show each thumbnail as soon as it succeeds, but keep selection order even
    // though two uploads run at once (and even if the user removed a photo meanwhile).
    const insertInOrder = (i: number, urls: string[]) =>
      setUploadedImages((prev) => {
        for (let j = i - 1; j >= 0; j--) {
          const prevUrls = batchUrls[j];
          const pos = prevUrls ? prev.lastIndexOf(prevUrls[prevUrls.length - 1]) : -1;
          if (pos >= 0) return [...prev.slice(0, pos + 1), ...urls, ...prev.slice(pos + 1)];
        }
        for (let j = i + 1; j < batchUrls.length; j++) {
          const nextUrls = batchUrls[j];
          const pos = nextUrls ? prev.indexOf(nextUrls[0]) : -1;
          if (pos >= 0) return [...prev.slice(0, pos), ...urls, ...prev.slice(pos)];
        }
        return [...prev, ...urls];
      });

    try {
      await runPool(files, 2, async (original, i) => {
        if (unauthorized) return;
        let file = original;
        try {
          file = await compressImage(original, 1600, 0.85);
          const urls = await uploadWithRetry(endpoint, file, getAuthHeaders, {
            onRetry: (attempt, err) =>
              setUploadNote(`Retrying ${original.name} (${attempt}/3) after ${err.message}…`),
          });
          const normalized = urls.map((u) => resolveImageUrl(u));
          batchUrls[i] = normalized;
          insertInOrder(i, normalized);
        } catch (err) {
          if (err instanceof UploadError && err.status === 401) {
            unauthorized = true;
            return;
          }
          failed.push({ index: i, file, reason: err instanceof Error ? err.message : "upload failed" });
        } finally {
          setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      });

      if (unauthorized) {
        handleUnauthorized();
        return;
      }
      failed.sort((a, b) => a.index - b.index);
      setFailedUploads((prev) => [...prev, ...failed.map(({ file, reason }) => ({ file, reason }))]);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadNote("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const input = e.target;
    const files = Array.from(input.files!);
    input.value = "";
    await uploadPhotoBatch(files);
  };

  const retryFailedUploads = async () => {
    const toRetry = failedUploads.map((f) => f.file);
    setFailedUploads([]);
    await uploadPhotoBatch(toRetry);
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
    setFailedUploads([]);

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
      listing_type: (v.listing_type as any) || "sale",
      rental_daily_rate: v.rental_daily_rate != null ? v.rental_daily_rate.toString() : "",
      rental_available: v.rental_available ?? true,
      with_driver_only: v.with_driver_only ?? false,
    });
    setShowAddModal(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadedImages.length === 0) {
      alert("Please upload at least one vehicle photo before saving.");
      return;
    }

    if (formData.listing_type === "rent" || formData.listing_type === "both") {
      const dailyRateVal = parseFloat(formData.rental_daily_rate);
      if (!formData.rental_daily_rate || isNaN(dailyRateVal) || dailyRateVal <= 0) {
        alert("እባክዎ የቀን የኪራይ ዋጋ ያስገቡ (Daily rental rate is required for rentals)");
        return;
      }
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
        mileage: parseMileageInput(formData.mileage),
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
        listing_type: formData.listing_type || "sale",
        rental_daily_rate: formData.rental_daily_rate ? parseFloat(formData.rental_daily_rate) : null,
        rental_available: formData.rental_available,
        with_driver_only: formData.with_driver_only,
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
    if (!confirm("Are you sure you want to delete this vehicle? / መኪናውን መሰረዝ ይፈልጋሉ?")) return;
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(`መኪናውን መሰረዝ አልተቻለም: ${errData.detail || "Error deleting vehicle"}`);
        return;
      }
      // Immediately filter out the deleted item from state
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      showToast("መኪናው በተሳካ ሁኔታ ተሰርዟል! (Vehicle deleted successfully)");
      fetchData();
    } catch (err) {
      console.error("Failed to delete vehicle", err);
      showToast("ስህተት: መኪናውን መሰረዝ አልተቻለም (Network error deleting vehicle)");
    }
  };

  // Owner portal is embedded in /superadmin, which already verified the session.
  if (isOwnerPortal && (initialChecking || !isAuthenticated)) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-zinc-500">
          {initialChecking ? "Loading…" : (
            <>Session expired. <Link href="/admin" className="text-amber-400 underline">Log in again</Link></>
          )}
        </p>
      </div>
    );
  }

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
    PRIMARY_DEALER_SLUG;

  const activeDealerName =
    currentUser?.dealership?.name ||
    dealership?.name ||
    dealershipSettings.name ||
    PRIMARY_DEALER_NAME;

  // Single-tenant mode: the homepage IS the showroom, so link/copy/QR all use the site root.
  const showroomUrl = getShowroomUrl();

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

  // Staff account with no permissions ticked yet.
  // Gatekeeper with no other section: a plain Gate screen, nothing else.
  if (!isOwnerPortal && allowedStaffTabs.length === 1 && allowedStaffTabs[0] === "gate") {
    return (
      <div className="min-h-screen bg-black text-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black truncate">{currentUser?.full_name || "Gate"}</p>
              <p className="text-[11px] text-zinc-500 font-mono">+{currentUser?.phone_number}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="h-11 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
          <GateDesk onUnauthorized={handleUnauthorized} />
        </div>
      </div>
    );
  }

  if (!isOwnerPortal && allowedStaffTabs.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck size={26} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-black">እስካሁን ፈቃድ አልተሰጠዎትም</h1>
            <p className="text-sm font-bold text-zinc-200">No access yet</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your account is active, but the owner hasn&apos;t given you any sections yet. Ask the owner to tick
              Vehicles, Appointments or Rentals for you, then tap Refresh.
              <br />
              ባለቤቱ ክፍሎችን እንዲፈቅድልዎ ይጠይቁ።
            </p>
            {currentUser?.phone_number && (
              <p className="text-[11px] text-zinc-500 font-mono pt-1">+{currentUser.phone_number}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fetchData()}
              className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Dashboard (unlocked)
  return (
    <div
      className={
        isOwnerPortal
          ? "text-white"
          : "min-h-screen bg-black text-white px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-6 pb-20 max-w-5xl mx-auto"
      }
    >
      {!isOwnerPortal && (
      <>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4 mb-4 sm:mb-6">
        <div className="flex items-center justify-between w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="h-11 w-11 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 text-zinc-300 shrink-0"
              title="Return to Showroom"
              aria-label="Return to Showroom"
            >
              <ArrowLeft size={18} />
            </Link>
            <img
              src="/ac-wale-logo.png"
              alt="AC WALE"
              className="h-10 w-10 rounded-lg object-contain bg-black border border-zinc-800 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">
                AC WALE MARKET
              </h1>
              <p className="text-[11px] sm:text-xs text-amber-500/90 font-medium truncate">
                ኤሲ ዋለ የመኪና መሸጫ • Inventory & Leads Desk
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
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
          {isSuperadminUser(currentUser) && (
            <Link
              href="/superadmin"
              className="h-11 min-w-11 justify-center px-2.5 sm:px-3.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:border-purple-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0"
              title="SuperAdmin Master Platform Control"
              aria-label="SuperAdmin Portal"
            >
              <ShieldCheck size={16} className="text-purple-400" />
              <span className="hidden md:inline">SuperAdmin Portal</span>
              <span className="hidden sm:inline md:hidden">SuperAdmin</span>
            </Link>
          )}

          {/* VIEW MY SHOWROOM BUTTON */}
          <a
            href={showroomUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-initial min-w-0 h-11 px-3 sm:px-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm sm:shrink-0"
            title="Preview Public Digital Showroom in a new tab"
          >
            <ExternalLink size={14} />
            <span>Showroom</span>
          </a>

          {can("vehicles") && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="flex-1 sm:flex-initial min-w-0 h-11 bg-amber-500 hover:bg-amber-400 text-black px-3 sm:px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 sm:shrink-0 whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Add Vehicle</span>
          </button>
          )}
          <button
            onClick={handleLogout}
            className="h-11 w-11 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-xl transition shrink-0"
            title="Log out of Dealership"
            aria-label="Log out of Dealership"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* DEALER SHARE CENTER / "SHARE MY SHOWROOM" ACTION BAR */}
      <div className="mb-4 sm:mb-6 w-full max-w-full overflow-hidden bg-gradient-to-r from-zinc-900/95 via-zinc-900 to-zinc-950 border border-amber-500/30 rounded-2xl p-3 sm:p-5 shadow-xl shadow-black/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 w-full max-w-full">
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

            <div className="flex items-center gap-2 bg-black/60 border border-zinc-800 rounded-xl pl-3 text-xs font-mono text-zinc-300 w-full max-w-full overflow-hidden">
              <Globe size={14} className="text-amber-400 shrink-0" />
              <span className="truncate select-all text-amber-200/90 font-semibold flex-1 min-w-0">{showroomUrl}</span>
              <a
                href={showroomUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto h-11 w-11 flex items-center justify-center text-zinc-400 hover:text-white transition shrink-0"
                title="Open showroom in new tab"
                aria-label="Open showroom in new tab"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* Right: 3 Action Buttons */}
          {/* 3 action buttons: one compact row on phones (short labels), full labels from sm up */}
          <div className="grid grid-cols-3 gap-2 w-full lg:w-auto shrink-0">
            {/* Button 1: Copy Link */}
            <button
              type="button"
              onClick={handleCopyShowroomLink}
              className={`w-full min-w-0 h-11 justify-center px-2 sm:px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 border ${
                copiedShowroomLink
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-zinc-500"
              }`}
              title="ሊንክ ኮፒ አድርግ (Copy Link)"
            >
              {copiedShowroomLink ? (
                <>
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span className="truncate sm:hidden">Copied</span>
                  <span className="hidden sm:inline">ተቀድቷል! (Copied)</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="shrink-0" />
                  <span className="truncate sm:hidden">ኮፒ (Copy)</span>
                  <span className="hidden sm:inline">ሊንክ ኮፒ አድርግ (Copy Link)</span>
                </>
              )}
            </button>

            {/* Button 2: Share on Telegram */}
            <a
              href={telegramShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-w-0 h-11 justify-center px-2 sm:px-3.5 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#229ED9] border border-[#229ED9]/40 hover:border-[#229ED9] rounded-xl text-xs font-bold transition flex items-center gap-1.5 sm:gap-2"
              title="በቴሌግራም አጋራ (Telegram)"
            >
              <Send size={14} className="shrink-0" />
              <span className="truncate sm:hidden">Telegram</span>
              <span className="hidden sm:inline">በቴሌግራም አጋራ (Telegram)</span>
            </a>

            {/* Button 3: Showroom QR Code */}
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="w-full min-w-0 h-11 justify-center px-2 sm:px-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition flex items-center gap-1.5 sm:gap-2 shadow-sm shadow-amber-500/20"
              title="የሾውሩም QR ኮድ (QR)"
            >
              <QrCode size={14} className="shrink-0" />
              <span className="truncate sm:hidden">QR ኮድ</span>
              <span className="hidden sm:inline">የሾውሩም QR ኮድ (QR)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Dashboard sections" className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-4 bg-black/85 backdrop-blur-md flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:mb-6 sm:bg-transparent sm:backdrop-blur-none sm:grid sm:grid-cols-5 sm:overflow-visible">
        {(allowedStaffTabs as string[]).includes("inventory") && (
          <button
            onClick={() => setActiveTab("inventory")}
            role="tab"
            aria-selected={activeTab === "inventory"}
            data-admin-tab="inventory"
            className={`shrink-0 snap-start h-11 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 rounded-xl text-xs font-semibold border transition text-center whitespace-nowrap ${
              activeTab === "inventory"
                ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            <Car size={14} className="shrink-0" />
            <span className="truncate">Inventory ({vehicles.length})</span>
          </button>
        )}
        {(allowedStaffTabs as string[]).includes("appointments") && (
          <button
            onClick={() => setActiveTab("appointments")}
            role="tab"
            aria-selected={activeTab === "appointments"}
            data-admin-tab="appointments"
            className={`shrink-0 snap-start h-11 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 rounded-xl text-xs font-semibold border transition text-center whitespace-nowrap ${
              activeTab === "appointments"
                ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            <Calendar size={14} className="shrink-0" />
            <span className="truncate">Appointments ({activeAppointmentCount(appointments)})</span>
          </button>
        )}
        {(allowedStaffTabs as string[]).includes("rentals") && (
          <button
            onClick={() => setActiveTab("rentals")}
            role="tab"
            aria-selected={activeTab === "rentals"}
            data-admin-tab="rentals"
            className={`shrink-0 snap-start h-11 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 rounded-xl text-xs font-semibold border transition text-center whitespace-nowrap ${
              activeTab === "rentals"
                ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            <Key size={14} className="shrink-0" />
            <span className="truncate">Rentals ({rentals.length})</span>
          </button>
        )}
        {(allowedStaffTabs as string[]).includes("gate") && (
          <button
            onClick={() => setActiveTab("gate")}
            role="tab"
            aria-selected={activeTab === "gate"}
            data-admin-tab="gate"
            className={`shrink-0 snap-start h-11 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 rounded-xl text-xs font-semibold border transition text-center whitespace-nowrap ${
              activeTab === "gate"
                ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            <DoorOpen size={14} className="shrink-0" />
            <span className="truncate">Gate</span>
          </button>
        )}
      </div>
      </>
      )}

      {/* GATE TAB CONTENT (gatekeeper permission; owners have it too) */}
      {!isOwnerPortal && activeTab === "gate" && <GateDesk onUnauthorized={handleUnauthorized} />}

      {/* INVENTORY TAB CONTENT */}
      {!isOwnerPortal && activeTab === "inventory" && (
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
                <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
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
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-amber-500 uppercase">
                      {v.make}
                    </span>
                    <h3 className="font-bold text-sm text-white break-words">
                      {v.year} {v.model}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {v.price != null ? `${v.price.toLocaleString()} ETB` : "Call for Price"} •{" "}
                      {formatMileage(v.mileage) && <>{formatMileage(v.mileage)} •{" "}</>}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${getPlateBadgeClasses(v.plate_status)}`}>
                        🏷️ {getPlateLabel(v.plate_status, false)}
                      </span>
                    </p>
                    {(v as any).has_bank_loan && (
                      <span className="inline-block mt-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                        🏦 Loan: {(v as any).cash_price?.toLocaleString()} ETB Cash + {(v as any).bank_loan_amount?.toLocaleString()} ETB Bank
                      </span>
                    )}
                    {isSuperadminUser(currentUser) && (
                      <button
                        type="button"
                        onClick={() => setDocsVehicle(v)}
                        className="mt-1.5 min-h-[44px] sm:min-h-8 px-3 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-semibold text-amber-300 hover:border-amber-500/60 inline-flex items-center gap-1.5"
                      >
                        <FileText size={13} /> ሰነዶች · Documents
                      </button>
                    )}
                  </div>
                </div>

                {/* Status and Action Buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <select
                    value={v.status}
                    onChange={(e) => handleStatusChange(v.id, e.target.value)}
                    className="flex-1 sm:flex-none min-w-0 bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs py-1.5 px-3 rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                    <option value="In Transit">In Transit</option>
                  </select>

                  <button
                    onClick={() => setPrintingVehicle(v)}
                    className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 justify-center text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
                    aria-label="Print flyer"
                    title="Print Window Spec Sheet (A4)"
                  >
                    <Printer size={16} className="text-amber-400" />
                    <span className="hidden sm:inline">Flyer</span>
                  </button>

                  <button
                    onClick={() => openEditModal(v)}
                    className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg transition"
                    aria-label="Edit vehicle"
                    title="Edit Vehicle Details & Photos"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(v.id)}
                    className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg transition"
                    aria-label="Delete vehicle"
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
      {!isOwnerPortal && activeTab === "appointments" && (
        <AppointmentsPanel
          appointments={appointments}
          setAppointments={setAppointments}
          vehicles={vehicles}
          isSuperadmin={isSuperadminUser(currentUser)}
          getAuthToken={getAuthToken}
          onUnauthorized={handleUnauthorized}
          showToast={showToast}
        />
      )}

      {/* RENTALS & DISPATCH TAB CONTENT */}
      {!isOwnerPortal && activeTab === "rentals" && (
        <div className="space-y-4">
          {/* Top Controls: Status Filters & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
            <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
              {[
                { key: "all", label: "All (ሁሉንም)" },
                { key: "pending", label: "Pending (በመጠባበቅ)" },
                { key: "driver_assigned", label: "Driver Assigned (ስምሪት)" },
                { key: "delivered", label: "Delivered (የተረከቡ)" },
                { key: "completed", label: "Completed (የተጠናቀቁ)" },
              ].map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setRentalStatusFilter(pill.key)}
                  className={`shrink-0 whitespace-nowrap min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    rentalStatusFilter === pill.key
                      ? "bg-amber-500 text-black font-black shadow-sm"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-zinc-400 font-medium">
              Total Rentals: <span className="font-bold text-amber-400">{rentals.length}</span>
            </div>
          </div>

          {/* Rentals List */}
          {rentals
            .filter((r) => rentalStatusFilter === "all" || r.status === rentalStatusFilter)
            .length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
              <Key size={28} className="text-zinc-600 mx-auto" />
              <p className="text-zinc-400 text-xs font-semibold">
                ምንም የኪራይ ትዕዛዝ አልተገኘም። (No rental bookings found for this filter)
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rentals
                .filter((r) => rentalStatusFilter === "all" || r.status === rentalStatusFilter)
                .map((booking) => {
                  const carTitle = booking.vehicle
                    ? `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`
                    : `Vehicle #${booking.vehicle_id}`;

                  const startDateDisplay = new Date(booking.start_date).toLocaleDateString();
                  const endDateDisplay = new Date(booking.end_date).toLocaleDateString();

                  return (
                    <div
                      key={booking.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg"
                    >
                      {/* Booking Top Info */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-black text-sm text-white break-words min-w-0">
                              {booking.customer_name}
                            </h3>
                            <span className="shrink-0 text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                              Booking #{booking.id}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <a
                              href={`tel:${booking.customer_phone}`}
                              className="inline-flex items-center min-h-[44px] sm:min-h-0 text-sm sm:text-xs text-amber-400 font-bold hover:underline"
                            >
                              📞 {booking.customer_phone}
                            </a>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-400 break-words min-w-0">
                              {booking.delivery_type === "doorstep_delivery"
                                ? `🚚 ያሉበት ድረስ (${booking.delivery_address || "Addis Ababa"})`
                                : "🏢 ከሾውሩም መረከብ (Showroom Pickup)"}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2 self-start">
                          <span
                            className={`text-[11px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wider border ${
                              booking.status === "pending"
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : booking.status === "driver_assigned"
                                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                                : booking.status === "delivered"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                : booking.status === "completed"
                                ? "bg-green-500/20 text-green-400 border-green-500/40"
                                : "bg-red-500/20 text-red-400 border-red-500/40"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>
                      </div>

                      {/* Vehicle & Price Summary Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/80 text-xs">
                        <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/60">
                          <span className="text-[10px] text-zinc-500 block">የተከራዩት መኪና</span>
                          <span className="font-bold text-white flex items-center gap-1.5 mt-0.5 break-words">
                            <Car size={13} className="text-amber-400 shrink-0" />
                            {carTitle}
                          </span>
                        </div>

                        <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/60">
                          <span className="text-[10px] text-zinc-500 block">የኪራይ ጊዜ</span>
                          <span className="font-bold text-zinc-200 block mt-0.5">
                            {startDateDisplay} - {endDateDisplay} ({booking.total_days} ቀን)
                          </span>
                        </div>

                        <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/60">
                          <span className="text-[10px] text-zinc-500 block">ጠቅላላ ክፍያ</span>
                          <span className="font-black text-emerald-400 text-sm block mt-0.5">
                            {booking.total_price.toLocaleString()} ETB
                          </span>
                        </div>
                      </div>

                      {/* Driver Assignment & Management Section */}
                      <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-xs text-zinc-400 font-medium">የተመደበው አሽከርካሪ:</span>
                          {booking.assigned_person ? (
                            <span className="text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1.5 break-words min-w-0">
                              <UserCheck size={13} />
                              {booking.assigned_person.full_name}
                              {booking.assigned_person.phone_number ? ` (${booking.assigned_person.phone_number})` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500 italic">
                              አሽከርካሪ አልተመደበም (No driver assigned)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAssigningBooking(booking);
                              setSelectedDriverId(booking.assigned_user_id || "");
                            }}
                            className="flex-1 sm:flex-none justify-center min-h-[44px] sm:min-h-0 px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 rounded-xl text-sm sm:text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                          >
                            <Truck size={13} />
                            <span>{booking.assigned_person ? "አሽከርካሪ ቀይር" : "አሽከርካሪ መድብ"}</span>
                          </button>

                          {/* Quick Status Dropdown */}
                          <select
                            value={booking.status}
                            onChange={(e) => handleUpdateRentalStatus(booking.id, e.target.value)}
                            className="flex-1 sm:flex-none min-w-0 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none focus:border-amber-500"
                          >
                            <option value="pending">Pending</option>
                            <option value="driver_assigned">Driver Assigned</option>
                            <option value="delivered">Delivered</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB CONTENT */}
      {isOwnerPortal && activeTab === "settings" && <TelegramStatusCard />}
      {isOwnerPortal && activeTab === "settings" && (
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
                {showroomUrl}
              </p>
            </div>
            <a
              href="/"
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
                placeholder="e.g. AC WALE MARKET"
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
                placeholder="e.g. +251 9XX XXX XXX"
                inputMode="tel"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Main call button on the showroom, vehicle pages, flyers, print sheets and Telegram share text.
              </span>
            </div>

            {/* Second Contact Phone */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Second Contact Phone (ሁለተኛ ስልክ ቁጥር)
              </label>
              <input
                type="text"
                value={dealershipSettings.phone_number_2}
                onChange={(e) =>
                  setDealershipSettings({
                    ...dealershipSettings,
                    phone_number_2: e.target.value,
                  })
                }
                placeholder="optional"
                inputMode="tel"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Defaults come from PRIMARY_DEALERSHIP_PHONE / _PHONE_2 in the server .env; a changed .env value replaces these once on restart.
              </span>
            </div>

            {/* Contact e-mail (document letterheads) */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Contact E-mail (ኢሜይል)
              </label>
              <input
                type="email"
                value={dealershipSettings.email}
                onChange={(e) => setDealershipSettings({ ...dealershipSettings, email: e.target.value })}
                placeholder="e.g. name@gmail.com"
                inputMode="email"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Printed with the phones on the down-payment receipt and rental agreement letterheads.
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

            {/* Telegram Notification & Bot Configuration Section */}
            {(() => {
              const hasChatId = Boolean(
                dealershipSettings.telegram_chat_id && dealershipSettings.telegram_chat_id.trim()
              );
              const hasBotToken = Boolean(
                dealershipSettings.telegram_bot_token && dealershipSettings.telegram_bot_token.trim()
              );
              const isFullyConnected = hasChatId && hasBotToken;

              return (
                <div className="pt-4 border-t border-zinc-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Send size={14} /> የቴሌግራም ቦት ማስተካከያ (Telegram Bot Lead Notifications)
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        የደንበኞች አዲስ የቀጠሮ ጥያቄዎች (Appointments) እና መልእክቶች በቀጥታ ወደ ቴሌግራምዎ እንዲደርሱ የራስዎን ቦት ያገናኙ።
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isFullyConnected ? (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-bold flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Active (ቦት ተገናኝቷል)</span>
                        </span>
                      ) : hasChatId ? (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full font-bold">
                          Chat ID ተመዝግቧል
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-full font-bold">
                          ያልተገናኘ (Not Configured)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bot Credentials Input Form */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Telegram Bot Token Field */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-zinc-300">
                            የቴሌግራም ቦት ቶከን (Bot Token)
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowTelegramToken((prev) => !prev)}
                            className="text-[10px] text-zinc-400 hover:text-white"
                          >
                            {showTelegramToken ? "ደብቅ (Hide)" : "አሳይ (Show)"}
                          </button>
                        </div>
                        <input
                          type={showTelegramToken ? "text" : "password"}
                          autoComplete="off"
                          value={dealershipSettings.telegram_bot_token || ""}
                          onChange={(e) =>
                            setDealershipSettings({
                              ...dealershipSettings,
                              telegram_bot_token: e.target.value.trim(),
                            })
                          }
                          placeholder="e.g. 7123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        />
                        <span className="text-[10px] text-zinc-500 mt-1 block">
                          ከ @BotFather የሚሰጥዎ የቦት HTTP API Token (Bot API Token from @BotFather).
                        </span>
                      </div>

                      {/* Telegram Chat ID Field */}
                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1">
                          የቴሌግራም ቻት መለያ ቁጥር (Telegram Chat ID)
                        </label>
                        <input
                          type="text"
                          value={dealershipSettings.telegram_chat_id || ""}
                          onChange={(e) =>
                            setDealershipSettings({
                              ...dealershipSettings,
                              telegram_chat_id: e.target.value.trim(),
                            })
                          }
                          placeholder="e.g. 371550151 ወይም @yourchannel"
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        />
                        <span className="text-[10px] text-zinc-500 mt-1 block">
                          መልእክቱ እንዲደርስበት የሚፈልጉት የግል Chat ID ወይም የቻናል/ግሩፕ መለያ።
                        </span>
                      </div>
                    </div>

                    {/* Bot Username (Optional) */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1">
                        የቦት ዩዘርኔም (Bot Username - Optional)
                      </label>
                      <input
                        type="text"
                        value={dealershipSettings.telegram_bot_username || ""}
                        onChange={(e) =>
                          setDealershipSettings({
                            ...dealershipSettings,
                            telegram_bot_username: e.target.value.trim(),
                          })
                        }
                        placeholder="e.g. @ACWaleCarsBot"
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        ደንበኞች ወይም አስተዳዳሪዎች ቦቱን በቀላሉ እንዲያገኙት (Optional).
                      </span>
                    </div>

                    {/* Actions: Test Alert & Disconnect */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTestTelegram}
                          disabled={
                            testingTelegram ||
                            (!dealershipSettings.telegram_bot_token && !dealershipSettings.telegram_chat_id)
                          }
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                        >
                          {testingTelegram ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>{testingTelegram ? "በመላክ ላይ..." : "የማሳወቂያ ሙከራ (Test Alert)"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fetchData()}
                          className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                          title="ሁኔታውን አድስ"
                        >
                          <RefreshCw size={12} />
                          <span>አድስ</span>
                        </button>
                      </div>

                      {(dealershipSettings.telegram_bot_token || dealershipSettings.telegram_chat_id) && (
                        <button
                          type="button"
                          disabled={disconnectingTelegram}
                          onClick={handleDisconnectTelegram}
                          className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                          title="የቴሌግራም ቦት መረጃዎችን አቋርጥ እና አስወግድ"
                        >
                          {disconnectingTelegram ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          <span>ቴሌግራም አቋርጥ / አፅዳ (Disconnect & Clear)</span>
                        </button>
                      )}
                    </div>

                    {/* Test Result Message Banner */}
                    {telegramTestStatus && (
                      <div
                        className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                          telegramTestStatus.success
                            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                            : "bg-red-500/10 border border-red-500/30 text-red-400"
                        }`}
                      >
                        {telegramTestStatus.success ? (
                          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-emerald-400" />
                        ) : (
                          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
                        )}
                        <div className="space-y-0.5">
                          <span className="font-bold block">
                            {telegramTestStatus.success
                              ? "የሙከራ መልእክት ተልኳል (Test Succeeded)"
                              : "ስህተት ተከስቷል (Test Failed)"}
                          </span>
                          <span className="break-all">{telegramTestStatus.message}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step-by-Step Instructions Card for Client */}
                  <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-400 text-xs">
                      <Sparkles size={15} />
                      <span>የራስዎን የቴሌግራም ቦት በ2 ደቂቃ ውስጥ እንዴት ያዘጋጃሉ? (Step-by-Step Setup Guide)</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-2 text-zinc-300 text-[11px] leading-relaxed pl-1">
                      <li>
                        በቴሌግራም መተግበሪያ ላይ ወደ{" "}
                        <a
                          href="https://t.me/BotFather"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline font-bold inline-flex items-center gap-0.5"
                        >
                          @BotFather <ExternalLink size={10} />
                        </a>{" "}
                        ይሂዱ እና <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">/start</code> ከዚያም{" "}
                        <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">/newbot</code> ብለው ይላኩ።
                      </li>
                      <li>
                        ለቦትዎ ስም እና ዩዘርኔም (ለምሳሌ፡ <code className="text-zinc-200 font-mono">ACWaleCarsBot</code>) ይስጡት።
                      </li>
                      <li>
                        BotFather የሚሰጥዎትን ረጅም <strong>HTTP API Token</strong> ኮፒ አድርገው ከላይ ባለው <strong>Bot Token</strong> ሳጥን ውስጥ ያስገቡ።
                      </li>
                      <li>
                        ወደ አዲሱ ቦትዎ ሊንክ ገብተው <strong>START</strong> የሚለውን ይጫኑ (ቦቱ መልእክት እንዲልክልዎ የግድ መጀመሪያ start መደረግ አለበት)።
                      </li>
                      <li>
                        የራስዎን Chat ID ለማወቅ ወደ{" "}
                        <a
                          href="https://t.me/userinfobot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline font-bold inline-flex items-center gap-0.5"
                        >
                          @userinfobot <ExternalLink size={10} />
                        </a>{" "}
                        ይሂዱ፤ የሚሰጥዎትን የቁጥር <strong>Id</strong> ኮፒ አድርገው ከላይ ባለው <strong>Chat ID</strong> ሳጥን ውስጥ ያስገቡ።
                      </li>
                      <li>
                        ከታች <strong>&quot;ለውጦችን መዝግብ (Save Settings)&quot;</strong> የሚለውን ይጫኑ፤ በመቀጠል <strong>&quot;የማሳወቂያ ሙከራ (Test Alert)&quot;</strong> በመጫን ያረጋግጡ!
                      </li>
                    </ol>
                  </div>
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
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4 animate-in fade-in">
          {/* Phones: full-screen sheet with sticky header and sticky Save bar */}
          <div className="bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl max-w-lg w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 sm:px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
              <h2 className="text-base font-bold text-white truncate">
                {editingVehicleId
                  ? "Edit Vehicle Listing"
                  : "Add New Vehicle to Inventory"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                aria-label="Close"
                className="h-11 w-11 shrink-0 flex items-center justify-center text-zinc-400 hover:text-white rounded-xl bg-zinc-800"
              >
                <X size={18} />
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
              className="space-y-4 text-xs px-4 sm:px-5 pt-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer select-none">
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

              {/* CAR RENTAL ENGINE SETTINGS */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Key size={14} /> የመኪና ኪራይ አገልግሎት (Rental Configuration)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">
                      የዝርዝር አይነት (Listing Type)
                    </label>
                    <select
                      value={formData.listing_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          listing_type: e.target.value as "sale" | "rent" | "both",
                        })
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-white text-xs"
                    >
                      <option value="sale">🚗 ለሽያጭ ብቻ (Sale Only)</option>
                      <option value="rent">🔑 ለኪራይ ብቻ (Rent Only)</option>
                      <option value="both">✨ ለሽያጭ እና ለኪራይ (Both Sale & Rent)</option>
                    </select>
                  </div>

                  {(formData.listing_type === "rent" || formData.listing_type === "both") && (
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
                        Daily Rental Rate (የቀን የኪራይ ዋጋ በብር) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 3500"
                        min="1"
                        step="any"
                        required={true}
                        value={formData.rental_daily_rate}
                        onChange={(e) =>
                          setFormData({ ...formData, rental_daily_rate: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>

                {(formData.listing_type === "rent" || formData.listing_type === "both") && (
                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="flex items-center gap-2 min-h-[44px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.with_driver_only}
                        onChange={(e) =>
                          setFormData({ ...formData, with_driver_only: e.target.checked })
                        }
                        className="w-4 h-4 rounded accent-amber-500 bg-zinc-900 border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300">
                        👨‍✈️ ከአሽከርካሪ ጋር ብቻ (With Driver Only)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 min-h-[44px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.rental_available}
                        onChange={(e) =>
                          setFormData({ ...formData, rental_available: e.target.checked })
                        }
                        className="w-4 h-4 rounded accent-amber-500 bg-zinc-900 border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300">
                        ለኪራይ ዝግጁ ነው (Rental Available)
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Body Type Selection with Custom Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) =>
                      setFormData({ ...formData, condition: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Brand New">አዲስ / ዜሮ ኪ.ሜ (Brand New)</option>
                    <option value="Slightly Used">በጥቂቱ ያገለገለ (Slightly Used)</option>
                    <option value="Excellent Condition">በጣም ጥሩ ይዞታ (Excellent Condition)</option>
                    <option value="Good Condition">ጥሩ ይዞታ (Good Condition)</option>
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
                    {uploading && uploadProgress
                      ? `Uploading ${Math.min(uploadProgress.done + 1, uploadProgress.total)}/${uploadProgress.total}…`
                      : "Click to Upload Photos"}
                  </span>
                  {uploading && uploadProgress && (
                    <span className="mt-2 block w-full max-w-[220px] h-1.5 rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
                      <span
                        className="block h-full bg-amber-500 transition-all"
                        style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                      />
                    </span>
                  )}
                  {uploadNote && (
                    <span className="mt-1 text-[11px] text-amber-400/90 text-center break-words max-w-full">{uploadNote}</span>
                  )}
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
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                    {uploadedImages.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative group aspect-[4/3] rounded-lg overflow-hidden border border-zinc-800"
                      >
                        <img
                          src={resolveImageUrl(url)}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeUploadedImage(idx)}
                          aria-label={`Remove photo ${idx + 1}`}
                          title="Remove photo"
                          className="absolute top-0 right-0 h-11 w-11 flex items-start justify-end p-1.5"
                        >
                          <span className="h-7 w-7 flex items-center justify-center bg-red-600/90 hover:bg-red-600 text-white rounded-full shadow-md ring-2 ring-black/40">
                            <X size={15} />
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {failedUploads.length > 0 && (
                  <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-2">
                    <p className="text-xs font-bold text-red-300">
                      {failedUploads.length} photo{failedUploads.length > 1 ? "s" : ""} failed to upload
                    </p>
                    <ul className="space-y-1 text-[11px] text-red-200/90">
                      {failedUploads.map((f, idx) => (
                        <li key={idx} className="break-words">
                          <span className="font-semibold">{f.file.name}</span> — {f.reason}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={retryFailedUploads}
                        disabled={uploading}
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-sm font-bold transition"
                      >
                        Retry failed photos
                      </button>
                      <button
                        type="button"
                        onClick={() => setFailedUploads([])}
                        disabled={uploading}
                        className="min-h-[44px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
                <button
                  type="submit"
                  disabled={uploadedImages.length === 0 || uploading}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20"
                >
                  {editingVehicleId ? "Update Vehicle" : "Create Listing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT LOT WINDOW FLYER MODAL */}
      {printingVehicle && (
        <PrintFlyerModal
          vehicle={printingVehicle}
          dealership={currentUser?.dealership}
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

      {/* ASSIGN DRIVER MODAL */}
      {assigningBooking && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[92dvh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Truck size={18} className="text-amber-400" />
                <span>አሽከርካሪ መድብ (Assign Driver)</span>
              </h3>
              <button
                onClick={() => setAssigningBooking(null)}
                aria-label="Close"
                className="h-11 w-11 -mr-2 shrink-0 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 text-xs space-y-1">
              <div className="text-zinc-400">
                ደንበኛ: <span className="font-bold text-white">{assigningBooking.customer_name}</span> ({assigningBooking.customer_phone})
              </div>
              <div className="text-zinc-400">
                መኪና: <span className="font-bold text-amber-400">{assigningBooking.vehicle ? `${assigningBooking.vehicle.year} ${assigningBooking.vehicle.make} ${assigningBooking.vehicle.model}` : `Vehicle #${assigningBooking.vehicle_id}`}</span>
              </div>
              <div className="text-zinc-400">
                ማድረሻ: <span className="text-zinc-300">{assigningBooking.delivery_type === "doorstep_delivery" ? `Doorstep (${assigningBooking.delivery_address || ""})` : "Showroom Pickup"}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-2">
                የሚመደቡትን አሽከርካሪ ይምረጡ (Select Driver) *
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value ? Number(e.target.value) : "")}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- አሽከርካሪ ይምረጡ --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                    {d.phone_number ? ` (${d.phone_number})` : ""}
                    {d.telegram_linked ? "" : " · no Telegram"}
                  </option>
                ))}
              </select>
              {drivers.length === 0 && (
                <p className="text-[11px] text-zinc-500 mt-2">
                  No drivers yet. The owner adds them in SuperAdmin → Team (tick Driver). / ሹፌሮችን ባለቤቱ ይመዘግባል።
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssigningBooking(null)}
                className="flex-1 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                ይቅር (Cancel)
              </button>
              <button
                type="button"
                disabled={!selectedDriverId || assigningLoading}
                onClick={() => {
                  if (selectedDriverId) {
                    handleAssignDriver(assigningBooking.id, Number(selectedDriverId));
                  }
                }}
                className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs shadow-md shadow-amber-500/20"
              >
                {assigningLoading ? "ስምሪት እየተከናወነ ነው..." : "ስምሪት አረጋግጥ (Dispatch)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENTS OF ONE VEHICLE (owner only; opens the Document Center) */}
      {docsVehicle && <VehicleDocumentsSheet vehicle={docsVehicle} onClose={() => setDocsVehicle(null)} />}

      {/* OFFICIAL AC WALE MARKET FOOTER (phones from the dealership record) */}
      {!isOwnerPortal && (
      <footer className="mt-16 border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
        <p>© 2026 AC WALE MARKET. All rights reserved. 22 አዋራሪስ ሆቴል ጀርባ፣ Addis Ababa, Ethiopia</p>
        <div className="flex flex-wrap justify-center items-center gap-x-3 mt-2 font-mono text-[11px] text-zinc-400">
          {dealerPhoneLines(currentUser?.dealership || dealershipSettings).map((p) => (
            <React.Fragment key={p.tel}>
              <a href={`tel:${p.tel}`} className="inline-flex items-center min-h-[44px] sm:min-h-0 whitespace-nowrap hover:text-amber-400 transition">📞 {p.display}</a>
              <span className="hidden sm:inline">•</span>
            </React.Fragment>
          ))}
          <a href="mailto:acwalecarmarket@gmail.com" className="inline-flex items-center min-h-[44px] sm:min-h-0 hover:text-amber-400 transition">acwalecarmarket@gmail.com</a>
        </div>
      </footer>
      )}

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
