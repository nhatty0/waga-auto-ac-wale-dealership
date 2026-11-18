"use client";
import React from "react";
import { X, SlidersHorizontal, RotateCcw, Check, Banknote, ShieldAlert, Zap, Cog } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface FilterState {
  minPrice: string;
  maxPrice: string;
  transmission: "All" | "Automatic" | "Manual";
  plateStatus: "All" | "Unregistered" | "new_series" | "Code 2" | "Code 3";
  bankLoanOnly: boolean;
  fuelType: "All" | "Gasoline" | "Electric" | "Hybrid" | "Diesel";
  condition: "All" | "Brand New" | "Slightly Used" | "Excellent Condition" | "Good Condition";
  /** "All" or a make name (case-insensitive match) */
  brand: string;
  /** Include vehicles marked Sold */
  showSold: boolean;
}

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  onReset: () => void;
  resultCount: number;
  /** Makes offered in the Brand section */
  brandOptions?: string[];
}

const chipClass = (active: boolean) =>
  `min-h-11 py-2 px-3.5 rounded-xl text-xs font-bold border transition ${
    active
      ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
  }`;

export default function FilterDrawer({
  isOpen,
  onClose,
  filters,
  setFilters,
  onReset,
  resultCount,
  brandOptions = [],
}: FilterDrawerProps) {
  const { lang, t } = useLanguage();

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pricePresets: { label: string; min: string; max: string }[] = [
    { label: t.priceUnder2M, min: "", max: "2000000" },
    { label: t.price2Mto35M, min: "2000000", max: "3500000" },
    { label: t.price35Mto5M, min: "3500000", max: "5000000" },
    { label: t.priceAbove5M, min: "5000000", max: "" },
  ];

  const plateOptions: { value: FilterState["plateStatus"]; label: string }[] = [
    { value: "All", label: t.allOption },
    { value: "new_series", label: lang === "am" ? "አዲስ ሰሌዳ (AAA/AAB)" : "New Digital Plate (AAA)" },
    { value: "Unregistered", label: lang === "am" ? "ያልተለጠፈ" : "Unregistered" },
    { value: "Code 2", label: lang === "am" ? "ኮድ 2" : "Code 2" },
    { value: "Code 3", label: lang === "am" ? "ኮድ 3" : "Code 3" },
  ];

  const transmissionOptions: { value: FilterState["transmission"]; label: string }[] = [
    { value: "All", label: t.allOption },
    { value: "Automatic", label: t.automatic },
    { value: "Manual", label: t.manual },
  ];

  const fuelOptions: { value: FilterState["fuelType"]; label: string }[] = [
    { value: "All", label: t.allOption },
    { value: "Gasoline", label: t.gasoline },
    { value: "Electric", label: t.electric },
    { value: "Hybrid", label: t.hybrid },
    { value: "Diesel", label: t.diesel },
  ];

  const conditionOptions: { value: FilterState["condition"]; label: string }[] = [
    { value: "All", label: t.allOption },
    { value: "Brand New", label: t.conditionBrandNew },
    { value: "Slightly Used", label: t.conditionSlightlyUsed },
    { value: "Excellent Condition", label: t.conditionExcellent },
    { value: "Good Condition", label: t.conditionGood },
  ];

  const isPresetActive = (min: string, max: string) => {
    return filters.minPrice === min && filters.maxPrice === max;
  };

  const handlePresetClick = (min: string, max: string) => {
    if (isPresetActive(min, max)) {
      setFilters((prev) => ({ ...prev, minPrice: "", maxPrice: "" }));
    } else {
      setFilters((prev) => ({ ...prev, minPrice: min, maxPrice: max }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-zinc-950 border-l border-zinc-800/90 text-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white leading-tight">
                {t.filterTitle}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {t.filterSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={lang === "am" ? "ዝጋ" : "Close"}
            className="h-11 w-11 flex items-center justify-center text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Filter Form */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-6">

          {/* Brand (moved here from the showroom chip row) */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              🚘 {lang === "am" ? "የመኪና ብራንድ" : "Brand"}
            </span>
            <div className="flex flex-wrap gap-2">
              {["All", ...brandOptions].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, brand: b }))}
                  className={chipClass(filters.brand.toLowerCase() === b.toLowerCase())}
                >
                  {b === "All" ? t.allOption : b === "Toyota" ? t.catToyota : b === "BYD" ? t.catByd : b}
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Price Range */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 uppercase tracking-wider">
              <Banknote size={15} className="text-amber-400" />
              <span>{t.priceRange}</span>
            </div>

            {/* Quick Budget Preset Chips */}
            <div className="grid grid-cols-2 gap-2">
              {pricePresets.map((preset) => {
                const active = isPresetActive(preset.min, preset.max);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetClick(preset.min, preset.max)}
                    className={`min-h-11 py-2 px-3 rounded-xl text-xs font-bold border transition text-center ${
                      active
                        ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Min / Max Inputs */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t.minPrice}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.minPrice}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, minPrice: e.target.value }))
                    }
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-base sm:text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold">
                    ETB
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t.maxPrice}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder={lang === "am" ? "ገደብ የለም" : "No limit"}
                    value={filters.maxPrice}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))
                    }
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-base sm:text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold">
                    ETB
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Bank Loan Financing Option */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              {t.paymentOption}
            </span>

            <label
              onClick={() =>
                setFilters((prev) => ({ ...prev, bankLoanOnly: !prev.bankLoanOnly }))
              }
              className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition ${
                filters.bankLoanOnly
                  ? "bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
                  filters.bankLoanOnly
                    ? "bg-amber-500 text-black font-black"
                    : "border border-zinc-700 bg-zinc-800"
                }`}
              >
                {filters.bankLoanOnly && <Check size={14} />}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block leading-tight">
                  🏦 {t.bankLoanOnly}
                </span>
                <span className="text-[11px] text-zinc-400 block mt-0.5 leading-snug">
                  {t.bankLoanOnlySub}
                </span>
              </div>
            </label>
          </div>

          {/* Section 3: Plate Classification */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              🏷️ {t.plateClassification}
            </span>
            <div className="flex flex-wrap gap-2">
              {plateOptions.map((item) => {
                const active = filters.plateStatus === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, plateStatus: item.value }))
                    }
                    className={chipClass(active)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Transmission */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              ⚙️ {t.transmissionTitle}
            </span>
            <div className="flex flex-wrap gap-2">
              {transmissionOptions.map((item) => {
                const active = filters.transmission === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, transmission: item.value }))
                    }
                    className={chipClass(active)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: Fuel Type */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              ⛽ {t.fuelTypeTitle}
            </span>
            <div className="flex flex-wrap gap-2">
              {fuelOptions.map((item) => {
                const active = filters.fuelType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, fuelType: item.value }))
                    }
                    className={chipClass(active)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 6: Vehicle Condition */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              ⭐ {t.conditionRow}
            </span>
            <div className="flex flex-wrap gap-2">
              {conditionOptions.map((item) => {
                const active = filters.condition === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, condition: item.value }))
                    }
                    className={chipClass(active)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sold vehicles toggle (moved here from the showroom chip row) */}
          <div className="pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              role="switch"
              aria-checked={filters.showSold}
              onClick={() => setFilters((prev) => ({ ...prev, showSold: !prev.showSold }))}
              className="w-full min-h-12 flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition text-left"
            >
              <span className="min-w-0">
                <span className="block text-xs font-bold text-white">{t.showSold}</span>
                <span className="block text-[11px] text-zinc-400 mt-0.5">
                  {lang === "am" ? "ተሽጠው ያለቁ መኪኖችንም ያካትቱ" : "Include vehicles that are already sold"}
                </span>
              </span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${filters.showSold ? "bg-amber-500" : "bg-zinc-700"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${filters.showSold ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </button>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-zinc-800/80 bg-zinc-950 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="min-h-12 py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} />
            <span>{t.resetFilters}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 active:scale-95"
          >
            <span>{t.showResults} ({resultCount})</span>
          </button>
        </div>

      </div>
    </div>
  );
}
