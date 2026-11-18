"use client";
import React from "react";
import { X, ArrowRightLeft, Trash2 } from "lucide-react";
import { useCompare } from "@/context/CompareContext";
import { useLanguage } from "@/context/LanguageContext";
import { resolveImageUrl } from "@/lib/images";

export default function CompareDock() {
  const { selectedVehicles, removeFromCompare, clearCompare, setIsCompareModalOpen } =
    useCompare();
  const { lang, t } = useLanguage();

  if (selectedVehicles.length === 0) return null;

  const isReady = selectedVehicles.length === 2;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-0 z-40 flex justify-center px-3 sm:px-4 pointer-events-none animate-in slide-in-from-bottom duration-300">
      <div className="pointer-events-auto bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/90 rounded-2xl sm:rounded-full p-2 sm:p-2.5 shadow-2xl flex flex-col sm:flex-row items-center gap-2 sm:gap-4 max-w-xl w-full border-amber-500/30">
        
        {/* Vehicles Preview List */}
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto justify-between sm:justify-start">
          {selectedVehicles.map((car) => {
            const thumb = resolveImageUrl(
              car.images?.[0]?.image_url,
              "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=200&q=80"
            );

            return (
              <div
                key={car.id}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 flex-1 min-w-0 sm:flex-initial relative group"
              >
                <div className="w-9 h-9 rounded-lg bg-black overflow-hidden flex-shrink-0 border border-zinc-800">
                  <img
                    src={thumb}
                    alt={car.model}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 pr-4">
                  <span className="text-[10px] text-amber-400 font-bold uppercase truncate block">
                    {car.make}
                  </span>
                  <p className="text-[11px] font-bold text-white truncate max-w-[90px] sm:max-w-[120px]">
                    {car.model}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCompare(car.id)}
                  className="absolute -top-2.5 -right-2.5 w-8 h-8 flex items-center justify-center group/rm"
                  title="Remove"
                  aria-label={`Remove ${car.make} ${car.model}`}
                >
                  <span className="w-5 h-5 bg-zinc-800 group-hover/rm:bg-red-500 text-zinc-300 group-hover/rm:text-white rounded-full flex items-center justify-center transition shadow ring-2 ring-zinc-950">
                    <X size={11} />
                  </span>
                </button>
              </div>
            );
          })}

          {/* Placeholder for 2nd vehicle if only 1 is selected */}
          {selectedVehicles.length === 1 && (
            <div className="flex items-center gap-2 border border-dashed border-zinc-700/80 rounded-xl px-2.5 py-2 flex-1 sm:flex-initial text-zinc-500 text-[11px]">
              <div className="w-8 h-8 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500">
                +
              </div>
              <span className="italic truncate">
                {lang === "am" ? "2ኛ መኪና ይምረጡ" : "Select 2nd car"}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={clearCompare}
            className="h-11 w-11 shrink-0 flex items-center justify-center text-zinc-400 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition"
            title={t.clearAll}
            aria-label={t.clearAll}
          >
            <Trash2 size={15} />
          </button>

          {isReady ? (
            <button
              data-compare-open
              onClick={() => setIsCompareModalOpen(true)}
              className="flex-1 sm:flex-initial h-11 px-4 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95"
            >
              <ArrowRightLeft size={14} />
              <span>{t.compareNow}</span>
            </button>
          ) : (
            <div className="text-[10px] text-zinc-400 font-medium px-2 py-1 text-center">
              {t.selectOneMore}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
