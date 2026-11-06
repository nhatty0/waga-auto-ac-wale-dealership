"use client";
import { useState, useMemo, useEffect } from "react";
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Phone,
  User,
  CheckCircle2,
  Video,
  Car,
  AlertCircle,
} from "lucide-react";
import { Vehicle, AppointmentPayload, Dealership } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { getApiBaseUrl } from "@/lib/api";

interface BookingModalProps {
  vehicle: Vehicle | null;
  dealership?: Dealership | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingModal({
  vehicle,
  dealership,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const { lang, t } = useLanguage();
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Generate the next 7 selectable days with localization
  const availableDates = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split("T")[0];

      let dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      if (i === 0) dayName = t.today;
      else if (i === 1) dayName = t.tomorrow;
      else if (lang === "am") {
        const amWeekdays: Record<string, string> = {
          Sun: "እሑድ",
          Mon: "ሰኞ",
          Tue: "ማክሰ",
          Wed: "ረቡዕ",
          Thu: "ሐሙስ",
          Fri: "ዓርብ",
          Sat: "ቅዳሜ",
        };
        dayName = amWeekdays[dayName] || dayName;
      }

      const label = d.toLocaleDateString(lang === "am" ? "en-US" : "en-US", {
        month: "short",
        day: "numeric",
      });
      list.push({ iso, dayName, label });
    }
    return list;
  }, [lang, t]);

  const timeSlots = [
    "09:30 AM",
    "11:00 AM",
    "02:00 PM",
    "03:30 PM",
    "05:00 PM",
  ];

  const [formData, setFormData] = useState<AppointmentPayload>({
    vehicle_id: vehicle ? vehicle.id : null,
    dealership_id: vehicle?.dealership_id || dealership?.id || null,
    customer_name: "",
    phone_number: "",
    preferred_channel: "Telegram",
    appointment_type: "In-Person Test Drive",
    date: availableDates[0].iso,
    time_slot: timeSlots[1],
    notes: "",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      vehicle_id: vehicle ? vehicle.id : null,
      dealership_id: vehicle?.dealership_id || dealership?.id || null,
    }));
  }, [vehicle, dealership]);

  // Ethiopian phone number validation & normalization
  const handlePhoneChange = (val: string) => {
    const cleaned = val.replace(/[^\d+]/g, "");
    const digitsOnly = cleaned.replace(/\D/g, "");

    let error: string | null = null;
    if (digitsOnly.length > 0) {
      if (digitsOnly.startsWith("251")) {
        if (digitsOnly.length !== 12) {
          error =
            lang === "am"
              ? "በ+251 ሲጠቀሙ 12 አሃዞች መሆን አለበት (ለምሳሌ፡ +251911...)"
              : "Must be 12 digits when using +251 (e.g. +251911...)";
        }
      } else if (digitsOnly.startsWith("09") || digitsOnly.startsWith("07")) {
        if (digitsOnly.length !== 10) {
          error =
            lang === "am"
              ? `በትክክል 10 አሃዞችን ያስገቡ (${digitsOnly.length}/10)`
              : `Enter exactly 10 digits (${digitsOnly.length}/10)`;
        }
      } else if (digitsOnly.startsWith("9") || digitsOnly.startsWith("7")) {
        if (digitsOnly.length !== 9) {
          error =
            lang === "am"
              ? `ያለ 0 ሲያስገቡ 9 አሃዞች መሆን አለበት (${digitsOnly.length}/9)`
              : `Enter 9 digits when omitting 0 (${digitsOnly.length}/9)`;
        }
      } else {
        error =
          lang === "am"
            ? "ስልክ ቁጥሩ በ09፣ 07 ወይም በ+251 መጀመር አለበት"
            : "Phone must start with 09, 07, or +251";
      }
    }

    setPhoneError(error);
    setFormData((prev) => ({ ...prev, phone_number: cleaned }));
  };

  const isPhoneValid = useMemo(() => {
    const digits = formData.phone_number.replace(/\D/g, "");
    if (digits.startsWith("251") && digits.length === 12) return true;
    if (
      (digits.startsWith("09") || digits.startsWith("07")) &&
      digits.length === 10
    )
      return true;
    if (
      (digits.startsWith("9") || digits.startsWith("7")) &&
      digits.length === 9
    )
      return true;
    return false;
  }, [formData.phone_number]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) {
      setPhoneError(
        lang === "am"
          ? "እባክዎ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (09... / 07...)"
          : "Please enter a valid Ethiopian phone number (09... / 07...)",
      );
      return;
    }

    setLoading(true);
    try {
      let normalized = formData.phone_number.replace(/\D/g, "");
      if (normalized.startsWith("0")) normalized = `251${normalized.slice(1)}`;
      else if (normalized.startsWith("9") || normalized.startsWith("7"))
        normalized = `251${normalized}`;
      else if (!normalized.startsWith("251")) normalized = `251${normalized}`;

      const res = await fetch(`${getApiBaseUrl()}/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          dealership_id: vehicle?.dealership_id || dealership?.id || null,
          phone_number: `+${normalized}`,
        }),
      });

      if (!res.ok) throw new Error("Booking failed");
      setStep("success");
      onSuccess();
    } catch (err) {
      alert(
        lang === "am"
          ? "ቀጠሮ ማስመዝገብ አልተቻለም። ሰርቨሩ እየሰራ መሆኑን ያረጋግጡ።"
          : "Could not submit booking. Please check if your backend is running.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-base">
              {step === "form" ? t.scheduleTitle : t.bookingReceivedTitle}
            </h3>
            {vehicle && (
              <p className="text-xs text-amber-400 font-medium">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900 border border-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {step === "form" ? (
          <form
            onSubmit={handleSubmit}
            className="p-5 overflow-y-auto space-y-4 text-xs"
          >
            {/* Visit Type Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    appointment_type: "In-Person Test Drive",
                  })
                }
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold border transition ${
                  formData.appointment_type === "In-Person Test Drive"
                    ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                <Car size={16} /> {t.inPersonVisit}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    appointment_type: "Virtual Video Tour",
                  })
                }
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold border transition ${
                  formData.appointment_type === "Virtual Video Tour"
                    ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                <Video size={16} /> {t.videoTour}
              </button>
            </div>

            {/* Customer Name */}
            <div>
              <label className="text-zinc-400 mb-1 block font-semibold">
                {t.yourName}
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3.5 top-3 text-zinc-500"
                />
                <input
                  required
                  type="text"
                  placeholder={t.namePlaceholder}
                  value={formData.customer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_name: e.target.value })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            {/* Smart Phone Input with Verification */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-zinc-400 font-semibold">{t.phone}</label>
                <span
                  className={`text-[10px] font-mono ${
                    isPhoneValid ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {isPhoneValid ? t.validNumber : t.phoneFormatHint}
                </span>
              </div>
              <div className="relative">
                <Phone
                  size={16}
                  className={`absolute left-3.5 top-3 ${
                    isPhoneValid ? "text-emerald-400" : "text-zinc-500"
                  }`}
                />
                <input
                  required
                  type="tel"
                  placeholder="0911 234 567"
                  value={formData.phone_number}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`w-full bg-zinc-900 border ${
                    phoneError
                      ? "border-red-500/80 focus:border-red-500"
                      : isPhoneValid
                        ? "border-emerald-500/60"
                        : "border-zinc-800"
                  } rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono text-xs transition`}
                />
              </div>
              {phoneError && (
                <p className="text-red-400 text-[10px] mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle size={12} /> {phoneError}
                </p>
              )}
            </div>

            {/* Contact Preference */}
            <div>
              <label className="text-zinc-400 mb-1 block font-semibold">
                {t.whereToConfirm}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["Telegram", "Phone Call", "WhatsApp"].map((ch) => {
                  const channelLabel =
                    lang === "am" && ch === "Phone Call" ? "በስልክ ጥሪ" : ch;

                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, preferred_channel: ch })
                      }
                      className={`py-2 rounded-xl border font-bold transition text-center ${
                        formData.preferred_channel === ch
                          ? "border-amber-500 bg-amber-500/10 text-amber-400"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {channelLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horizontal Interactive Calendar Bar */}
            <div>
              <label className="text-zinc-400 mb-1.5 flex items-center gap-1.5 font-semibold">
                <CalendarIcon size={14} className="text-amber-400" />{" "}
                {t.selectDate}
              </label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {availableDates.map((item) => {
                  const isSelected = formData.date === item.iso;
                  return (
                    <button
                      key={item.iso}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, date: item.iso })
                      }
                      className={`flex-1 min-w-[70px] py-2 px-2.5 rounded-xl border text-center transition flex flex-col items-center gap-0.5 ${
                        isSelected
                          ? "border-amber-500 bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-bold"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <span
                        className={`text-[10px] ${
                          isSelected
                            ? "text-black font-semibold"
                            : "text-zinc-400"
                        }`}
                      >
                        {item.dayName}
                      </span>
                      <span className="text-xs font-black">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Selector Pills */}
            <div>
              <label className="text-zinc-400 mb-1.5 flex items-center gap-1.5 font-semibold">
                <Clock size={14} className="text-amber-400" />{" "}
                {t.chooseTimeSlot}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {timeSlots.map((slot) => {
                  const isSelected = formData.time_slot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, time_slot: slot })
                      }
                      className={`py-2 rounded-xl text-[11px] font-bold border text-center transition ${
                        isSelected
                          ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Button with Disabled Lock */}
            <button
              type="submit"
              disabled={
                loading || !isPhoneValid || !formData.customer_name.trim()
              }
              className="w-full mt-3 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? t.securingSlotBtn : t.confirmBookingBtn}
            </button>
          </form>
        ) : (
          <div className="p-8 text-center space-y-4">
            <CheckCircle2
              size={56}
              className="text-emerald-400 mx-auto animate-bounce"
            />
            <h4 className="text-xl font-black text-white">
              {lang === "am" ? "ቀጠሮዎ በተሳካ ሁኔታ ተመዝግቧል!" : t.successHeadline}
            </h4>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl max-w-sm mx-auto">
              <p className="text-emerald-400 font-bold text-sm">
                {lang === "am"
                  ? "ቀጠሮዎ በተሳካ ሁኔታ ተመዝግቧል! ሾውሩሙ በቅርቡ ያነጋግርዎታል።"
                  : "Your appointment has been registered! The showroom will contact you shortly."}
              </p>
            </div>
            <p className="text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto">
              {t.successSubheadline}{" "}
              <span className="text-amber-400 font-bold">
                {formData.preferred_channel}
              </span>{" "}
              {lang === "am" ? "በ" : "at"}{" "}
              <span className="text-white font-mono">
                {formData.phone_number}
              </span>{" "}
              {lang === "am"
                ? "በኩል በማረጋገጥ ሰዓቱን ያሳውቅዎታል።"
                : "to confirm your appointment time."}
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold rounded-xl text-xs transition"
            >
              {t.returnToShowroom}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
