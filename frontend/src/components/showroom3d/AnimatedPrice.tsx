"use client";

import React, { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Landmark, Banknote } from "lucide-react";

interface AnimatedPriceProps {
  price?: number | null;
  cashPrice?: number | null;
  bankLoanAmount?: number | null;
  bankName?: string | null;
  hasBankLoan?: boolean;
  lang?: "en" | "am";
  size?: "sm" | "md" | "lg";
}

export default function AnimatedPrice({
  price,
  cashPrice,
  bankLoanAmount,
  bankName,
  hasBankLoan,
  lang = "en",
  size = "md",
}: AnimatedPriceProps) {
  const shouldReduceMotion = useReducedMotion();
  const [displayPrice, setDisplayPrice] = useState<number>(() =>
    shouldReduceMotion || !price ? (price || 0) : 0
  );

  useEffect(() => {
    if (!price || shouldReduceMotion) {
      setDisplayPrice(price || 0);
      return;
    }

    let start = 0;
    const duration = 800; // ms
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (price - start) * eased);
      setDisplayPrice(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayPrice(price);
      }
    };

    const animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [price, shouldReduceMotion]);

  if (!price) {
    return (
      <span className="text-sm font-bold text-amber-400 block py-1">
        {lang === "am" ? "ዋጋ በስልክ" : "Call for Price"}
      </span>
    );
  }

  const effectiveCash = cashPrice ?? (hasBankLoan && bankLoanAmount ? price - bankLoanAmount : null);
  const effectiveLoan = bankLoanAmount ?? null;

  return (
    <div className="space-y-1.5">
      {/* Total Main Price */}
      <div>
        <span className="text-[10px] text-zinc-500 block uppercase font-medium">
          {lang === "am" ? "የመኪናው ሙሉ ዋጋ" : "Negotiable Price"}
        </span>
        <div className="flex items-baseline gap-1 whitespace-nowrap">
          <span
            className={`font-black text-amber-400 tabular-nums ${
              size === "lg"
                ? "text-xl sm:text-2xl"
                : size === "sm"
                ? "text-sm sm:text-base"
                : "text-base sm:text-lg"
            }`}
          >
            {displayPrice.toLocaleString()}
          </span>
          <span className="text-xs font-bold text-amber-400/80">ETB</span>
        </div>
      </div>

      {/* Sequential Reveal: Cash Upfront vs Bank Loan Split */}
      {(effectiveCash != null || effectiveLoan != null) && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.35, duration: 0.3 }}
          className="flex flex-wrap items-center gap-1.5 pt-0.5"
        >
          {effectiveCash != null && effectiveCash > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
              <Banknote size={11} />
              <span>
                {lang === "am" ? "በእጅ:" : "Cash:"}{" "}
                {effectiveCash.toLocaleString()}
              </span>
            </span>
          )}

          {effectiveLoan != null && effectiveLoan > 0 && (
            <motion.span
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.5, duration: 0.25 }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
            >
              <Landmark size={11} />
              <span>
                {lang === "am" ? "የባንክ ዕዳ:" : "Loan:"}{" "}
                {effectiveLoan.toLocaleString()}
              </span>
              {bankName && <span className="opacity-75 truncate max-w-[9rem]">({bankName})</span>}
            </motion.span>
          )}
        </motion.div>
      )}
    </div>
  );
}
