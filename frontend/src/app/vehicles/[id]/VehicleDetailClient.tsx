"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Gauge,
  Fuel,
  Cog,
  Car,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  Share2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Phone,
  CarFront,
  Building2,
  Box,
  RotateCw,
  Camera,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Vehicle } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import BookingModal from "@/components/BookingModal";
import TelegramIcon from "@/components/TelegramIcon";
import { openTelegramShare, formatTelegramVehicleCaption } from "@/lib/share";
import { resolveImageUrl } from "@/lib/images";
import { getPlateLabel, getPlateBadgeClasses } from "@/lib/plates";

const Vehicle3DViewer = dynamic(
  () => import("@/components/showroom3d/Vehicle3DViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-[16/10] w-full bg-zinc-950 rounded-2xl animate-pulse border border-zinc-800 flex items-center justify-center text-xs text-zinc-500">
        Loading 3D Viewer...
      </div>
    ),
  }
);

const VehicleSpinViewer = dynamic(
  () => import("@/components/showroom3d/VehicleSpinViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-[16/10] w-full bg-zinc-950 rounded-2xl animate-pulse border border-zinc-800 flex items-center justify-center text-xs text-zinc-500">
        Loading 360 Spin...
      </div>
    ),
  }
);

interface VehicleDetailClientProps {
  vehicle: Vehicle;
}

export default function VehicleDetailClient({ vehicle }: VehicleDetailClientProps) {
  const { lang, t } = useLanguage();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const has3D = Boolean(vehicle.model_url);
  const hasSpin = Boolean(vehicle.spin_images && vehicle.spin_images.length >= 12);

  type ViewerMode = "photos" | "3d" | "spin";
  const defaultMode: ViewerMode = has3D ? "3d" : hasSpin ? "spin" : "photos";
  const [viewerMode, setViewerMode] = useState<ViewerMode>(defaultMode);

  const images =
    vehicle.images && vehicle.images.length > 0
      ? vehicle.images.map((img) => resolveImageUrl(img.image_url))
      : [
          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80",
        ];

  const dealership = vehicle.dealership;
  const dealerSlug = dealership?.slug || "elite-motors";
  const dealerName = dealership?.name || "Elite Motors Addis";
  const dealerPhone = dealership?.phone_number || "+251 905 445 544";

  const downPaymentVal = vehicle.cash_price ?? vehicle.down_payment;
  const bankLoanVal = vehicle.bank_loan_amount ?? vehicle.bank_loan;
  const plateText = getPlateLabel(vehicle.plate_status || vehicle.plate_code, lang === "am");

  const nextImage = () => {
    setActiveImageIdx((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setActiveImageIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleCopyLink = async () => {
    if (typeof window !== "undefined") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Clipboard copy failed", err);
      }
    }
  };

  const handleShareTelegram = () => {
    openTelegramShare(vehicle, dealerName);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20 selection:bg-amber-500 selection:text-black">
      {/* Top Header / Sticky Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <Link
            href={`/?dealer=${dealerSlug}`}
            className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-amber-400 transition group"
          >
            <ArrowLeft
              size={16}
              className="group-hover:-translate-x-1 transition-transform"
            />
            <span>
              {lang === "am" ? "ወደ ሙሉ ሾውሩም ተመለስ" : "Back to Showroom"}
            </span>
          </Link>

          {/* Dealership Pill Badge */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full">
            {dealership?.logo_url ? (
              <img
                src={resolveImageUrl(dealership.logo_url)}
                alt={dealerName}
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <CarFront size={14} className="text-amber-400" />
            )}
            <span className="text-xs font-bold text-zinc-200 truncate max-w-[150px] sm:max-w-[200px]">
              {dealerName}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Breadcrumb & Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="text-amber-400 font-bold">{vehicle.make}</span>
            <span>/</span>
            <span>{vehicle.model}</span>
            <span>/</span>
            <span className="text-zinc-500">{vehicle.year}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-medium text-zinc-300 transition"
              title="Copy Direct Link"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-emerald-400">
                    {lang === "am" ? "ተገልብጧል" : "Copied"}
                  </span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>{lang === "am" ? "ሊንክ ቅዳ" : "Copy Link"}</span>
                </>
              )}
            </button>

            <button
              onClick={handleShareTelegram}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/40 hover:border-[#229ED9] rounded-xl text-xs font-bold text-[#45B6ED] transition shadow-sm"
              title="Share instantly on Telegram"
            >
              <TelegramIcon size={15} />
              <span>{lang === "am" ? "ቴሌግራም አጋራ" : "Share Telegram"}</span>
            </button>
          </div>
        </div>

        {/* Hero Section: Photo Carousel & Key Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Photos / 3D / 360 Column (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            {/* Multi-Format Mode Switcher (if 3D or 360 exist) */}
            {(has3D || hasSpin) && (
              <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setViewerMode("photos")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                    viewerMode === "photos"
                      ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Camera size={14} />
                  <span>{lang === "am" ? "ፎቶዎች" : "Photos"} ({images.length})</span>
                </button>

                {hasSpin && (
                  <button
                    type="button"
                    onClick={() => setViewerMode("spin")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                      viewerMode === "spin"
                        ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <RotateCw size={14} />
                    <span>{lang === "am" ? "360° እይታ" : "360° Spin"} ({vehicle.spin_images?.length})</span>
                  </button>
                )}

                {has3D && (
                  <button
                    type="button"
                    onClick={() => setViewerMode("3d")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                      viewerMode === "3d"
                        ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Box size={14} />
                    <span>{lang === "am" ? "3D ሞዴል" : "3D Model"}</span>
                  </button>
                )}
              </div>
            )}

            {/* Viewer Stage Area */}
            {viewerMode === "3d" && vehicle.model_url ? (
              <Vehicle3DViewer
                modelUrl={vehicle.model_url}
                vehicleTitle={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                lang={lang}
              />
            ) : viewerMode === "spin" && vehicle.spin_images && vehicle.spin_images.length >= 12 ? (
              <VehicleSpinViewer
                spinImages={vehicle.spin_images}
                vehicleTitle={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                lang={lang}
                onOpenLightbox={() => setIsLightboxOpen(true)}
              />
            ) : (
              <>
                {/* Main Stage Image */}
                <div className="relative aspect-[16/10] sm:aspect-[16/10] w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800/80 group">
                  <img
                    src={images[activeImageIdx]}
                    alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />

                  {/* Prev / Next Carousel Controls */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        aria-label="Previous photo"
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        onClick={nextImage}
                        aria-label="Next photo"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  )}

                  {/* Badges on Main Photo */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border shadow-lg backdrop-blur-md ${
                        vehicle.condition === "Brand New"
                          ? "bg-amber-500 text-black border-amber-400"
                          : vehicle.condition === "Slightly Used"
                          ? "bg-emerald-500 text-black border-emerald-400"
                          : "bg-black/80 text-zinc-200 border-zinc-700"
                      }`}
                    >
                      ★ {vehicle.condition}
                    </span>

                    <span className="bg-black/80 backdrop-blur-md text-amber-400 border border-amber-500/30 text-[11px] font-bold px-3 py-1 rounded-full shadow-lg">
                      🏷️ {plateText}
                    </span>
                  </div>

                  {/* Counter & Zoom Button */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <span className="bg-black/80 backdrop-blur-md text-zinc-300 text-xs px-2.5 py-1 rounded-md border border-white/10">
                      {activeImageIdx + 1} / {images.length}
                    </span>
                    <button
                      onClick={() => setIsLightboxOpen(true)}
                      aria-label="Zoom Photo"
                      className="p-1.5 bg-black/80 hover:bg-black text-zinc-300 hover:text-white backdrop-blur-md rounded-md border border-white/10 transition"
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Strip */}
                {images.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIdx(idx)}
                        className={`relative w-20 h-14 rounded-xl overflow-hidden flex-shrink-0 border-2 transition ${
                          activeImageIdx === idx
                            ? "border-amber-400 scale-95 shadow-md"
                            : "border-zinc-800 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Core Info & Actions Column (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Title & Dealer Attribution */}
            <div>
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                {vehicle.make}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
                {vehicle.year} {vehicle.model}
              </h1>
              <p className="text-zinc-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{vehicle.fuel_type} • {vehicle.transmission} • {vehicle.body_type}</span>
                <span>•</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${getPlateBadgeClasses(vehicle.plate_status)}`}>
                  🏷️ {plateText}
                </span>
              </p>
            </div>

            {/* Price Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 space-y-3">
              <span className="text-xs text-zinc-400 block font-medium">
                {lang === "am" ? "ዋጋ (ድርድር አለው)" : "Total Price (Negotiable)"}
              </span>
              <div className="text-3xl font-black text-amber-400 tracking-tight">
                {vehicle.price != null
                  ? `${vehicle.price.toLocaleString()} ETB`
                  : lang === "am"
                  ? "ዋጋ በስልክ"
                  : "Call for Price"}
              </div>

              {/* Financial Split Box (Upfront Cash vs Bank Loan) */}
              {vehicle.has_bank_loan && (
                <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-3">
                  <div className="bg-black/60 rounded-xl p-2.5 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block uppercase font-semibold">
                      {lang === "am" ? "በእጅ የሚከፈል" : "Upfront Cash"}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {downPaymentVal != null && downPaymentVal > 0
                        ? `${downPaymentVal.toLocaleString()} ETB`
                        : "ሙሉ ክፍያ"}
                    </span>
                  </div>

                  <div className="bg-black/60 rounded-xl p-2.5 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block uppercase font-semibold">
                      {lang === "am" ? "የባንክ ዕዳ" : "Bank Loan"}
                    </span>
                    <span className="text-sm font-bold text-sky-400">
                      {bankLoanVal != null && bankLoanVal > 0
                        ? `${bankLoanVal.toLocaleString()} ETB`
                        : "የለም"}
                    </span>
                    {vehicle.bank_name && (
                      <span className="text-[10px] text-zinc-500 block truncate">
                        {vehicle.bank_name}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Main Action CTAs */}
            <div className="space-y-2.5">
              <button
                onClick={() => setIsBookingOpen(true)}
                className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Calendar size={18} />
                <span>
                  {lang === "am"
                    ? "ቀጠሮ ያዙ (Book Viewing / Test Drive)"
                    : "Book Viewing / Test Drive"}
                </span>
              </button>

              <button
                onClick={handleShareTelegram}
                className="w-full py-3 px-4 bg-[#229ED9] hover:bg-[#1E8DC2] text-white font-bold text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2"
              >
                <TelegramIcon size={18} />
                <span>
                  {lang === "am"
                    ? "በቴሌግራም አጋራ (Share with Buyer / Channel)"
                    : "Share on Telegram"}
                </span>
              </button>
            </div>

            {/* Dealership Contact Pill Card */}
            <div className="p-3.5 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {dealership?.logo_url ? (
                  <img
                    src={resolveImageUrl(dealership.logo_url)}
                    alt={dealerName}
                    className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400">
                    <CarFront size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">
                    {dealerName}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {dealerPhone}
                  </p>
                </div>
              </div>

              <a
                href={`tel:${dealerPhone.replace(/\s+/g, "")}`}
                className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-amber-400 rounded-xl transition flex-shrink-0"
                title="Call Dealership"
              >
                <Phone size={16} />
              </a>
            </div>
          </div>
        </div>

        {/* Technical Specs & Vehicle Features Grid */}
        <section className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Car size={16} className="text-amber-400" />
            <span>
              {lang === "am" ? "ቴክኒካል መረጃዎች" : "Technical Specifications"}
            </span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "የተጓዘው ርቀት" : "Mileage"}
              </span>
              <span className="font-bold text-white flex items-center gap-1.5">
                <Gauge size={14} className="text-amber-400" />
                {(vehicle.mileage ?? 0).toLocaleString()} km
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "ነዳጅ" : "Fuel Type"}
              </span>
              <span className="font-bold text-white flex items-center gap-1.5">
                <Fuel size={14} className="text-amber-400" />
                {vehicle.fuel_type}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "ማርሽ" : "Transmission"}
              </span>
              <span className="font-bold text-white flex items-center gap-1.5">
                <Cog size={14} className="text-amber-400" />
                {vehicle.transmission}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "የቦዲ ዓይነት" : "Body Type"}
              </span>
              <span className="font-bold text-white flex items-center gap-1.5">
                <Car size={14} className="text-amber-400" />
                {vehicle.body_type}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "ድራይቭ" : "Drivetrain"}
              </span>
              <span className="font-bold text-white">
                {vehicle.drive_train || "FWD"}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "የሞተር መጠን" : "Engine Size"}
              </span>
              <span className="font-bold text-white">
                {vehicle.engine_size || "Standard"}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "ሰሌዳ" : "Plate Status"}
              </span>
              <span className="font-bold text-amber-400">
                {plateText}
              </span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
              <span className="text-zinc-500 block mb-1">
                {lang === "am" ? "የጉምሩክ ሁኔታ" : "Customs"}
              </span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck size={14} />
                {vehicle.customs_cleared
                  ? lang === "am"
                    ? "ቀረጥ የተከፈለ"
                    : "Cleared"
                  : lang === "am"
                  ? "ቀረጥ ያልተከፈለ"
                  : "Pending"}
              </span>
            </div>
          </div>

          {/* Description */}
          {vehicle.description && (
            <div className="pt-3 border-t border-zinc-800 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
              <h4 className="text-xs font-semibold text-zinc-400 mb-1">
                {lang === "am" ? "ተጨማሪ መግለጫ" : "Description & Seller Notes"}
              </h4>
              <p className="bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/60 font-mono text-zinc-300">
                {vehicle.description}
              </p>
            </div>
          )}
        </section>

        {/* Bottom Back Button Link */}
        <div className="text-center pt-4">
          <Link
            href={`/?dealer=${dealerSlug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-amber-400 rounded-xl transition shadow-md"
          >
            <ArrowLeft size={16} />
            <span>
              {lang === "am"
                ? `← የ${dealerName} ሙሉ ሾውሩምን እይ`
                : `← View ${dealerName}'s Full Showroom`}
            </span>
          </Link>
        </div>
      </main>

      {/* Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition"
          >
            ✕
          </button>
          <img
            src={images[activeImageIdx]}
            alt="Fullscreen view"
            className="max-h-[85vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Booking Modal */}
      {isBookingOpen && (
        <BookingModal
          vehicle={vehicle}
          dealership={dealership}
          onClose={() => setIsBookingOpen(false)}
          onSuccess={() => setIsBookingOpen(false)}
        />
      )}
    </div>
  );
}
