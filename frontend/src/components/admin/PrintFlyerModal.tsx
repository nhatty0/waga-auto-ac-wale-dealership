"use client";
import { formatMileage } from "@/lib/mileage";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Printer, Phone } from "lucide-react";
import PrintModalShell from "@/components/print/PrintModalShell";
import ScaledPreview, { A4_PORTRAIT_PX } from "@/components/print/ScaledPreview";
import { QRCodeSVG } from "qrcode.react";
import { Vehicle } from "@/types";
import { resolveImageUrl } from "@/lib/images";
import { getFlyerPlateSpec, isNewSeriesPlate } from "@/lib/plates";
import { getPriceInfo, getSplitParts } from "@/lib/price";

interface PrintFlyerModalProps {
  vehicle: Vehicle;
  onClose: () => void;
}

export default function PrintFlyerModal({ vehicle, onClose }: PrintFlyerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const rawCoverImg = resolveImageUrl(
    vehicle.images?.[0]?.image_url,
    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1000&q=80"
  );

  // Instant mobile inquiry or digital showroom link
  const inquiryQrUrl = typeof window !== "undefined" && window.location.origin
    ? `${window.location.origin}/?car=${vehicle.id}`
    : "tel:+251911646628";

  const plateSpec = getFlyerPlateSpec(vehicle.plate_status);
  const priceInfo = getPriceInfo(vehicle);
  const { cash: splitCash, bank: splitBank } = getSplitParts(vehicle);

  useEffect(() => {
    setMounted(true);

    // Pre-convert vehicle image to Base64 so it is embedded directly in memory
    // This prevents any network/print race condition where the image prints blank.
    let isCurrent = true;
    const convertToBase64 = async () => {
      try {
        const response = await fetch(rawCoverImg);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isCurrent && typeof reader.result === "string") {
            setBase64Image(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("Base64 image conversion fallback to raw URL:", err);
      }
    };

    if (rawCoverImg) {
      convertToBase64();
    }

    return () => {
      isCurrent = false;
    };
  }, [rawCoverImg]);

  const activeImage = base64Image || rawCoverImg;

  const handlePrint = async () => {
    setIsPrinting(true);
    // Allow any pending DOM paint or image decoding to finalize before invoking print
    try {
      const imgElements = document.querySelectorAll(".flyer-vehicle-img");
      for (const img of Array.from(imgElements)) {
        if (img instanceof HTMLImageElement && !img.complete) {
          await img.decode();
        }
      }
    } catch (e) {
      console.log("Image decode ready", e);
    }

    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  const getConditionLabel = (cond?: string) => {
    const lower = (cond || "").toLowerCase().trim();
    if (lower === "brand new") return "አዲስ / ዜሮ ኪ.ሜ (Brand New)";
    if (lower === "slightly used") return "በጥቂቱ ያገለገለ (Slightly Used)";
    if (lower === "excellent condition") return "በጣም ጥሩ ይዞታ (Excellent Condition)";
    return "ጥሩ ይዞታ (Good Condition)";
  };

  // Reusable Flyer Sheet Component
  const FlyerSheet = ({ isForPrint = false }: { isForPrint?: boolean }) => (
    <div
      className={`w-full bg-white text-zinc-950 font-sans flex flex-col justify-between ${
        isForPrint
          ? "p-4 sm:p-6"
          : "rounded-xl p-8 shadow-2xl border border-zinc-200" /* preview: laid out at true A4 width, then scaled */
      }`}
      style={{
        minHeight: isForPrint ? "auto" : `${A4_PORTRAIT_PX * 1.414}px`,
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      {/* TOP HEADER: AC WALE MARKET Identity */}
      <div className="border-b-2 border-zinc-900 pb-3 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/ac-wale-logo.png"
            alt="AC WALE MARKET Icon"
            className="h-14 sm:h-16 w-14 sm:w-16 rounded-xl object-contain flex-shrink-0 bg-black border border-zinc-800"
          />
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-black leading-none">
              AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ)
            </h1>
            <p className="text-[12px] font-bold text-amber-600 tracking-wide mt-1">
              ቅንጡ እና ዘመናዊ መኪኖች መሸጫ እና ማከራያ
            </p>
          </div>
        </div>

        <div className="text-right text-xs space-y-0.5 font-semibold text-zinc-800">
          <div className="flex items-center justify-end gap-1.5 text-black font-bold">
            <Phone size={13} className="text-amber-600" />
            <a href="tel:+251911646628" className="hover:underline">+251 911 646 628</a>
          </div>
          <div className="flex items-center justify-end gap-1.5 text-zinc-900 font-bold">
            <Phone size={13} className="text-zinc-700" />
            <a href="tel:+251900061300" className="hover:underline">+251 900 061 300</a>
          </div>
          <div className="text-[11px] text-zinc-700 font-medium">
            <a href="mailto:acwalecarmarket@gmail.com" className="hover:underline">acwalecarmarket@gmail.com</a>
          </div>
          <p className="text-[10px] text-zinc-700 font-bold">
            22 አዋራሪስ ሆቴል ጀርባ | Hayahulet, Behind Awraris Hotel
          </p>
        </div>
      </div>

      {/* VEHICLE TITLE & MAIN PHOTO */}
      <div className="space-y-2.5 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
              {vehicle.make}
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-black leading-tight">
              {vehicle.year} {vehicle.model}
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              className={`text-xs font-black px-3 py-1 rounded-md uppercase tracking-wider ${
                isNewSeriesPlate(vehicle.plate_status)
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-500/50"
                  : "bg-black text-amber-400"
              }`}
            >
              {plateSpec.am} / {plateSpec.en}
            </span>
            <span className="bg-zinc-100 border border-zinc-300 text-zinc-700 text-[10px] font-bold px-2 py-0.5 rounded">
              ★ {getConditionLabel(vehicle.condition)}
            </span>
          </div>
        </div>

        <div className="w-full h-56 sm:h-64 rounded-xl overflow-hidden bg-zinc-100 border-2 border-zinc-900 relative">
          <img
            src={activeImage}
            alt={vehicle.model}
            crossOrigin="anonymous"
            className="flyer-vehicle-img w-full h-full object-cover"
          />
        </div>
      </div>

      {/* BIG FINANCIAL HIGHLIGHTS */}
      <div className="mb-3">
        {(vehicle.has_bank_loan && vehicle.cash_price && vehicle.bank_loan_amount) || priceInfo.kind === "split" ? (
          <div className="border-2 border-black rounded-xl p-3 bg-zinc-50 space-y-2">
            <div className="flex items-center justify-between border-b border-zinc-300 pb-1">
              <span className="text-xs font-black tracking-wider uppercase text-black">
                🏦 BANK LOAN TRANSFER DEAL / የባንክ ዕዳ ዝውውር
              </span>
              {vehicle.bank_name && (
                <span className="text-[11px] font-bold bg-amber-100 border border-amber-300 text-amber-900 px-2 py-0.5 rounded">
                  {vehicle.bank_name} Bank
                </span>
              )}
            </div>
            <div className={`grid ${splitCash != null && splitBank != null ? "grid-cols-2" : "grid-cols-1"} gap-3 pt-1`}>
              {splitCash != null && (
              <div className="bg-white border-2 border-emerald-600 rounded-lg p-2 text-center">
                <span className="text-[10px] font-bold text-zinc-600 block uppercase">
                  CASH UPFRONT / በእጅ የሚከፈል
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 block mt-0.5">
                  {splitCash.toLocaleString("en-US")} ETB
                </span>
              </div>
              )}
              {splitBank != null && (
              <div className="bg-white border-2 border-sky-600 rounded-lg p-2 text-center">
                <span className="text-[10px] font-bold text-zinc-600 block uppercase">
                  REMAINING LOAN / የባንክ ዕዳ
                </span>
                <span className="text-xl sm:text-2xl font-black text-sky-700 block mt-0.5">
                  {splitBank.toLocaleString("en-US")} ETB
                </span>
              </div>
              )}
            </div>
            {priceInfo.kind === "split" && priceInfo.total != null && (
              <div className="text-center text-xs font-bold text-zinc-700 pt-0.5">
                Total ≈ {priceInfo.total.toLocaleString("en-US")} ETB / ጠቅላላ
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-black rounded-xl p-3 bg-zinc-50 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 uppercase block">
                TOTAL PRICE / ጠቅላላ ዋጋ
              </span>
              <span className="text-2xl sm:text-3xl font-black text-black block">
                {vehicle.price != null
                  ? `${vehicle.price.toLocaleString()} ETB`
                  : "Call for Price / ዋጋ በስልክ"}
              </span>
            </div>
            <span className="text-xs font-black bg-black text-white px-3 py-1.5 rounded-lg uppercase tracking-wider">
              Negotiable / ድርድር አለው
            </span>
          </div>
        )}
      </div>

      {/* KEY SPECS GRID */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        {/* Mileage tile only when the admin entered a value (0 included) */}
        {formatMileage(vehicle.mileage) && (
          <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">
              Mileage / የተጓዘው
            </span>
            <span className="text-sm font-black text-black mt-0.5 block">
              {formatMileage(vehicle.mileage)}
            </span>
          </div>
        )}

        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Fuel / ነዳጅ
          </span>
          <span className="text-sm font-black text-black mt-0.5 block truncate">
            {vehicle.fuel_type}
          </span>
        </div>

        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Transmission / ማርሽ
          </span>
          <span className="text-sm font-black text-black mt-0.5 block truncate">
            {vehicle.transmission}
          </span>
        </div>

        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Body Type / የቦዲ ዓይነት
          </span>
          <span className="text-sm font-black text-black mt-0.5 block truncate">
            {vehicle.body_type}
          </span>
        </div>

        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Drivetrain / ድራይቭ
          </span>
          <span className="text-sm font-black text-black mt-0.5 block">
            {vehicle.drive_train || "FWD"}
          </span>
        </div>

        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Engine / ሞተር
          </span>
          <span className="text-sm font-black text-black mt-0.5 block truncate">
            {vehicle.engine_size || "Standard"}
          </span>
        </div>
      </div>

      {/* DESCRIPTION EXCERPT (if available) */}
      {vehicle.description && (
        <div className="border border-zinc-200 bg-zinc-50 rounded-xl p-2.5 mb-3">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">
            Features & Options Overview / ዋና ዋና መረጃዎች
          </span>
          <p className="text-[11px] text-zinc-700 leading-relaxed line-clamp-3">
            {vehicle.description}
          </p>
        </div>
      )}

      {/* FOOTER & QR CODE SECTION */}
      <div className="border-t-2 border-zinc-900 pt-2.5 flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-xs font-black text-black tracking-tight">
            📱 SCAN QR CODE FOR INSTANT DETAILS & BOOKING
          </p>
          <p className="text-[11px] text-zinc-600 leading-snug max-w-sm">
            Scan QR Code on your phone for the full vehicle photo gallery, or call our sales desk to book an in-person visit.
          </p>
          <div className="pt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-zinc-800">
            <span>📞 +251 911 646 628</span>
            <span>•</span>
            <span>📞 +251 900 061 300</span>
            <span>•</span>
            <span>📧 acwalecarmarket@gmail.com</span>
            <span>•</span>
            <span>📍 22 አዋራሪስ ሆቴል ጀርባ • Addis Ababa</span>
          </div>
        </div>

        {/* QR Code */}
        <div className="p-1.5 bg-white border-2 border-black rounded-xl shadow flex-shrink-0">
          <QRCodeSVG
            value={inquiryQrUrl}
            size={88}
            level="H"
            includeMargin={false}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Bulletproof Global Print Styles */}
      <style jsx global>{`
        @media print {
          /* 1. Hide the entire screen UI, modals, backdrop, and body contents */
          body > *:not(#printable-lot-flyer-root) {
            display: none !important;
          }

          /* 2. Configure body for pristine white print */
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 3. The dedicated printable root container */
          #printable-lot-flyer-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 9999999 !important;
          }

          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      {/* Screen Modal Overlay (Only visible on screen, never during print) */}
      <PrintModalShell
        title={
          <>
            <span className="sm:hidden">Lot Flyer</span>
            <span className="hidden sm:inline">Window Spec Sheet / Lot Flyer Generator</span>
          </>
        }
        description="A4 Printable window flyer with photo, price highlights, specs, and instant Telegram QR code."
        icon={<Printer size={18} className="text-amber-400" />}
        onClose={onClose}
        onPrint={handlePrint}
        printing={isPrinting}
        printTitle="Print / Save as PDF (A4)"
        maxWidthClass="sm:max-w-3xl"
      >
        {/* Screen preview: true A4 width, scaled to fit */}
        <div className="p-3 sm:p-6 bg-zinc-900/40">
          <ScaledPreview designWidth={A4_PORTRAIT_PX}>
            <FlyerSheet isForPrint={false} />
          </ScaledPreview>
        </div>
      </PrintModalShell>

      {/* Dedicated Portal for Printing directly into document.body */}
      {mounted &&
        createPortal(
          <div id="printable-lot-flyer-root" className="hidden print:block">
            <FlyerSheet isForPrint={true} />
          </div>,
          document.body
        )}
    </>
  );
}
