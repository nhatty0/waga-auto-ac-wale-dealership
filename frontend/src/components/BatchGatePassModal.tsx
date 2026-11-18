"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import PrintModalShell from "@/components/print/PrintModalShell";
import ScaledPreview, { A4_PORTRAIT_PX } from "@/components/print/ScaledPreview";
import { GatePass, LotIntake, User } from "@/types";

interface BatchGatePassModalProps {
  selectedIntakes: LotIntake[];
  currentUser?: User | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

interface RowFormData {
  intakeId: number;
  driver_name: string;
  release_reason: string;
  authorized_by: string;
}

interface GeneratedItem {
  pass: GatePass;
  vehicleName: string;
}

const REASON_OPTIONS = [
  "የዕለት መልስ",
  "የተሸጠ (Sold)",
  "ለጥገና / እጥበት (Maintenance/Wash)",
  "የባለቤት ጥያቄ (Owner Request)",
  "ሙከራ / ቴስት ድራይቭ (Test Drive)",
  "ሌላ ምክንያት (Other)",
];

export default function BatchGatePassModal({
  selectedIntakes,
  currentUser,
  onClose,
  onSuccess,
}: BatchGatePassModalProps) {
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPasses, setGeneratedPasses] = useState<GeneratedItem[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  // Initialize form state for each car
  const [formData, setFormData] = useState<Record<number, RowFormData>>(() => {
    const initial: Record<number, RowFormData> = {};
    const defaultAuth = currentUser?.full_name || "Supervisor";
    selectedIntakes.slice(0, 4).forEach((item) => {
      initial[item.id] = {
        intakeId: item.id,
        driver_name: "",
        release_reason: "የዕለት መልስ",
        authorized_by: defaultAuth,
      };
    });
    return initial;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFieldChange = (
    intakeId: number,
    field: keyof Omit<RowFormData, "intakeId">,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [intakeId]: {
        ...prev[intakeId],
        [field]: value,
      },
    }));
  };

  const handleApplyRowOneToAll = () => {
    if (selectedIntakes.length <= 1) return;
    const firstId = selectedIntakes[0].id;
    const firstRow = formData[firstId];
    if (!firstRow) return;

    setFormData((prev) => {
      const updated = { ...prev };
      selectedIntakes.forEach((item) => {
        updated[item.id] = {
          ...updated[item.id],
          driver_name: firstRow.driver_name,
          release_reason: firstRow.release_reason,
          authorized_by: firstRow.authorized_by,
        };
      });
      return updated;
    });
  };

  const getAuthToken = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("token") || localStorage.getItem("dealer_token");
    }
    return null;
  };

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate driver names
    const carsToProcess = selectedIntakes.slice(0, 4);
    for (const car of carsToProcess) {
      const data = formData[car.id];
      if (!data?.driver_name?.trim()) {
        setError(`እባክዎ ለመኪና ${car.vehicle_name} (${car.plate_number}) የሹፌሩን ስም ያስገቡ።`);
        return;
      }
    }

    setSubmitting(true);
    const token = getAuthToken();
    const results: GeneratedItem[] = [];

    try {
      for (const car of carsToProcess) {
        const data = formData[car.id];
        const res = await fetch(`/api/admin/lot-intakes/${car.id}/gate-pass`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            driver_name: data.driver_name.trim(),
            plate_number: car.plate_number,
            release_reason: data.release_reason.trim(),
            authorized_by: data.authorized_by.trim() || "Supervisor",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.detail || `መኪና ${car.vehicle_name} (${car.plate_number}) መውጫ ማዘጋጀት አልተቻለም።`
          );
        }

        const passData: GatePass = await res.json();
        results.push({
          pass: passData,
          vehicleName: car.vehicle_name,
        });
      }

      setGeneratedPasses(results);
      setIsGenerated(true);
      if (onSuccess) {
        await onSuccess();
      }

      // Automatically open print dialog after short tick
      setTimeout(() => {
        window.print();
      }, 300);
    } catch (err: any) {
      setError(err?.message || "የጅምላ መውጫ ማዘጋጀት አልተቻለም። እባክዎ በድጋሚ ይሞክሩ።");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Render an individual slip for the 2x2 grid
  const renderSingleSlip = (
    item: GeneratedItem | null,
    index: number,
    isPrint: boolean = false
  ) => {
    if (!item) {
      // Empty quadrant
      return (
        <div
          key={`empty-${index}`}
          className="w-full h-full border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center p-4 text-center text-gray-400 select-none bg-gray-50/50"
          style={{ boxSizing: "border-box" }}
        >
          <span className="text-xl mb-1">✂️</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            ጥቅም ላይ ያልዋለ ክፍል (Unused Quadrant)
          </span>
          <span className="text-[10px] text-gray-400 mt-1">
            የቀረውን ሩብ ወረቀት ቆርጠው ለቀጣይ ይጠቀሙ
          </span>
        </div>
      );
    }

    const { pass, vehicleName } = item;
    const formattedDate = pass.date
      ? new Date(pass.date).toLocaleString("en-GB", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleString();

    return (
      <div
        key={`slip-${pass.id || index}`}
        className="w-full h-full relative"
        style={{
          boxSizing: "border-box",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        <div
          className="bg-white text-black font-sans select-none border-2 border-black p-2.5 leading-tight box-border flex flex-col justify-between h-full rounded-md shadow-sm"
          style={{
            fontFamily: "'Inter', sans-serif",
            boxSizing: "border-box",
            height: "100%",
          }}
        >
          {/* Top row */}
          <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1">
            <div className="flex items-center gap-1.5">
              <img
                src="/ac-wale-logo.png"
                alt="AC WALE"
                className="w-6 h-6 rounded object-contain bg-black shrink-0"
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
              <span className="text-[11px] font-mono font-bold text-black">
                ቁጥር: {pass.slip_number}
              </span>
              <span className="text-[9px] text-zinc-700 font-medium">
                ቀን: {formattedDate}
              </span>
            </div>
          </div>

          {/* Compact 5-row grid */}
          <div className="space-y-1 my-1 text-[11px] leading-tight">
            {/* 1. የሹፌሩ ስም */}
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-black whitespace-nowrap min-w-[82px]">
                የሹፌሩ ስም:
              </span>
              <span className="flex-1 text-[12px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
                {pass.driver_name}
              </span>
            </div>

            {/* 2. የሰሌዳ ቁጥር */}
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-black whitespace-nowrap min-w-[82px]">
                የሰሌዳ ቁጥር:
              </span>
              <span className="flex-1 text-[12px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 flex items-baseline justify-between gap-1 overflow-hidden">
                <span className="font-mono font-black">{pass.plate_number}</span>
                {vehicleName && (
                  <span className="text-[10px] font-semibold text-zinc-700 truncate font-sans">
                    ({vehicleName})
                  </span>
                )}
              </span>
            </div>

            {/* 3. የመውጣት ምክንያት */}
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-black whitespace-nowrap min-w-[82px]">
                የመውጣት ምክንያት:
              </span>
              <span className="flex-1 text-[12px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
                {pass.release_reason}
              </span>
            </div>

            {/* 4. እንዲወጣ የፈቀደው */}
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-black whitespace-nowrap min-w-[82px]">
                እንዲወጣ የፈቀደው:
              </span>
              <span className="flex-1 text-[12px] font-bold text-black border-b border-dotted border-black pb-0.5 px-1 truncate">
                {pass.authorized_by}
              </span>
            </div>

            {/* 5. ፊርማ */}
            <div className="flex items-baseline gap-1 pt-0.5">
              <span className="text-[10px] font-bold text-black whitespace-nowrap min-w-[82px]">
                ፊርማ:
              </span>
              <span className="flex-1 border-b border-dotted border-black pb-0.5 px-1 text-transparent select-none">
                ___________________________
              </span>
            </div>
          </div>

          {/* Bottom footer line */}
          <div className="mt-1 pt-1 border-t border-black flex items-center justify-between text-[9px] text-zinc-700 leading-tight">
            <span className="font-semibold">
              ለመውጫ በር ጥበቃ ብቻ (Gate Security Only)
            </span>
            <span className="font-mono text-[8px] text-zinc-500 font-bold">
              AC-GATE-PASS
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Prepare 4 slots for 2x2 grid
  const gridSlots: (GeneratedItem | null)[] = [
    generatedPasses[0] || null,
    generatedPasses[1] || null,
    generatedPasses[2] || null,
    generatedPasses[3] || null,
  ];

  return (
    <>
      {/* Global Print Stylesheet for 2x2 A4 Grid Batch Gate Pass Printing */}
      <style jsx global>{`
        @media print {
          body > *:not(#printable-batch-gate-pass-root) {
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
          #printable-batch-gate-pass-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 6mm 5mm !important;
            padding: 0 !important;
            width: 200mm !important;
            height: 285mm !important;
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
            <span className="sm:hidden">የጅምላ መውጫ ፈቃድ</span>
            <span className="hidden sm:inline">የጅምላ መውጫ ፈቃድ (Batch Gate Pass — 2x2 A4 Grid)</span>
          </>
        }
        badge={
          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full">
            {selectedIntakes.slice(0, 4).length} መኪኖች
          </span>
        }
        description="እስከ 4 መኪኖች በአንድ A4 ወረቀት ላይ (2x2 Grid) ያለ ወረቀት ብክነት ይታተማሉ።"
        icon={
          <img
            src="/ac-wale-logo.png"
            alt="AC WALE"
            className="w-8 h-8 rounded-lg object-contain bg-black border border-zinc-800 shrink-0"
          />
        }
        onClose={onClose}
        onPrint={isGenerated ? handlePrint : undefined}
        printTitle="A4 ሰነድ አትም (Print 2x2 Grid)"
        maxWidthClass="sm:max-w-4xl"
        footer={
          !isGenerated ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500">
                * ከተረጋገጠ በኋላ እያንዳንዱ መኪና በራስ-ሰር &quot;ወጥቷል&quot; ተብሎ ይመዘገባል።
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-11 px-4 text-xs font-medium text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 transition"
                >
                  ሰርዝ (Cancel)
                </button>
                <button
                  type="submit"
                  form="batch-gate-pass-form"
                  disabled={submitting}
                  className="h-11 flex-1 sm:flex-none px-4 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>በማዘጋጀት ላይ...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={15} className="shrink-0" />
                      <span className="truncate">ፈቃዶችን አዘጋጅና አትም (Generate & Print A4 Grid)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500 font-mono">2x2 Grid A4 Layout • 4-in-1 Waste-Elimination</span>
              <button
                onClick={onClose}
                className="h-11 px-4 text-xs font-medium text-zinc-300 hover:text-white rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
              >
                ጨርስ (Done)
              </button>
            </div>
          )
        }
      >
        <div className="p-3 sm:p-6 bg-zinc-900/40">
          {error && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isGenerated ? (
            /* STEP 1: Quick Configuration Form */
            <form id="batch-gate-pass-form" onSubmit={handleSubmitBatch} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-xs">
                <span className="text-zinc-300">
                  ለመረጧቸው {selectedIntakes.slice(0, 4).length} መኪኖች የሹፌር እና የመውጫ ምክንያት ይሙሉ:
                </span>
                {selectedIntakes.length > 1 && (
                  <button
                    type="button"
                    onClick={handleApplyRowOneToAll}
                    className="min-h-11 px-3 py-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 hover:bg-amber-900/40 rounded-lg transition flex items-center gap-1.5 font-medium text-left"
                  >
                    <Copy size={13} className="shrink-0" />
                    <span>የመጀመሪያውን ረድፍ ለሁሉም ቅዳ (Copy Row 1 to All)</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {selectedIntakes.slice(0, 4).map((car, idx) => {
                  const row = formData[car.id] || {
                    driver_name: "",
                    release_reason: "የዕለት መልስ",
                    authorized_by: currentUser?.full_name || "Supervisor",
                  };

                  return (
                    <div
                      key={car.id}
                      className="bg-zinc-900/80 border border-zinc-800 p-3.5 rounded-xl space-y-3 transition hover:border-zinc-700"
                    >
                      {/* Car Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-white break-words min-w-0">
                            {car.vehicle_name}
                          </span>
                          <span className="text-xs font-mono font-black text-amber-300 bg-zinc-950 border border-zinc-700 px-2 py-0.5 rounded">
                            {car.plate_number}
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-400 break-words">
                          ባለቤት: {car.owner_name} ({car.owner_phone})
                        </span>
                      </div>

                      {/* Input Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="min-w-0">
                          <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                            የሹፌሩ ስም (Driver Name) *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="ለምሳሌ፡ ዮናስ በቀለ"
                            value={row.driver_name}
                            onChange={(e) => handleFieldChange(car.id, "driver_name", e.target.value)}
                            className="w-full h-11 bg-zinc-950 border border-zinc-700 rounded-lg px-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="min-w-0">
                          <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                            የመውጣት ምክንያት (Reason)
                          </label>
                          <select
                            value={row.release_reason}
                            onChange={(e) => handleFieldChange(car.id, "release_reason", e.target.value)}
                            className="w-full min-w-0 h-11 bg-zinc-950 border border-zinc-700 rounded-lg px-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500"
                          >
                            {REASON_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="min-w-0">
                          <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                            እንዲወጣ የፈቀደው (Authorized By)
                          </label>
                          <input
                            type="text"
                            value={row.authorized_by}
                            onChange={(e) => handleFieldChange(car.id, "authorized_by", e.target.value)}
                            className="w-full h-11 bg-zinc-950 border border-zinc-700 rounded-lg px-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </form>
          ) : (
            /* STEP 2: On-screen 2x2 Grid Print Preview */
            <div className="space-y-4">
              <div className="bg-emerald-950/40 border border-emerald-800/80 p-3 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>{generatedPasses.length} የመውጫ ፈቃዶች በተከታታይ ቁጥር ተዘጋጅተዋል!</span>
              </div>

              {/* Preview of the 2x2 grid at true A4 width, scaled to fit */}
              <ScaledPreview designWidth={A4_PORTRAIT_PX}>
                <div
                  className="bg-white p-3 rounded-lg shadow-2xl"
                  style={{
                    width: "100%",
                    minHeight: `${Math.round(A4_PORTRAIT_PX * 1.414)}px`,
                    boxSizing: "border-box",
                  }}
                >
                  <div className="border border-dashed border-gray-400 p-2 rounded h-full flex flex-col justify-between">
                    <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
                      {gridSlots.map((item, idx) => (
                        <div key={idx} className="h-full min-h-[520px]">
                          {renderSingleSlip(item, idx, false)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScaledPreview>
            </div>
          )}
        </div>
      </PrintModalShell>

      {/* Dedicated Portal for Printing Directly into document.body */}
      {mounted &&
        isGenerated &&
        createPortal(
          <div id="printable-batch-gate-pass-root" className="hidden print:block">
            <div
              className="grid grid-cols-2 grid-rows-2"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gridTemplateRows: "repeat(2, 1fr)",
                gap: "4mm",
                width: "200mm",
                height: "285mm",
                boxSizing: "border-box",
                pageBreakInside: "avoid",
                breakInside: "avoid",
              }}
            >
              {gridSlots.map((item, idx) => (
                <div
                  key={idx}
                  className="relative w-full h-full"
                  style={{
                    boxSizing: "border-box",
                    borderRight: idx % 2 === 0 ? "1px dashed #9ca3af" : "none",
                    borderBottom: idx < 2 ? "1px dashed #9ca3af" : "none",
                    paddingRight: idx % 2 === 0 ? "2mm" : "0",
                    paddingBottom: idx < 2 ? "2mm" : "0",
                  }}
                >
                  {renderSingleSlip(item, idx, true)}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
