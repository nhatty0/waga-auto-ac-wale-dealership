"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, FileText } from "lucide-react";
import PrintModalShell from "@/components/print/PrintModalShell";
import ScaledPreview from "@/components/print/ScaledPreview";
import { VehicleHandover, HandoverBelonging } from "@/types";

// The sheet is max-w-3xl (768px); preview it at that width.
const HANDOVER_SHEET_PX = 768;

interface HandoverPrintModalProps {
  handover: VehicleHandover;
  onClose: () => void;
}

export default function HandoverPrintModal({ handover, onClose }: HandoverPrintModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePrint = () => {
    const printArea = document.getElementById("handover-print-area");
    if (!printArea) {
      window.print();
      return;
    }

    // Remove existing print iframe if any
    const existing = document.getElementById("handover-print-iframe");
    if (existing) {
      existing.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.id = "handover-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    // Grab all external stylesheets from parent document (Tailwind CSS)
    const linkTags = Array.from(document.querySelectorAll("link[rel='stylesheet']"))
      .map((link) => link.outerHTML)
      .join("\n");

    doc.open();
    doc.write(`
<!DOCTYPE html>
<html lang="am">
  <head>
    <meta charset="utf-8">
    <title>AC WALE MARKET - የመኪና መረከቢያ ፎርም (${handover.contract_number})</title>
    ${linkTags}
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background-color: #ffffff !important;
        color: #000000 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
        width: 100% !important;
        height: auto !important;
      }
      #handover-print-area {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        page-break-inside: avoid !important;
      }
      /* Standalone layout utility classes ensuring perfect print output even if CSS links lag */
      .flex { display: flex !important; }
      .grid { display: grid !important; }
      .items-center { align-items: center !important; }
      .items-start { align-items: flex-start !important; }
      .items-end { align-items: flex-end !important; }
      .justify-between { justify-content: space-between !important; }
      .justify-center { justify-content: center !important; }
      .flex-col { flex-direction: column !important; }
      .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
      .gap-1 { gap: 0.25rem !important; }
      .gap-1\\.5 { gap: 0.375rem !important; }
      .gap-2 { gap: 0.5rem !important; }
      .gap-2\\.5 { gap: 0.625rem !important; }
      .gap-3 { gap: 0.75rem !important; }
      .gap-8 { gap: 2rem !important; }
      .w-full { width: 100% !important; }
      .shrink-0 { flex-shrink: 0 !important; }
      .text-center { text-align: center !important; }
      .text-right { text-align: right !important; }
      .text-left { text-align: left !important; }
      .text-justify { text-align: justify !important; }
      .font-bold { font-weight: 700 !important; }
      .font-black { font-weight: 900 !important; }
      .font-semibold { font-weight: 600 !important; }
      .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
      .underline { text-decoration: underline !important; }
      .break-all { word-break: break-all !important; }
      .border { border: 1px solid #71717a !important; }
      .border-2 { border: 2px solid #000000 !important; }
      .border-b { border-bottom: 1px solid #a1a1aa !important; }
      .border-b-2 { border-bottom: 2px solid #000000 !important; }
      .border-t { border-top: 1px solid #a1a1aa !important; }
      .border-t-2 { border-top: 2px solid #000000 !important; }
      .border-black { border-color: #000000 !important; }
      .border-zinc-200 { border-color: #e4e4e7 !important; }
      .border-zinc-300 { border-color: #d4d4d8 !important; }
      .border-zinc-400 { border-color: #a1a1aa !important; }
      .border-zinc-800 { border-color: #27272a !important; }
      .border-collapse { border-collapse: collapse !important; }
      table { width: 100% !important; border-collapse: collapse !important; }
      th, td { border: 1px solid #000000 !important; padding: 2.5px 6px !important; }
      th { background-color: #e4e4e7 !important; }
      .bg-white { background-color: #ffffff !important; }
      .bg-zinc-50 { background-color: #fafafa !important; }
      .bg-zinc-100 { background-color: #f4f4f5 !important; }
      .bg-zinc-200 { background-color: #e4e4e7 !important; }
      .text-black { color: #000000 !important; }
      .text-zinc-500 { color: #71717a !important; }
      .text-zinc-600 { color: #52525b !important; }
      .text-zinc-700 { color: #3f3f46 !important; }
      .text-zinc-800 { color: #27272a !important; }
      .text-zinc-900 { color: #18181b !important; }
      .text-amber-700 { color: #b45309 !important; }
      .text-amber-800 { color: #92400e !important; }
      .rounded { border-radius: 0.25rem !important; }
      .rounded-lg { border-radius: 0.5rem !important; }
      img { max-width: 100% !important; height: auto !important; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; }
      }
    </style>
  </head>
  <body>
    ${printArea.outerHTML}
  </body>
</html>
`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Iframe print invocation error:", err);
        window.print();
      }
    }, 300);
  };

  const handleCopyNumber = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(handover.contract_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Parse belongings
  let belongingsList: HandoverBelonging[] = [];
  try {
    if (handover.belongings_json) {
      belongingsList = JSON.parse(handover.belongings_json);
    }
  } catch (e) {
    belongingsList = [];
  }

  const rawDate = handover.date ? new Date(handover.date) : new Date();
  const formattedDate = rawDate.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const formattedDateOnly = rawDate.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const agreedPriceFormatted =
    handover.agreed_selling_price != null && handover.agreed_selling_price > 0
      ? `${Number(handover.agreed_selling_price).toLocaleString()} ብር`
      : "በስምምነት";

  const PrintableSheet = () => (
    <div
      id="handover-print-area"
      className="bg-white text-black w-full max-w-3xl h-auto min-h-fit p-8 rounded-lg shadow-md font-sans leading-normal"
      style={{
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* 1. Official AC WALE MARKET Top Header */}
      <div className="flex items-center justify-between border-b-2 border-black pt-2 pb-2.5 mb-2.5">
        <div className="flex items-center gap-3">
          <img
            src="/ac-wale-logo.png"
            alt="AC WALE MARKET"
            className="h-12 w-12 sm:h-14 sm:w-14 object-contain bg-black rounded-lg border border-zinc-400 shrink-0"
          />
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-black leading-none">
              AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ)
            </h1>
            <p className="text-[11px] sm:text-xs font-bold text-amber-800 tracking-wide mt-1">
              ቅንጡ እና ዘመናዊ መኪኖች መሸጫ፣ መግዣ እና ማከራያ ድርጅት
            </p>
            <p className="text-[10px] text-zinc-600 font-medium mt-0.5">
              22 አዋራሪስ ሆቴል ጀርባ | ስልክ: +251 911 646 628 / +251 900 061 300
            </p>
          </div>
        </div>

        {/* Right-aligned Contract Number & Date */}
        <div className="text-right flex flex-col items-end leading-tight shrink-0">
          <span className="text-xs sm:text-sm font-mono font-black text-black bg-zinc-100 border border-black px-2.5 py-1 rounded">
            ቁጥር: {handover.contract_number}
          </span>
          <span className="text-[11px] sm:text-xs text-zinc-800 font-bold mt-1">
            ቀን: {formattedDate}
          </span>
        </div>
      </div>

      {/* 2. Centered Title */}
      <div className="text-center mb-2.5">
        <h2 className="text-lg sm:text-xl font-black text-black underline underline-offset-4 decoration-2">
          የመኪና መረከቢያ ፎርም
        </h2>
        <span className="text-[10px] font-bold text-zinc-600 tracking-wider uppercase">
          (Vehicle Handover & Consignment Agreement Form)
        </span>
      </div>

      {/* 3. Fixed Receiver Line */}
      <div className="bg-zinc-50 border border-zinc-400 p-2 rounded-lg mb-2 text-xs leading-snug text-zinc-900">
        <span className="font-black text-black">ተሽከርካሪውን የሚረከበው ድርጅት ስም፡</span>{" "}
        <span className="font-bold">ኤሲ ዋለ መኪና መሸጫ</span> |{" "}
        <span className="font-black text-black">የሥራ አስኪያጅ ስም፡</span>{" "}
        <span className="font-bold">አቶ አስቻለው ዋለ</span> |{" "}
        <span className="font-black text-black">አድራሻ፡</span>{" "}
        <span className="font-semibold">አ/አ፣ ክ/ከ ቦሌ፣ ወረዳ 04፣ የቤት ቁ. አዲስ</span>
      </div>

      {/* 4. Owner Name & Address Block */}
      <div className="border border-zinc-400 p-2.5 rounded-lg mb-2 text-xs space-y-1 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="font-bold text-zinc-800">የአስረካቢው /ባለንብረት/ ሙሉ ስም፡</span>{" "}
            <span className="font-black text-black underline decoration-dotted">
              {handover.owner_full_name}
            </span>
          </div>
          <div>
            <span className="font-bold text-zinc-800">ስልክ ቁጥር፡</span>{" "}
            <span className="font-mono font-bold text-black underline decoration-dotted">
              {handover.owner_phone}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-200">
          <div>
            <span className="font-bold text-zinc-800">ክ/ከተማ፡</span>{" "}
            <span className="font-semibold">{handover.owner_subcity || "—"}</span>
          </div>
          <div>
            <span className="font-bold text-zinc-800">ወረዳ፡</span>{" "}
            <span className="font-semibold">{handover.owner_woreda || "—"}</span>
          </div>
          <div>
            <span className="font-bold text-zinc-800">የቤት ቁጥር፡</span>{" "}
            <span className="font-semibold">{handover.owner_house_no || "—"}</span>
          </div>
        </div>
      </div>

      {/* 5. The 7 Vehicle Specification Fields */}
      <div className="border border-zinc-400 p-2.5 rounded-lg mb-2 text-xs bg-zinc-50/60">
        <h3 className="font-black text-zinc-900 border-b border-zinc-300 pb-1 mb-1.5 uppercase text-[10px] tracking-wider">
          የተሽከርካሪው ዝርዝር መረጃ (Vehicle Specifications)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">1. ዓይነት (Type/Make):</span>
            <span className="font-black text-black text-xs">{handover.vehicle_type}</span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">2. የተመረተበት ዓ.ም (Year):</span>
            <span className="font-bold text-black text-xs">{handover.manufacture_year || "—"}</span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">3. ሰሌዳ ቁጥር (Plate No):</span>
            <span className="font-mono font-black text-black bg-zinc-200 px-1.5 py-0.5 rounded text-xs">
              {handover.plate_number}
            </span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">4. ቀለም (Color):</span>
            <span className="font-bold text-black text-xs">{handover.color || "—"}</span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">5. የቻንሲ ቁጥር (Chassis No):</span>
            <span className="font-mono font-bold text-black text-[11px] break-all">
              {handover.chassis_number || "—"}
            </span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">6. የሞተር ቁጥር (Engine No):</span>
            <span className="font-mono font-bold text-black text-[11px] break-all">
              {handover.engine_number || "—"}
            </span>
          </div>
          <div>
            <span className="font-bold text-zinc-700 block text-[10px]">7. የፈረስ ጉልበት (HP):</span>
            <span className="font-bold text-black text-xs">{handover.horsepower || "—"}</span>
          </div>
        </div>
      </div>

      {/* 6. Bordered Table for Belongings in Car */}
      <div className="mb-2">
        <h3 className="font-black text-zinc-900 text-xs mb-1 flex items-center justify-between">
          <span>መኪናው ላይ ያለ ንብረት (Belongings & Accessories Included)</span>
          <span className="text-[10px] text-zinc-600 font-normal">
            ጠቅላላ ንብረቶች፡ {belongingsList.length}
          </span>
        </h3>
        <table className="w-full border-collapse border border-black text-xs text-black">
          <thead>
            <tr className="bg-zinc-200 border-b border-black text-center font-black">
              <th className="border border-black py-1 px-2 w-12 text-center">ተ.ቁ</th>
              <th className="border border-black py-1 px-3 text-left">የንብረቱ ስም እና መግለጫ (Item Description)</th>
              <th className="border border-black py-1 px-2 w-24 text-center">ብዛት (Qty)</th>
            </tr>
          </thead>
          <tbody>
            {belongingsList.length > 0 ? (
              belongingsList.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-400">
                  <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                    {idx + 1}
                  </td>
                  <td className="border border-black py-1 px-3 font-semibold">{item.item_name}</td>
                  <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                    {item.quantity}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="border border-black py-1.5 text-center text-zinc-500 italic">
                  ምንም ዓይነት ተጨማሪ ንብረት አልተመዘገበም (None recorded)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Agreement Paragraph */}
      <div className="border border-zinc-800 bg-zinc-50 p-2.5 rounded-lg mb-2.5 text-xs leading-relaxed text-zinc-900">
        <p className="font-medium text-justify">
          እኔ ስሜ ከላይ የተጠቀሰው አስረካቢ{" "}
          <span className="font-black text-black underline">{handover.owner_full_name}</span> በዛሬው ቀን{" "}
          <span className="font-black text-black underline">{formattedDateOnly}</span> ከላይ በዝርዝር የተጠቀሰውን
          ተሽከርካሪ ከነሙሉ ይዞታውና ንብረቶቹ ለኤሲ ዋለ መኪና መሸጫ ድርጅት በብር{" "}
          <span className="font-black text-black underline">{agreedPriceFormatted}</span> እንዲሸጥልኝ ያስረከብኩ
          ሲሆን፣ የተሽከርካሪው ሽያጭ ሲጠናቀቅ ኮሚሽን / ለአስረካቢ የሚሰጠው የተጣራ ክፍያ{" "}
          <span className="font-black text-black underline">
            {handover.commission_or_net_payout || "በስምምነቱ መሠረት"}
          </span>{" "}
          እንደሆነ ተስማምተን ይህን የመረከቢያ ውል በሙሉ ፈቃዳችን ፈርመናል።
        </p>
      </div>

      {/* 8. Bottom Signature Blocks */}
      <div className="grid grid-cols-2 gap-8 pt-2.5 border-t-2 border-black mt-2 text-xs">
        <div className="space-y-1">
          <p className="font-black text-black text-xs sm:text-sm">የአስረካቢ ስምና ፊርማ (Handed Over By):</p>
          <p className="text-zinc-800 text-[11px] sm:text-xs">
            ስም፡ <span className="font-black underline">{handover.owner_full_name}</span>
          </p>
          <div className="pt-6 border-b-2 border-black w-44 sm:w-52" />
          <p className="text-[10px] text-zinc-500">ፊርማ / Signature</p>
        </div>
        <div className="space-y-1 text-right flex flex-col items-end">
          <p className="font-black text-black text-xs sm:text-sm">የተረካቢ ስምና ፊርማ (Received By):</p>
          <p className="text-zinc-800 text-[11px] sm:text-xs">
            ስም፡ <span className="font-black underline">ኤሲ ዋለ መኪና መሸጫ (አስቻለው ዋለ)</span>
          </p>
          <div className="pt-6 border-b-2 border-black w-44 sm:w-52" />
          <p className="text-[10px] text-zinc-500">ፊርማና ማህተም / Seal & Signature</p>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;

  return createPortal(
    <PrintModalShell
      title={
        <>
          <span className="sm:hidden">የመኪና መረከቢያ ውል</span>
          <span className="hidden sm:inline">የመኪና መረከቢያ ውል (Vehicle Handover Form)</span>
        </>
      }
      badge={
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
          {handover.contract_number}
        </span>
      }
      description="A4 ወረቀት ላይ ለማተም ወይም ፒዲኤፍ ለማስቀመጥ ተዘጋጅቷል።"
      icon={
        <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
          <FileText size={18} />
        </span>
      }
      onClose={onClose}
      onPrint={handlePrint}
      printTitle="ውል አትም (Print Contract)"
      maxWidthClass="sm:max-w-4xl"
      headerActions={
        <button
          type="button"
          onClick={handleCopyNumber}
          className="hidden min-[400px]:flex h-11 w-11 sm:w-auto shrink-0 sm:px-3 items-center justify-center text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition gap-1.5"
          title={`Copy Contract Number (${handover.contract_number})`}
          aria-label="Copy Contract Number"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? "ተቀድቷል" : "ቁጥር ቅዳ"}</span>
        </button>
      }
    >
      {/* Screen preview. #handover-print-area itself is untouched (its outerHTML is what prints);
          only the wrapper around it is scaled. */}
      <div className="p-3 sm:p-6 bg-zinc-950/80">
        <ScaledPreview designWidth={HANDOVER_SHEET_PX}>
          <PrintableSheet />
        </ScaledPreview>
      </div>
    </PrintModalShell>,
    document.body
  );
}
