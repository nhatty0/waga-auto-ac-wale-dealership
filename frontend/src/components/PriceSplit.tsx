import React from "react";
import { BANK_LABEL, CASH_LABEL } from "@/lib/price";

interface PriceSplitProps {
  cash: number | null;
  bank: number | null;
  total: number | null;
  bankName?: string | null;
  size?: "sm" | "md" | "lg";
  /** Stack label above value (narrow columns, e.g. Compare). */
  stacked?: boolean;
}

const VALUE_SIZE = {
  sm: "text-sm sm:text-base",
  md: "text-base sm:text-lg",
  lg: "text-xl sm:text-2xl",
} as const;

/** Cash + bank split shown in place of the price when no full price is set. */
export default function PriceSplit({ cash, bank, total, bankName, size = "md", stacked }: PriceSplitProps) {
  const line = (label: string, value: number, extra?: string | null) => (
    <div
      className={
        stacked
          ? "min-w-0"
          : "flex items-baseline justify-between gap-2 min-w-0"
      }
    >
      <span className="text-[11px] text-zinc-400 font-semibold whitespace-nowrap block">
        {label}:
        {extra && (
          <span className="ml-1 font-normal text-zinc-500 inline-block max-w-[5.5rem] truncate align-bottom">
            ({extra})
          </span>
        )}
      </span>
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={`font-black text-amber-400 tabular-nums ${VALUE_SIZE[size]}`}>
          {value.toLocaleString("en-US")}
        </span>
        <span className="text-xs font-bold text-amber-400/80">ETB</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-0.5">
      {cash != null && line(CASH_LABEL, cash)}
      {bank != null && line(BANK_LABEL, bank, bankName)}
      {total != null && (
        <span className="block text-[10px] text-zinc-500 font-medium tabular-nums whitespace-nowrap pt-0.5">
          Total ≈ {total.toLocaleString("en-US")} ETB
        </span>
      )}
    </div>
  );
}
