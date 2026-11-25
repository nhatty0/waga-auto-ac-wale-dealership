"use client";
import { formatMileage } from "@/lib/mileage";
import React from "react";
import {
  X,
  ArrowRightLeft,
  ArrowRight,
  Gauge,
  Fuel,
  Cog,
  ShieldCheck,
  Calendar,
  Layers,
  Banknote,
  Tag,
} from "lucide-react";
import { Vehicle, Dealership } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { resolveImageUrl } from "@/lib/images";
import { getPriceInfo } from "@/lib/price";
import PriceSplit from "@/components/PriceSplit";
import { getPlateLabel, getPlateBadgeClasses } from "@/lib/plates";
import { dealerPhoneLines } from "@/lib/contact";

interface CompareModalProps {
  vehicles: Vehicle[];
  dealership?: Dealership | null;
  onClose: () => void;
  onBook: (vehicle: Vehicle) => void;
}

export default function CompareModal({
  vehicles,
  dealership,
  onClose,
  onBook,
}: CompareModalProps) {
  const { lang, t } = useLanguage();

  if (vehicles.length < 2) return null;

  const [carA, carB] = [vehicles[0], vehicles[1]];

  const getConditionLabel = (cond?: string) => {
    const lower = (cond || "").toLowerCase();
    if (lower === "brand new") return t.conditionBrandNew;
    if (lower === "slightly used") return t.conditionSlightlyUsed;
    if (lower === "excellent condition") return t.conditionExcellent;
    return t.conditionGood;
  };

  const rows = [
    {
      id: "price",
      icon: Banknote,
      label: t.priceRow,
      render: (v: Vehicle) => {
        const info = getPriceInfo(v);
        return (
        <div>
          {info.kind === "split" ? (
            <PriceSplit cash={info.cash} bank={info.bank} total={info.total} size="sm" stacked />
          ) : v.price != null ? (
            <div>
              <span className="text-base sm:text-lg font-black text-amber-400 block">
                {v.price.toLocaleString()} ETB
              </span>
              <span className="text-[10px] text-zinc-500">{t.negotiable}</span>
            </div>
          ) : (
            <span className="text-sm font-bold text-amber-400">
              {lang === "am" ? "ዋጋ በስልክ" : "Call for Price"}
            </span>
          )}
        </div>
        );
      },
    },
    {
      id: "loan",
      icon: Layers,
      label: t.bankLoanRow,
      render: (v: Vehicle) => {
        if (v.has_bank_loan && v.cash_price && v.bank_loan_amount) {
          return (
            <div className="space-y-1">
              <span className="inline-block text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full mb-1">
                {v.bank_name || "Bank"} Loan Deal
              </span>
              <div className="text-xs">
                <span className="text-zinc-400 block text-[10px]">
                  {lang === "am" ? "በእጅ የሚከፈል:" : "Cash Upfront:"}
                </span>
                <span className="font-bold text-emerald-400">
                  {v.cash_price.toLocaleString()} ETB
                </span>
              </div>
              <div className="text-xs">
                <span className="text-zinc-400 block text-[10px]">
                  {lang === "am" ? "የሚተላለፍ ዕዳ:" : "Remaining Loan:"}
                </span>
                <span className="font-bold text-sky-400">
                  {v.bank_loan_amount.toLocaleString()} ETB
                </span>
              </div>
            </div>
          );
        }
        return (
          <span className="text-xs text-zinc-500 italic">{t.noLoan}</span>
        );
      },
    },
    {
      id: "plate",
      icon: Tag,
      label: t.plateRow,
      render: (v: Vehicle) => (
        <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${getPlateBadgeClasses(v.plate_status)}`}>
          🏷️ {getPlateLabel(v.plate_status, lang === "am")}
        </span>
      ),
    },
    {
      id: "mileage",
      icon: Gauge,
      label: t.mileageRow,
      render: (v: Vehicle) => (
        <span className="text-xs sm:text-sm font-bold text-zinc-200">
          {formatMileage(v.mileage) ?? "—"}
        </span>
      ),
    },
    {
      id: "fuel_trans",
      icon: Fuel,
      label: t.fuelTransmissionRow,
      render: (v: Vehicle) => (
        <div className="text-xs text-zinc-300 space-y-0.5">
          <p className="font-bold text-white">{v.fuel_type}</p>
          <p className="text-zinc-400 text-[11px]">{v.transmission}</p>
        </div>
      ),
    },
    {
      id: "body_drive",
      icon: Cog,
      label: t.bodyDrivetrainRow,
      render: (v: Vehicle) => (
        <div className="text-xs text-zinc-300 space-y-0.5">
          <p className="font-bold text-white">{v.body_type}</p>
          <p className="text-zinc-400 text-[11px]">{v.drive_train || "FWD"}</p>
        </div>
      ),
    },
    {
      id: "engine",
      icon: Calendar,
      label: t.engineRow,
      render: (v: Vehicle) => (
        <span className="text-xs text-zinc-300 font-medium">
          {v.engine_size || "N/A"}
        </span>
      ),
    },
    {
      id: "condition",
      icon: ShieldCheck,
      label: t.conditionRow,
      render: (v: Vehicle) => (
        <span
          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            v.condition === "Brand New"
              ? "bg-amber-500/20 text-amber-400 border-amber-400/40"
              : v.condition === "Slightly Used"
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-400/40"
              : v.condition === "Excellent Condition"
              ? "bg-sky-500/20 text-sky-400 border-sky-400/40"
              : "bg-zinc-800 text-zinc-300 border-zinc-700"
          }`}
        >
          ★ {getConditionLabel(v.condition)}
        </span>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-white shadow-2xl relative">
        
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <ArrowRightLeft size={16} />
            </span>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white">
                {t.compareVehicles}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {carA.year} {carA.make} {carA.model} vs {carB.year} {carB.make} {carB.model}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900 border border-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Comparison Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Top Cars Header Cards (Side-by-Side) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[carA, carB].map((car, idx) => {
              const coverImg = resolveImageUrl(
                car.images?.[0]?.image_url,
                "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80"
              );

              return (
                <div
                  key={car.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div className="relative h-28 sm:h-44 w-full bg-black overflow-hidden">
                    <img
                      src={coverImg}
                      alt={car.model}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 left-2 bg-black/75 backdrop-blur-md text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded uppercase">
                      Car {idx + 1}
                    </span>
                    {car.status !== "Available" && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/90 text-white">
                        {car.status}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">
                      {car.make}
                    </span>
                    <h4 className="font-black text-xs sm:text-sm text-white truncate">
                      {car.year} {car.model}
                    </h4>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Spec Comparison Rows */}
          <div className="space-y-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.id}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 hover:border-zinc-700 transition"
                >
                  <div className="flex items-center gap-1.5 mb-2 text-zinc-400 text-xs font-semibold">
                    <Icon size={14} className="text-amber-400" />
                    <span>{row.label}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1 border-t border-zinc-800/60">
                    <div className="pr-2 border-r border-zinc-800/60">
                      {row.render(carA)}
                    </div>
                    <div className="pl-2">
                      {row.render(carB)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Bottom Booking Action Bar */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex gap-3 sticky bottom-0">
          {[carA, carB].map((car, idx) => (
            <div key={car.id} className="flex-1">
              {car.status === "Sold" ? (
                <a
                  href={`tel:${dealerPhoneLines(dealership || car.dealership)[0]?.tel ?? ""}`}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-1"
                >
                  {t.findSimilar}
                </a>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    onBook(car);
                  }}
                  className={`w-full py-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 shadow-lg ${
                    idx === 0
                      ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                      : "bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  <span>{t.bookVisit} ({car.model})</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
