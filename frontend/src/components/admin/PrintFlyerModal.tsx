"use client";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Phone, MessageSquare } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Vehicle } from "@/types";
import { resolveImageUrl } from "@/lib/images";
import { getFlyerPlateSpec, isNewSeriesPlate } from "@/lib/plates";

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

  // Telegram deep-link for instant mobile inquiry
  const telegramInquiryUrl = `https://t.me/EliteMotorsAlert_bot?text=${encodeURIComponent(
    `Hello Elite Motors! I am at your showroom viewing the ${vehicle.year} ${vehicle.make} ${vehicle.model} (Plate: ${vehicle.plate_status || "Code 2"}). I would like more information or to request a test drive.`
  )}`;

  const plateSpec = getFlyerPlateSpec(vehicle.plate_status);

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

  // Reusable Flyer Sheet Component
  const FlyerSheet = ({ isForPrint = false }: { isForPrint?: boolean }) => (
    <div
      className={`w-full bg-white text-zinc-950 font-sans flex flex-col justify-between ${
        isForPrint
          ? "p-4 sm:p-6"
          : "max-w-[650px] rounded-xl p-6 sm:p-8 shadow-2xl border border-zinc-200"
      }`}
      style={{
        minHeight: isForPrint ? "auto" : "820px",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      {/* TOP HEADER: Dealership Identity */}
      <div className="border-b-2 border-zinc-900 pb-3 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-black text-amber-400 font-black flex items-center justify-center text-xl shadow-md border-2 border-amber-400">
            E
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-black leading-none">
              ELITE MOTORS ADDIS
            </h1>
            <p className="text-[11px] font-bold text-zinc-600 tracking-wider uppercase mt-0.5">
              Addis Ababa Premier Digital Showroom
            </p>
          </div>
        </div>

        <div className="text-right text-xs space-y-0.5 font-semibold text-zinc-800">
          <div className="flex items-center justify-end gap-1.5 text-black font-bold">
            <Phone size={13} className="text-zinc-900" />
            <span>+251 918 032 065</span>
          </div>
          <div className="flex items-center justify-end gap-1.5 text-zinc-700">
            <MessageSquare size={13} className="text-sky-600" />
            <span>@EliteMotorsAlert_bot</span>
          </div>
          <p className="text-[10px] text-zinc-500">Bole • Addis Ababa, Ethiopia</p>
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
              ★ {vehicle.condition}
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
        {vehicle.has_bank_loan && vehicle.cash_price && vehicle.bank_loan_amount ? (
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
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-white border-2 border-emerald-600 rounded-lg p-2 text-center">
                <span className="text-[10px] font-bold text-zinc-600 block uppercase">
                  CASH UPFRONT / በእጅ የሚከፈል
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 block mt-0.5">
                  {vehicle.cash_price.toLocaleString()} ETB
                </span>
              </div>
              <div className="bg-white border-2 border-sky-600 rounded-lg p-2 text-center">
                <span className="text-[10px] font-bold text-zinc-600 block uppercase">
                  REMAINING LOAN / የባንክ ዕዳ
                </span>
                <span className="text-xl sm:text-2xl font-black text-sky-700 block mt-0.5">
                  {vehicle.bank_loan_amount.toLocaleString()} ETB
                </span>
              </div>
            </div>
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
        <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">
            Mileage / የተጓዘው
          </span>
          <span className="text-sm font-black text-black mt-0.5 block">
            {(vehicle.mileage ?? 0).toLocaleString()} km
          </span>
        </div>

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
            📱 SCAN QR CODE FOR INSTANT DETAILS & VIDEO TOUR
          </p>
          <p className="text-[11px] text-zinc-600 leading-snug max-w-sm">
            Scan QR Code on your phone for full vehicle photo gallery, video tour, or appointment booking with our sales desk.
          </p>
          <div className="pt-0.5 flex items-center gap-2 text-[10px] font-bold text-zinc-800">
            <span>💬 Telegram: @EliteMotorsAlert_bot</span>
            <span>•</span>
            <span>📞 +251 918 032 065</span>
          </div>
        </div>

        {/* QR Code */}
        <div className="p-1.5 bg-white border-2 border-black rounded-xl shadow flex-shrink-0">
          <QRCodeSVG
            value={telegramInquiryUrl}
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overflow-y-auto print:hidden">
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[96vh] flex flex-col overflow-hidden text-white shadow-2xl">
          
          {/* Modal Screen Action Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 flex-shrink-0">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <Printer size={18} className="text-amber-400" />
                <span>Window Spec Sheet / Lot Flyer Generator</span>
              </h3>
              <p className="text-xs text-zinc-400">
                A4 Printable window flyer with photo, price highlights, specs, and instant Telegram QR code.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
              >
                <Printer size={15} />
                <span>{isPrinting ? "Preparing..." : "Print / Save as PDF (A4)"}</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white rounded-xl bg-zinc-800 hover:bg-zinc-700 transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Interactive Screen Preview Container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-900/40 flex justify-center">
            <FlyerSheet isForPrint={false} />
          </div>

        </div>
      </div>

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
