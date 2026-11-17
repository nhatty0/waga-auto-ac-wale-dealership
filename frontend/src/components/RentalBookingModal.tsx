"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Calendar,
  Clock,
  Car,
  User,
  Phone,
  MapPin,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  Building2,
  Truck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Vehicle, Dealership, RentalBooking } from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { resolveImageUrl } from "@/lib/images";
import { useLanguage } from "@/context/LanguageContext";
import TelegramIcon from "@/components/TelegramIcon";

interface RentalBookingModalProps {
  vehicle: Vehicle;
  dealership?: Dealership | null;
  onClose: () => void;
  onSuccess?: (booking: RentalBooking) => void;
}

const POPULAR_LOCATIONS = [
  "Bole (ቦሌ)",
  "Kazanchis (ካዛንቺስ)",
  "Old Airport (ኦልድ ኤርፖርት)",
  "CMC (ሲኤምሲ)",
  "Sarbet (ሳርቤት)",
  "Gerji (ገርጂ)",
  "Piassa (ፒያሳ)",
  "Megenagna (መገናኛ)",
];

export default function RentalBookingModal({
  vehicle,
  dealership,
  onClose,
  onSuccess,
}: RentalBookingModalProps) {
  const { lang } = useLanguage();
  const isAm = lang === "am";

  // Form State
  const todayStr = useMemo(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  const threeDaysLaterStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(18, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(threeDaysLaterStr);
  const [deliveryType, setDeliveryType] = useState<"showroom_pickup" | "doorstep_delivery">("showroom_pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookedRecord, setBookedRecord] = useState<RentalBooking | null>(null);

  // Property name check: Use vehicle.rental_daily_rate ?? vehicle.daily_rental_rate ?? vehicle.daily_rate
  const rawDailyRate =
    vehicle.rental_daily_rate ??
    (vehicle as any).daily_rental_rate ??
    (vehicle as any).daily_rate;

  const numDailyRate =
    typeof rawDailyRate === "string" ? parseFloat(rawDailyRate) : Number(rawDailyRate);
  const isRateValid =
    typeof numDailyRate === "number" && !isNaN(numDailyRate) && numDailyRate > 0;
  const dailyRate = isRateValid ? numDailyRate : 0;

  const totalDays = useMemo(() => {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffMs = end.getTime() - start.getTime();
      if (isNaN(diffMs) || diffMs <= 0) return 1;
      return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    } catch {
      return 1;
    }
  }, [startDate, endDate]);

  const totalPrice = useMemo(() => {
    return isRateValid ? totalDays * dailyRate : 0;
  }, [totalDays, dailyRate, isRateValid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (!isRateValid) {
      setErrorMsg(
        isAm
          ? "የዚህ መኪና የቀን የኪራይ ዋጋ ስላልተወሰነ ማከራየት አይቻልም።"
          : "Vehicle rental daily rate is not set."
      );
      return;
    }

    // Validation
    if (!customerName.trim()) {
      setErrorMsg(isAm ? "እባክዎ ሙሉ ስምዎን ያስገቡ።" : "Please enter your full name.");
      return;
    }

    const cleanPhone = customerPhone.replace(/\s+/g, "");
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg(isAm ? "እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ (09... ወይም 07...)።" : "Please enter a valid mobile number (e.g. 0912 345 678).");
      return;
    }

    if (deliveryType === "doorstep_delivery" && !deliveryAddress.trim()) {
      setErrorMsg(isAm ? "እባክዎ መኪናው የሚደርስበትን አድራሻ ያስገቡ።" : "Please enter your delivery destination in Addis Ababa.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      setErrorMsg(isAm ? "የመመለሻ ቀን ከመነሻ ቀን በኋላ መሆን አለበት።" : "Return date must be after pickup date.");
      return;
    }

    setLoading(true);
    try {
      const baseApi = getApiBaseUrl();
      const payload = {
        vehicle_id: vehicle.id,
        customer_name: customerName.trim(),
        customer_phone: cleanPhone,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        delivery_type: deliveryType,
        delivery_address: deliveryType === "doorstep_delivery" ? deliveryAddress.trim() : null,
        dealership_id: vehicle.dealership_id || dealership?.id || 1,
      };

      const res = await fetch(`${baseApi}/api/public/rentals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || (isAm ? "የኪራይ ጥያቄዎን መላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።" : "Failed to submit booking. Please try again."));
      }

      const booking: RentalBooking = await res.json();
      setBookedRecord(booking);
      if (onSuccess) onSuccess(booking);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Booking request failed";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const coverImg = resolveImageUrl(
    vehicle.images?.[0]?.image_url,
    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80"
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-auto"
      >
        {/* Header Bar */}
        <div className="relative border-b border-zinc-800/80 px-5 sm:px-6 py-4 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Car size={18} />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                <span>{isAm ? "መኪና ይከራዩ" : "Book Car Rental"}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                  AC Wale Cars
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                {isAm ? "ፈጣን የኪራይ ስምሪት እና አስተማማኝ አገልግሎት" : "Fast car rental dispatch with optional professional driver"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        {bookedRecord ? (
          /* SUCCESS SCREEN */
          <div className="p-6 sm:p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 animate-bounce">
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xl font-black text-white">
                {isAm ? "የመኪና ኪራይ ጥያቄዎ ተመዝግቧል!" : "Rental Booking Confirmed!"}
              </h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                {isAm
                  ? "የ AC Wale Cars አስተዳደር ጥያቄዎን ተቀብሏል። በደቂቃዎች ውስጥ ደውለን ወይም በቴሌግራም አነጋግረን መኪናውን እናስረክብዎታለን።"
                  : "AC Wale Cars management desk has received your rental request. We will reach out immediately to confirm delivery."}
              </p>
            </div>

            {/* Booking Summary Box */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800 text-zinc-300">
                <span className="text-zinc-500">{isAm ? "መኪና:" : "Vehicle:"}</span>
                <span className="font-bold text-white">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500">{isAm ? "ቀናት:" : "Duration:"}</span>
                <span className="font-bold text-amber-400">{bookedRecord.total_days} {isAm ? "ቀን" : "Days"}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500">{isAm ? "ጠቅላላ ክፍያ:" : "Total Price:"}</span>
                <span className="font-black text-emerald-400 text-sm">{bookedRecord.total_price.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500">{isAm ? "ማድረሻ:" : "Delivery:"}</span>
                <span>
                  {bookedRecord.delivery_type === "doorstep_delivery"
                    ? `${isAm ? "ያሉበት ድረስ" : "Doorstep"} (${bookedRecord.delivery_address || ""})`
                    : (isAm ? "ከ AC Wale Cars ሾውሩም" : "Showroom Pickup")}
                </span>
              </div>
            </div>

            {/* Direct Contact Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href={`https://t.me/WagaDealershipBot`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 px-4 rounded-xl bg-[#229ED9] hover:bg-[#1E88E5] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              >
                <TelegramIcon size={16} />
                <span>{isAm ? "በቴሌግራም ያነጋግሩን" : "Chat on Telegram"}</span>
              </a>

              <a
                href={`tel:${dealership?.phone_number || "+251911646628"}`}
                className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 transition active:scale-95"
              >
                <Phone size={15} />
                <span>{dealership?.phone_number || "+251 911 646 628"}</span>
              </a>
            </div>

            <button
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition pt-2"
            >
              {isAm ? "ዝጋ" : "Close Window"}
            </button>
          </div>
        ) : (
          /* BOOKING FORM */
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
            {/* Vehicle Mini Card */}
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-3 flex items-center gap-3.5">
              <img
                src={coverImg}
                alt={vehicle.model}
                className="w-20 h-16 rounded-xl object-cover border border-zinc-800 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">{vehicle.make}</span>
                  {vehicle.with_driver_only && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      {isAm ? "ከአሽከርካሪ ጋር ብቻ" : "Driver Included"}
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-white text-sm truncate">
                  {vehicle.year} {vehicle.model}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  {isRateValid ? (
                    <>
                      <span className="text-amber-400 font-black text-sm">
                        {dailyRate.toLocaleString()} ETB
                      </span>
                      <span className="text-[11px] text-zinc-500 font-medium">
                        / {isAm ? "ቀን" : "day"}
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-400 font-bold text-xs">
                      {isAm ? "የቀን ኪራይ ዋጋ አልተወሰነም" : "Daily rate not set"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Warning ONLY if daily rate is genuinely missing or 0 */}
            {!isRateValid && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                <span>⚠️ {isAm ? "የዚህ መኪና የቀን የኪራይ ዋጋ አልተወሰነም (Vehicle rental daily rate is not set)" : "Vehicle rental daily rate is not set."}</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <span>⚠️ {errorMsg}</span>
              </div>
            )}

            {/* Date Pickers (Start & End) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1 flex items-center gap-1.5">
                  <Calendar size={13} className="text-amber-400" />
                  <span>{isAm ? "የመነሻ ቀንና ሰዓት" : "Start Date & Time"}</span>
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  min={todayStr}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  style={{ colorScheme: "dark" }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition shadow-inner [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1 flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-400" />
                  <span>{isAm ? "የመመለሻ ቀንና ሰዓት" : "End Date & Time"}</span>
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  style={{ colorScheme: "dark" }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition shadow-inner [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Live Calculation Summary Banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-zinc-400 font-medium block">
                  {isAm ? "የኪራይ ቀናት ብዛት" : "Total Rental Duration"}
                </span>
                <span className="text-white font-bold text-xs flex items-center gap-1">
                  <Sparkles size={12} className="text-amber-400" />
                  {totalDays} {isAm ? "ቀን" : "Days"}{" "}
                  {isRateValid ? `(${dailyRate.toLocaleString()} ETB/ቀን)` : ""}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-zinc-400 font-medium block">
                  {isAm ? "የሚገመት ጠቅላላ ክፍያ" : "Estimated Total"}
                </span>
                <span className="text-base font-black text-amber-400">
                  {isRateValid ? `${totalPrice.toLocaleString()} ETB` : "N/A"}
                </span>
              </div>
            </div>

            {/* Delivery Type Selector */}
            <div>
              <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-2">
                {isAm ? "የመረከቢያ መንገድ ይምረጡ" : "Choose Delivery / Pickup Method"}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeliveryType("showroom_pickup")}
                  className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                    deliveryType === "showroom_pickup"
                      ? "bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Building2 size={18} className={deliveryType === "showroom_pickup" ? "text-amber-400" : "text-zinc-500"} />
                  <div>
                    <div className="font-bold text-xs text-white">
                      {isAm ? "ከሾውሩም መረከብ" : "Showroom Pickup"}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {isAm ? "AC Wale Cars ሾውሩም" : "Free at Showroom"}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryType("doorstep_delivery")}
                  className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                    deliveryType === "doorstep_delivery"
                      ? "bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Truck size={18} className={deliveryType === "doorstep_delivery" ? "text-amber-400" : "text-zinc-500"} />
                  <div>
                    <div className="font-bold text-xs text-white">
                      {isAm ? "ያሉበት ድረስ ማድረስ" : "Doorstep Delivery"}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {isAm ? "አዲስ አበባ ውስጥ" : "Addis Ababa Area"}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Delivery Address Field (if Doorstep Delivery) */}
            {deliveryType === "doorstep_delivery" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 pt-1"
              >
                <label className="block text-[11px] font-bold text-zinc-300 uppercase flex items-center gap-1.5">
                  <MapPin size={13} className="text-amber-400" />
                  <span>{isAm ? "የማድረሻ አድራሻ (ቦታ)" : "Delivery Destination Address"}</span>
                </label>
                <input
                  type="text"
                  placeholder={isAm ? "ለምሳሌ፡ ቦሌ ሜድሃኔአለም፣ ካዛንቺስ..." : "e.g. Bole Medhanialem, Kazanchis, Old Airport"}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition shadow-inner"
                />

                {/* Quick location chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {POPULAR_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setDeliveryAddress(loc)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition ${
                        deliveryAddress === loc
                          ? "bg-amber-500 text-black font-bold border-amber-400"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1 flex items-center gap-1.5">
                  <User size={13} className="text-amber-400" />
                  <span>{isAm ? "ሙሉ ስም" : "Customer Full Name"}</span>
                </label>
                <input
                  type="text"
                  placeholder={isAm ? "ሙሉ ስምዎን ያስገቡ" : "Abebe Kebede"}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1 flex items-center gap-1.5">
                  <Phone size={13} className="text-amber-400" />
                  <span>{isAm ? "ስልክ ቁጥር" : "Phone Number"}</span>
                </label>
                <input
                  type="tel"
                  placeholder="0911 223 344"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition shadow-inner font-mono"
                />
              </div>
            </div>

            {/* Assurance footer note */}
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
              <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0" />
              <span>
                {isAm
                  ? "የ AC Wale Cars አስተዳደር ጥያቄዎ እንደደረሰው ወዲያውኑ በማረጋገጥ መኪናውን ያዘጋጃል።"
                  : "Instant notification dispatched directly to AC Wale Cars management desk."}
              </span>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !isRateValid}
                className="w-full py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>{isAm ? "በማረጋገጥ ላይ..." : "Processing Booking..."}</span>
                  </>
                ) : !isRateValid ? (
                  <span>{isAm ? "የኪራይ ዋጋ አልተወሰነም" : "Daily Rate Not Set"}</span>
                ) : (
                  <>
                    <span>{isAm ? "መኪናውን ይከራዩ (ኪራይ ያረጋግጡ)" : "Confirm Rental Booking"}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
