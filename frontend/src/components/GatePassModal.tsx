"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import PrintModalShell from "@/components/print/PrintModalShell";
import ScaledPreview from "@/components/print/ScaledPreview";

import { GatePass } from "@/types";

// 98mm slip at 96dpi (screen preview width only)
const SLIP_PX = Math.ceil((98 / 25.4) * 96);

interface GatePassModalProps {
  pass: GatePass;
  vehicleName?: string;
  onClose: () => void;
}

export default function GatePassModal({ pass, vehicleName, onClose }: GatePassModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopySlip = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(pass.slip_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const formattedDate = pass.date
    ? new Date(pass.date).toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleString();

  // Compact Quarter-A4 (width: 98mm; height: 135mm;) Form 2 Slip
  const SlipContent = ({ isPrint = false }: { isPrint?: boolean }) => (
    <div
      className={`box-border ${
        isPrint
          ? "border-r-2 border-b-2 border-dashed border-gray-400 pr-2 pb-2 inline-block"
          : "mx-auto"
      }`}
      style={
        isPrint
          ? {
              width: "102mm",
              height: "139mm",
              boxSizing: "border-box",
            }
          : undefined
      }
    >
      <div
        className={`bg-white text-black font-sans select-none border-2 border-black p-3 leading-tight box-border flex flex-col justify-between ${
          isPrint ? "shadow-none" : "rounded-lg shadow-xl"
        }`}
        style={{
          fontFamily: "'Inter', sans-serif",
          width: "98mm",
          maxWidth: "98mm",
          height: "135mm",
          maxHeight: "135mm",
          boxSizing: "border-box",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        {/* Top row: "AC WALE MARKET" + "መኪና መውጫ" on the left; "ቁጥር: [slip_number]" and "ቀን: [date]" stacked cleanly on the right */}
        <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1">
          <div className="flex items-center gap-1.5">
            <img
              src="/ac-wale-logo.png"
              alt="AC WALE"
              className="w-7 h-7 rounded object-contain bg-black shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-wide uppercase text-black leading-none">
                AC WALE MARKET
              </span>
              <span className="text-[10px] font-black text-black uppercase mt-0.5 tracking-wider">
                መኪና መውጫ
              </span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end leading-tight">
            <span className="text-xs font-mono font-bold text-black">
              ቁጥር: {pass.slip_number}
            </span>
            <span className="text-[10px] text-zinc-700 font-medium">
              ቀን: {formattedDate}
            </span>
          </div>
        </div>

        {/* Compact 5-row grid */}
        <div className="space-y-1.5 my-1 text-xs leading-tight">
          {/* 1. የሹፌሩ ስም */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold text-black whitespace-nowrap min-w-[90px]">
              የሹፌሩ ስም:
            </span>
            <span className="flex-1 text-[13px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
              {pass.driver_name}
            </span>
          </div>

          {/* 2. የሰሌዳ ቁጥር */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold text-black whitespace-nowrap min-w-[90px]">
              የሰሌዳ ቁጥር:
            </span>
            <span className="flex-1 text-[13px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 flex items-baseline justify-between gap-1 overflow-hidden">
              <span className="font-mono">{pass.plate_number}</span>
              {vehicleName && (
                <span className="text-[11px] font-semibold text-zinc-700 truncate font-sans">
                  ({vehicleName})
                </span>
              )}
            </span>
          </div>

          {/* 3. የመውጣት ምክንያት */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold text-black whitespace-nowrap min-w-[90px]">
              የመውጣት ምክንያት:
            </span>
            <span className="flex-1 text-[13px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
              {pass.release_reason}
            </span>
          </div>

          {/* 4. እንዲወጣ የፈቀደው */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold text-black whitespace-nowrap min-w-[90px]">
              እንዲወጣ የፈቀደው:
            </span>
            <span className="flex-1 text-[13px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
              {pass.authorized_by}
            </span>
          </div>

          {/* 5. ፊርማ */}
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-black whitespace-nowrap min-w-[90px]">
              ፊርማ:
            </span>
            <span className="flex-1 border-b border-dotted border-black pb-0.5 px-1 text-transparent select-none">
              ______________________________
            </span>
          </div>
        </div>

        {/* Bottom footer line inside the same box */}
        <div className="mt-1.5 pt-1 border-t border-black flex items-center justify-between text-[10px] text-zinc-700 leading-tight">
          <span className="font-semibold">
            ለመውጫ በር ጥበቃ ብቻ (Gate Security Only)
          </span>
          <span className="font-mono text-[9px] text-zinc-500 font-bold">
            AC-GATE-PASS
          </span>
        </div>
      </div>

      {isPrint && (
        <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono pt-1 select-none pointer-events-none">
          <span className="flex items-center gap-1">
            ✂️ <span>መቁረጫ መስመር (Cut Line)</span>
          </span>
          <span>A4 Quarter Slip</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Global Print Stylesheet for Top-Left Corner Single Gate Pass Printing (A4 Portrait) */}
      <style jsx global>{`
        @media print {
          body > *:not(#printable-gate-pass-root) {
            display: none !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-gate-pass-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 5mm !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 9999999 !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Screen Modal (never printed: the portal below is what prints) */}
      <PrintModalShell
        title={
          <>
            <span className="sm:hidden">መኪና መውጫ ፈቃድ</span>
            <span className="hidden sm:inline">መኪና መውጫ ፈቃድ (Gate Pass)</span>
          </>
        }
        badge={
          <span className="text-xs font-mono font-normal text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800">
            {pass.slip_number}
          </span>
        }
        description="ተሽከርካሪው በሰላም ከግቢ እንዲወጣ የተሰጠ ይፋዊ ደረሰኝ"
        icon={
          <img
            src="/ac-wale-logo.png"
            alt="AC WALE"
            className="w-8 h-8 rounded-lg object-contain bg-black border border-zinc-800 shrink-0"
          />
        }
        onClose={onClose}
        onPrint={handlePrint}
        printTitle="ደረሰኝ አትም (Print Slip)"
        maxWidthClass="sm:max-w-md"
        footer={
          <button
            onClick={handleCopySlip}
            className="h-11 w-full sm:w-auto text-xs text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 px-3 rounded-xl bg-zinc-900 border border-zinc-800 transition"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? "የደረሰኝ ቁጥር ተቀድቷል" : `የደረሰኝ ቁጥር ቅዳ (Copy #${pass.slip_number})`}</span>
          </button>
        }
      >
        {/* Screen preview: true slip size (98mm), scaled to fit */}
        <div className="p-3 sm:p-6 bg-zinc-900/30">
          <ScaledPreview designWidth={SLIP_PX}>
            <SlipContent isPrint={false} />
          </ScaledPreview>
        </div>
      </PrintModalShell>

      {/* Dedicated Portal for Printing Directly into document.body */}
      {mounted &&
        createPortal(
          <div id="printable-gate-pass-root" className="hidden print:block">
            <SlipContent isPrint={true} />
          </div>,
          document.body
        )}
    </>
  );
}
