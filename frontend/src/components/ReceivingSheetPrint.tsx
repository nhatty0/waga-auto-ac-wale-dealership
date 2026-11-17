"use client";
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Calendar } from "lucide-react";
import { LotIntake } from "@/types";

interface ReceivingSheetPrintProps {
  intakes: LotIntake[];
  onClose: () => void;
  dealershipName?: string;
}

export default function ReceivingSheetPrint({
  intakes,
  onClose,
  dealershipName = "AC WALE MARKET",
}: ReceivingSheetPrintProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [showAllDates, setShowAllDates] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Filter records based on selected date or show all
  const filteredIntakes = useMemo(() => {
    if (showAllDates) return intakes;
    return intakes.filter((item) => {
      if (!item.received_date) return false;
      const itemDate = new Date(item.received_date).toISOString().split("T")[0];
      return itemDate === selectedDate;
    });
  }, [intakes, selectedDate, showAllDates]);

  // Statistics for the sheet
  const inLotCount = filteredIntakes.filter((i) => i.is_in_lot).length;
  const releasedCount = filteredIntakes.filter((i) => !i.is_in_lot).length;

  const formatPrice = (val?: number | null) => {
    if (val === null || val === undefined || val === 0) return "-";
    return Number(val).toLocaleString() + " ብር";
  };

  const formattedDisplayDate = showAllDates
    ? "ሁሉም የተመዘገቡ ቀናት (All Records)"
    : new Date(selectedDate).toLocaleDateString("en-GB", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  // Reusable component representing the physical Form 1 sheet
  // Dynamically expands with table content, solid white background, dark text, visible borders
  const SheetContent = ({ isPrint = false }: { isPrint?: boolean }) => (
    <div
      className={`mx-auto bg-white text-black w-full h-auto p-6 rounded-lg shadow-lg font-sans ${
        isPrint ? "shadow-none border-0" : "border border-gray-400"
      }`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Form 1 Official Header */}
      <div className="border-b-2 border-black pb-3 mb-4">
        <div className="flex justify-between items-center mb-3">
          <img
            src="/ac-wale-banner.png"
            alt="AC WALE MARKET Banner"
            className="h-14 sm:h-16 w-auto max-w-[65%] object-contain rounded"
          />
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-black text-white text-xs font-mono font-bold rounded">
              FORM-01: ርክክብ
            </span>
            <p className="text-xs font-semibold text-gray-900 mt-1">
              የሰነድ ቀን: {formattedDisplayDate}
            </p>
          </div>
        </div>

        <div className="text-center mt-2">
          <h2 className="text-xl font-extrabold uppercase tracking-widest text-gray-900 underline underline-offset-4 decoration-2">
            የተሽከርካሪ ርክክብ ሰነድ (Vehicle Receiving Ledger)
          </h2>
          <p className="text-xs font-bold text-gray-700 tracking-wide uppercase mt-0.5">
            AC ዋሌ መኪና ገበያ • የተሽከርካሪ ግቢ ቁጥጥርና ርክክብ ክፍል
          </p>
        </div>
      </div>

      {/* Summary Mini Bar */}
      <div className="flex flex-wrap items-center justify-between text-xs font-semibold bg-gray-100 p-2.5 border border-gray-400 rounded mb-4 text-gray-900">
        <div>ጠቅላላ የተረከብናቸው: <span className="font-bold text-black">{filteredIntakes.length}</span></div>
        <div>በግቢው ውስጥ ያሉ: <span className="font-bold text-emerald-700">{inLotCount}</span></div>
        <div>ወጪ የሆኑ (የወጡ): <span className="font-bold text-amber-700">{releasedCount}</span></div>
        <div>የተዘጋጀበት ሰዓት: <span className="font-mono text-gray-900">{new Date().toLocaleTimeString()}</span></div>
      </div>

      {/* Tabular Ledger matching Form 1 Columns */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse border border-gray-400 text-[11px] leading-tight text-left text-gray-900">
          <thead>
            <tr className="bg-gray-200 text-gray-900 border-b border-gray-400 font-bold text-center">
              <th className="border border-gray-400 p-1.5 w-7">ተ.ቁ</th>
              <th className="border border-gray-400 p-1.5">የመኪናው ዓይነት</th>
              <th className="border border-gray-400 p-1.5 w-14">ዓ.ም</th>
              <th className="border border-gray-400 p-1.5 whitespace-nowrap">የሰሌዳ ቁጥር</th>
              <th className="border border-gray-400 p-1.5">መነሻ በእጅ</th>
              <th className="border border-gray-400 p-1.5">መነሻ ባንክ</th>
              <th className="border border-gray-400 p-1.5">የመጨረሻ በእጅ</th>
              <th className="border border-gray-400 p-1.5">የመጨረሻ ባንክ</th>
              <th className="border border-gray-400 p-1.5">የባለቤት ስም</th>
              <th className="border border-gray-400 p-1.5">የባለቤት ስልክ</th>
              <th className="border border-gray-400 p-1.5">የተረካቢው ስም</th>
              <th className="border border-gray-400 p-1.5">ማስታወሻ</th>
              <th className="border border-gray-400 p-1.5 w-16 text-center">ሁኔታ</th>
            </tr>
          </thead>
          <tbody>
            {filteredIntakes.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-8 text-gray-500 font-medium">
                  በዚህ ቀን የተመዘገበ የተሽከርካሪ ርክክብ አልተገኘም።
                </td>
              </tr>
            ) : (
              filteredIntakes.map((item, idx) => (
                <tr key={item.id} className="border-b border-gray-400 hover:bg-gray-50 text-gray-900">
                  <td className="border border-gray-400 p-1.5 text-center font-bold text-gray-900">{idx + 1}</td>
                  <td className="border border-gray-400 p-1.5 font-bold text-gray-900">{item.vehicle_name}</td>
                  <td className="border border-gray-400 p-1.5 text-center font-mono text-gray-900">{item.year_of_production || "-"}</td>
                  <td className="border border-gray-400 p-1.5 font-black font-mono text-gray-900">{item.plate_number}</td>
                  <td className="border border-gray-400 p-1.5 text-right font-mono text-gray-900">{formatPrice(item.primary_cash_price)}</td>
                  <td className="border border-gray-400 p-1.5 text-right font-mono text-gray-900">{formatPrice(item.primary_bank_price)}</td>
                  <td className="border border-gray-400 p-1.5 text-right font-mono font-bold text-gray-900">{formatPrice(item.final_cash_price)}</td>
                  <td className="border border-gray-400 p-1.5 text-right font-mono text-gray-900">{formatPrice(item.final_bank_price)}</td>
                  <td className="border border-gray-400 p-1.5 font-medium text-gray-900">{item.owner_name}</td>
                  <td className="border border-gray-400 p-1.5 font-mono text-gray-900">{item.owner_phone}</td>
                  <td className="border border-gray-400 p-1.5 text-gray-900">{item.received_by_name || "-"}</td>
                  <td className="border border-gray-400 p-1.5 text-[10px] text-gray-700 italic max-w-[120px] truncate">
                    {item.remark || "-"}
                  </td>
                  <td className="border border-gray-400 p-1 text-center font-bold text-[10px]">
                    {item.is_in_lot ? (
                      <span className="text-emerald-700 font-semibold">በግቢው</span>
                    ) : (
                      <span className="text-gray-600 font-semibold">ወጥቷል</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form 1 Official Signatures Footer */}
      <div className="mt-8 pt-6 border-t-2 border-black grid grid-cols-3 gap-6 text-xs text-gray-900">
        <div className="space-y-6">
          <p className="font-bold text-gray-900">የተረካቢ ፊርማ (Receiver Signature):</p>
          <div className="border-b border-black pb-1 text-transparent select-none">____________________</div>
          <p className="text-[10px] text-gray-600">ስም: ____________________________</p>
        </div>

        <div className="space-y-6">
          <p className="font-bold text-gray-900">ያረጋገጠው ኃላፊ (Supervisor Signature):</p>
          <div className="border-b border-black pb-1 text-transparent select-none">____________________</div>
          <p className="text-[10px] text-gray-600">ስም: ____________________________</p>
        </div>

        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-400 p-3 rounded text-center bg-gray-50/50">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
            ማህተም (OFFICIAL STAMP)
          </span>
          <span className="text-[9px] text-gray-500 font-semibold mt-6">{dealershipName}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Global Print Stylesheet for Vehicle Receiving Sheet (A4 Landscape) */}
      <style jsx global>{`
        @media print {
          body > *:not(#printable-receiving-sheet-root) {
            display: none !important;
          }
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
          #printable-receiving-sheet-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 9999999 !important;
          }
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
        }
      `}</style>

      {/* Screen Modal Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto print:hidden">
        <div className="relative w-full max-w-6xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <img
                src="/ac-wale-logo.png"
                alt="AC WALE"
                className="w-8 h-8 rounded-lg object-contain bg-black border border-zinc-800 shrink-0"
              />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>የዕለቱ የተሽከርካሪ ርክክብ ሰነድ (Receiving Sheet)</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  ለቀኑ ርክክብ እና ለኃላፊ ፊርማ የሚዘጋጅ ይፋዊ የA4 ማተሚያ ሰነድ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-800/80 hover:bg-zinc-800 transition"
                title="Close modal"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Date Filter Controls */}
          <div className="p-3 sm:px-5 bg-zinc-900/40 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium">
                <Calendar size={14} className="text-amber-500" />
                <span>ቀን ይምረጡ:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setShowAllDates(false);
                  }}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={() => setShowAllDates(!showAllDates)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                  showAllDates
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                }`}
              >
                {showAllDates ? "የተመረጠ ቀን ብቻ አሳይ" : "ሁሉንም ቀናት አሳይ (All)"}
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              የተገኙ መኪኖች: <span className="font-bold text-white">{filteredIntakes.length}</span>
            </div>
          </div>

          {/* Modal Preview Body with vertical scroll ONLY on outer dark modal wrapper */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[75vh] bg-zinc-950 flex justify-center w-full">
            <SheetContent isPrint={false} />
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between shrink-0">
            <span className="text-xs text-zinc-500">
              * A4 Landscape ማተሚያ ቅርጸት የተዘጋጀ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
              >
                ዝጋ (Close)
              </button>
              <button
                onClick={handlePrint}
                className="px-5 py-2 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95"
              >
                <Printer size={15} />
                <span>ሰነዱን አትም (Print / Save A4 PDF)</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Dedicated Portal for Printing Directly into document.body */}
      {mounted &&
        createPortal(
          <div id="printable-receiving-sheet-root" className="hidden print:block">
            <SheetContent isPrint={true} />
          </div>,
          document.body
        )}
    </>
  );
}
