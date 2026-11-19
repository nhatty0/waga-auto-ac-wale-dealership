"use client";
import { formatMileage } from "@/lib/mileage";
import { useState, useRef } from "react";
import {
  X,
  Volume2,
  Fuel,
  Gauge,
  Cog,
  Calendar,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Phone,
  Share2,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  FileText,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import TelegramIcon from "@/components/TelegramIcon";
import VehicleActionBar from "@/components/VehicleActionBar";
import { SALES_PHONES, TELEGRAM_CHAT_URL } from "@/lib/contact";
import { openTelegramShare } from "@/lib/share";
import { Vehicle, Dealership } from "@/types";
//import { playEngineRev } from "@/lib/audio";
import { useLanguage } from "@/context/LanguageContext";
import { resolveImageUrl } from "@/lib/images";
import { getPlateLabel, getPlateBadgeClasses } from "@/lib/plates";

const Vehicle3DViewer = dynamic(
  () => import("@/components/showroom3d/Vehicle3DViewer"),
  { ssr: false }
);

const VehicleSpinViewer = dynamic(
  () => import("@/components/showroom3d/VehicleSpinViewer"),
  { ssr: false }
);

interface VehicleModalProps {
  vehicle: Vehicle;
  dealership?: Dealership | null;
  onClose: () => void;
  onBook: () => void;
}

export default function VehicleModal({
  vehicle,
  dealership,
  onClose,
  onBook,
}: VehicleModalProps) {
  const { lang, t } = useLanguage();
  const [currentImgIdx, setCurrentImgIdx] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- CURTAIN SHEET DRAG STATES ---
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const has3D = Boolean(vehicle.model_url);
  const hasSpin = Boolean(vehicle.spin_images && vehicle.spin_images.length >= 12);
  const [modalViewerMode, setModalViewerMode] = useState<"photos" | "3d" | "spin">(
    has3D ? "3d" : hasSpin ? "spin" : "photos"
  );

  const allImages =
    vehicle.images && vehicle.images.length > 0
      ? vehicle.images.map((img) => resolveImageUrl(img.image_url))
      : [
          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80",
        ];

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentImgIdx((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentImgIdx(
      (prev) => (prev - 1 + allImages.length) % allImages.length,
    );
  };
  const mileageLabel = formatMileage(vehicle.mileage);

  // const handleAudio = (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   setIsPlayingAudio(true);
  //   playEngineRev(
  //     (vehicle.fuel_type || "").toLowerCase() === "electric" ? "hybrid" : "v8",
  //   );
  //   setTimeout(() => setIsPlayingAudio(false), 1400);
  // };

  const getConditionLabel = (cond?: string) => {
    const lower = (cond || "").toLowerCase();
    if (lower === "brand new") return t.conditionBrandNew;
    if (lower === "slightly used") return t.conditionSlightlyUsed;
    if (lower === "excellent condition") return t.conditionExcellent;
    return t.conditionGood;
  };

  const generateFlyerText = () => {
    const isAm = lang === "am";
    const conditionText = getConditionLabel(vehicle.condition);

    const priceText = vehicle.price != null
      ? `${vehicle.price.toLocaleString()} ETB (${t.negotiable})`
      : isAm ? "ዋጋ በስልክ" : "Call for Price";

    // No mileage entered → leave the line out entirely.
    const mileageText = formatMileage(vehicle.mileage);

    const loanSplitText =
      vehicle.has_bank_loan && vehicle.cash_price && vehicle.bank_loan_amount
        ? isAm
          ? `\n🏦 *የክፍያ አማራጭ:* በእጅ ${vehicle.cash_price.toLocaleString()} ETB + ${vehicle.bank_loan_amount.toLocaleString()} ETB ባንክ (${vehicle.bank_name || "ባንክ"})\n`
          : `\n🏦 *Payment Split:* ${vehicle.cash_price.toLocaleString()} ETB Cash + ${vehicle.bank_loan_amount.toLocaleString()} ETB Bank Loan (${vehicle.bank_name || "Bank"})\n`
        : "";

    const plateText = getPlateLabel(vehicle.plate_status, isAm);

    if (isAm) {
      return (
        `🚗 *${vehicle.year} ${vehicle.make} ${vehicle.model}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 *ዋጋ:* ${priceText}\n` +
        loanSplitText +
        `📊 *ሁኔታ:* ${conditionText}\n` +
        `🏷️ *ሰሌዳ:* ${plateText}\n` +
        (mileageText ? `🛣️ *የተጓዘው:* ${mileageText}\n` : "") +
        `⛽ *ነዳጅ:* ${vehicle.fuel_type} | ⚙️ *ማርሽ:* ${vehicle.transmission}\n` +
        `🚙 *የቦዲ ዓይነት:* ${vehicle.body_type} | 🏎️ *ድራይቭ:* ${vehicle.drive_train || "FWD"}\n\n` +
        `📍 *ኤሲ ዋለ የመኪና መሸጫ (AC WALE MARKET) - 22 አዋራሪስ ሆቴል ጀርባ፣ አዲስ አበባ*\n` +
        `📞 *ስልክ:* +251 911 646 628 / +251 900 061 300\n` +
        `📧 *Email:* acwalecarmarket@gmail.com`
      );
    }

    return (
      `🚗 *${vehicle.year} ${vehicle.make} ${vehicle.model}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Price:* ${priceText}\n` +
      loanSplitText +
      `📊 *Condition:* ${conditionText}\n` +
      `🏷️ *Plate:* ${plateText}\n` +
      (mileageText ? `🛣️ *Mileage:* ${mileageText}\n` : "") +
      `⛽ *Fuel:* ${vehicle.fuel_type} | ⚙️ *Transmission:* ${vehicle.transmission}\n` +
      `🚙 *Body Type:* ${vehicle.body_type} | 🏎️ *Drivetrain:* ${vehicle.drive_train || "FWD"}\n\n` +
      `📍 *AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ) - 22 Behind Awraris Hotel, Addis Ababa*\n` +
      `📞 *Call:* +251 911 646 628 / +251 900 061 300\n` +
      `📧 *Email:* acwalecarmarket@gmail.com`
    );
  };

  const handleShareToTelegram = (e: React.MouseEvent) => {
    e.stopPropagation();
    openTelegramShare(vehicle, dealership?.name);
  };

  const handleCopySpecs = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(generateFlyerText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert("Could not copy to clipboard");
    }
  };

  // --- TOUCH / MOUSE CURTAIN DRAGGING LOGIC ---
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    currentYRef.current = clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    currentYRef.current = clientY;
    const deltaY = clientY - startYRef.current;

    if (isExpanded && deltaY > 0) {
      setDragOffset(deltaY);
    } else if (!isExpanded && deltaY < 0) {
      setDragOffset(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const deltaY = currentYRef.current - startYRef.current;

    if (!isExpanded && deltaY < -60) {
      setIsExpanded(true);
    } else if (isExpanded && deltaY > 60) {
      setIsExpanded(false);
    }
    setDragOffset(0);
  };

  return (
    <>
      {/* FULLSCREEN LIGHTBOX */}
      {isLightboxOpen && (
        <div
          onClick={() => setIsLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-6 select-none animate-in fade-in"
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-3 bg-zinc-800 text-white rounded-full hover:bg-zinc-700 z-50"
          >
            <X size={20} />
          </button>

          <div
            className="relative max-w-4xl max-h-[85vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={allImages[currentImgIdx]}
              alt="Vehicle preview"
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            {allImages.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 sm:left-4 p-3 rounded-full bg-black/70 text-white hover:bg-black transition"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 sm:right-4 p-3 rounded-full bg-black/70 text-white hover:bg-black transition"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>
          <p className="text-zinc-400 text-xs mt-3">
            {currentImgIdx + 1} / {allImages.length} • {lang === "am" ? "ለመመለስ የትም ይጫኑ" : "Click anywhere to return"}
          </p>
        </div>
      )}

      {/* MAIN VEHICLE DETAIL MODAL */}
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
        <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full max-w-xl h-[92dvh] sm:h-[88dvh] flex flex-col overflow-hidden text-white shadow-2xl relative">
          
          {/* ==================================================== */}
          {/* TOP IMAGE CAROUSEL / 3D / 360 SECTION */}
          {/* ==================================================== */}
          <div className="relative w-full h-[55%] bg-black flex-shrink-0 group overflow-hidden">
            {modalViewerMode === "3d" && vehicle.model_url ? (
              <Vehicle3DViewer
                modelUrl={vehicle.model_url}
                vehicleTitle={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                lang={lang}
              />
            ) : modalViewerMode === "spin" && vehicle.spin_images && vehicle.spin_images.length >= 12 ? (
              <VehicleSpinViewer
                spinImages={vehicle.spin_images}
                vehicleTitle={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                lang={lang}
                onOpenLightbox={() => setIsLightboxOpen(true)}
              />
            ) : (
              <>
                <img
                  src={allImages[currentImgIdx]}
                  alt={vehicle.model}
                  referrerPolicy="no-referrer"
                  onClick={() => setIsLightboxOpen(true)}
                  className="w-full h-full object-cover cursor-zoom-in transition duration-300"
                />

                {/* Carousel Previous / Next Arrows */}
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      aria-label={lang === "am" ? "ቀዳሚ ፎቶ" : "Previous photo"}
                      className="absolute left-2 top-[40%] -translate-y-1/2 h-11 w-11 flex items-center justify-center bg-black/65 backdrop-blur-md rounded-full text-white hover:bg-black transition opacity-90 sm:opacity-0 group-hover:opacity-100"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={nextImage}
                      aria-label={lang === "am" ? "ቀጣይ ፎቶ" : "Next photo"}
                      className="absolute right-2 top-[40%] -translate-y-1/2 h-11 w-11 flex items-center justify-center bg-black/65 backdrop-blur-md rounded-full text-white hover:bg-black transition opacity-90 sm:opacity-0 group-hover:opacity-100"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </>
            )}

            {/* Top Bar Floating Controls */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-1.5 pointer-events-auto">
                {(has3D || hasSpin) ? (
                  <div className="flex items-center gap-1 bg-black/75 backdrop-blur-md p-1 rounded-full border border-white/10">
                    <button
                      type="button"
                      onClick={() => setModalViewerMode("photos")}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                        modalViewerMode === "photos"
                          ? "bg-amber-500 text-black font-black"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Photos
                    </button>
                    {hasSpin && (
                      <button
                        type="button"
                        onClick={() => setModalViewerMode("spin")}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                          modalViewerMode === "spin"
                            ? "bg-amber-500 text-black font-black"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        360°
                      </button>
                    )}
                    {has3D && (
                      <button
                        type="button"
                        onClick={() => setModalViewerMode("3d")}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                          modalViewerMode === "3d"
                            ? "bg-amber-500 text-black font-black"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        3D
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="bg-black/65 backdrop-blur-md text-[11px] font-bold px-2.5 py-1 rounded-full text-zinc-300 border border-white/10">
                    {currentImgIdx + 1} / {allImages.length} {t.photos}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={() => setIsLightboxOpen(true)}
                  className="h-11 w-11 flex items-center justify-center bg-black/65 backdrop-blur-md rounded-full text-white hover:bg-black transition"
                  title="View Fullscreen"
                  aria-label={lang === "am" ? "ሙሉ ስክሪን" : "View fullscreen"}
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={onClose}
                  aria-label={lang === "am" ? "ዝጋ" : "Close"}
                  className="h-11 w-11 flex items-center justify-center bg-black/65 backdrop-blur-md rounded-full text-white hover:bg-black transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Floating Condition, Plate & Status Badges */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 pointer-events-none flex-wrap">
              <span
                className={`backdrop-blur-md text-[11px] font-bold px-3 py-1 rounded-full shadow-lg pointer-events-auto border ${
                  vehicle.condition === "Brand New"
                    ? "bg-amber-500/95 text-black border-amber-400"
                    : vehicle.condition === "Slightly Used"
                    ? "bg-emerald-500/90 text-black border-emerald-400"
                    : vehicle.condition === "Excellent Condition"
                    ? "bg-sky-500/90 text-black border-sky-400"
                    : "bg-black/80 text-zinc-200 border-zinc-700"
                }`}
              >
                ★ {getConditionLabel(vehicle.condition)}
              </span>

              {/* Plate Tag */}
              <span className={`backdrop-blur-md text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg pointer-events-auto border ${getPlateBadgeClasses(vehicle.plate_status)}`}>
                🏷️ {getPlateLabel(vehicle.plate_status, lang === "am")}
              </span>

              {vehicle.status !== "Available" && (
                <span
                  className={`backdrop-blur-md text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg pointer-events-auto border ${
                    vehicle.status === "Sold"
                      ? "bg-red-500/90 border-red-400 text-white"
                      : vehicle.status === "Reserved"
                      ? "bg-amber-500/90 border-amber-400 text-black"
                      : "bg-sky-500/90 border-sky-400 text-white"
                  }`}
                >
                  {vehicle.status === "Sold"
                    ? t.statusSold
                    : vehicle.status === "Reserved"
                    ? t.statusReserved
                    : t.statusInTransit}
                </span>
              )}
            </div>
          </div>

          {/* ==================================================== */}
          {/* DRAGGABLE CURTAIN SHEET */}
          {/* ==================================================== */}
          <div
            ref={sheetRef}
            style={{
              transform: isDragging
                ? `translateY(${dragOffset}px)`
                : undefined,
            }}
            className={`absolute inset-x-0 bottom-0 bg-zinc-950 border-t border-zinc-800 rounded-t-3xl shadow-2xl flex flex-col z-30 transition-all duration-300 ease-out ${
              isExpanded ? "top-3" : "top-[48%]"
            }`}
          >
            {/* DRAG HANDLE BAR */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleTouchStart}
              onMouseMove={handleTouchMove}
              onMouseUp={handleTouchEnd}
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full pt-3 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none hover:bg-zinc-900/40 transition rounded-t-3xl border-b border-zinc-800/60"
            >
              <div className="w-12 h-1.5 bg-zinc-600 group-hover:bg-amber-400 rounded-full mb-1.5 transition" />
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                {isExpanded ? (
                  <>
                    <span>{lang === "am" ? "ወደ ታች ሳብ (ፎቶዎችን እይ)" : "Pull Down to see photos"}</span>
                    <ChevronDown size={14} />
                  </>
                ) : (
                  <>
                    <span>{lang === "am" ? "ወደ ላይ ሳብ (ሙሉ መረጃ)" : "Pull Up for full description & specs"}</span>
                    <ChevronUp size={14} />
                  </>
                )}
              </div>
            </div>

            {/* CURTAIN BODY: SPECS & DETAILS */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Title, then price on its own line so it never wraps */}
              <div className="min-w-0">
                <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">
                  {vehicle.make}
                </span>
                <h2 className="text-xl font-black leading-snug break-words">
                  {vehicle.year} {vehicle.model}
                </h2>
                <p className="text-zinc-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>{vehicle.body_type}</span>
                  <span>•</span>
                  <span>{getConditionLabel(vehicle.condition)}</span>
                  <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${getPlateBadgeClasses(vehicle.plate_status)}`}>
                    🏷️ {getPlateLabel(vehicle.plate_status, lang === "am")}
                  </span>
                </p>
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  {vehicle.price != null ? (
                    <>
                      <span className="text-2xl font-black text-amber-400 tabular-nums whitespace-nowrap">
                        {vehicle.price.toLocaleString()} <span className="text-base">ETB</span>
                      </span>
                      <span className="text-[11px] font-semibold text-zinc-400 bg-white/[0.05] px-2 py-0.5 rounded-md">
                        {t.negotiable}
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-amber-400">
                      {lang === "am" ? "ዋጋ በስልክ" : "Call for Price"}
                    </span>
                  )}
                </div>
              </div>

              {/* Share / full page / copy: three equal icon buttons with short labels */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleShareToTelegram}
                  className="h-11 min-w-0 px-2 rounded-xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#45B6ED] hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  title={lang === "am" ? "በቴሌግራም አጋራ" : "Share on Telegram"}
                >
                  <TelegramIcon size={15} />
                  <span className="truncate">{lang === "am" ? "አጋራ" : "Share"}</span>
                </button>

                <Link
                  href={`/vehicles/${vehicle.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="h-11 min-w-0 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  title="Open Dedicated Vehicle Page"
                >
                  <ExternalLink size={15} />
                  <span className="truncate">{lang === "am" ? "ሙሉ ገጽ" : "Page"}</span>
                </Link>

                <button
                  onClick={handleCopySpecs}
                  title={t.copySpecs}
                  className={`h-11 min-w-0 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
                    copied
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span className="truncate">
                    {copied ? (lang === "am" ? "ተቀድቷል" : "Copied") : lang === "am" ? "ኮፒ" : "Copy"}
                  </span>
                </button>
              </div>

              {/* Full Description Box */}
              {vehicle.description && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <FileText size={15} />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {lang === "am" ? "የመኪናው ሙሉ መረጃ" : "Vehicle Overview & Description"}
                    </h4>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                    {vehicle.description}
                  </p>
                </div>
              )}

              {/* Quick Specs Matrix */}
              <div className={`grid ${mileageLabel ? "grid-cols-4" : "grid-cols-3"} gap-2 py-3 px-3 bg-zinc-900/60 rounded-2xl border border-zinc-800/80 text-center`}>
                {mileageLabel && (
                  <div className="flex flex-col items-center">
                    <Gauge size={15} className="text-zinc-400 mb-1" />
                    <span className="text-[10px] text-zinc-500">{t.mileage}</span>
                    <span className="text-xs font-bold text-zinc-200">{mileageLabel}</span>
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <Fuel size={15} className="text-zinc-400 mb-1" />
                  <span className="text-[10px] text-zinc-500">{t.fuel}</span>
                  <span className="text-xs font-bold text-zinc-200 truncate max-w-[65px]">
                    {vehicle.fuel_type}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <Cog size={15} className="text-zinc-400 mb-1" />
                  <span className="text-[10px] text-zinc-500">{t.gear}</span>
                  <span className="text-xs font-bold text-zinc-200 truncate max-w-[65px]">
                    {vehicle.transmission}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <Calendar size={15} className="text-zinc-400 mb-1" />
                  <span className="text-[10px] text-zinc-500">{t.drive}</span>
                  <span className="text-xs font-bold text-zinc-200">
                    {vehicle.drive_train || "FWD"}
                  </span>
                </div>
              </div>

              {/* BANK LOAN TRANSFER CARD (ONLY SHOWN IF LOAN EXISTS) */}
              {vehicle.has_bank_loan && vehicle.cash_price && vehicle.bank_loan_amount ? (
                <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/20 border border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      🏦 {lang === "am" ? "የባንክ ዕዳ ዝውውር" : "Bank Loan Transfer Available"}
                    </span>
                    {vehicle.bank_name ? (
                      <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {vehicle.bank_name} Bank
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-400 block font-medium">
                        {lang === "am" ? "በእጅ የሚከፈል (ቅድመ ክፍያ)" : "Cash Upfront"}
                      </span>
                      <span className="text-sm sm:text-base font-black text-emerald-400 block mt-0.5">
                        {vehicle.cash_price.toLocaleString()} ETB
                      </span>
                    </div>

                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-400 block font-medium">
                        {lang === "am" ? "የሚዞር የባንክ ዕዳ" : "Remaining Bank Loan"}
                      </span>
                      <span className="text-sm sm:text-base font-black text-sky-400 block mt-0.5">
                        {vehicle.bank_loan_amount.toLocaleString()} ETB
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-relaxed italic">
                    {lang === "am"
                      ? "ይህ መኪና የባንክ ዕዳ ስላለበት በእጅ የተጠቀሰውን ከፍለው የቀረውን ዕዳ በባንክ ስምዎ ማዞር ይችላሉ።"
                      : "Pay the upfront cash to drive away; the remaining balance transfers under your name at the bank."}
                  </p>
                </div>
              ) : null}

            </div>

            {/* STICKY BOTTOM ACTION BAR: Call (chooser for 2 lines) + Telegram + Book a Visit */}
            <VehicleActionBar
              lang={lang}
              phones={SALES_PHONES}
              telegramUrl={TELEGRAM_CHAT_URL}
              isSold={vehicle.status === "Sold"}
              findSimilarLabel={t.findSimilar}
              onBook={() => {
                onClose();
                onBook();
              }}
              className="border-t border-zinc-800 bg-zinc-950 flex-shrink-0"
            />

          </div>
        </div>
      </div>
    </>
  );
}