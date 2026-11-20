import type { Vehicle } from "@/types";

/**
 * One rule for every place a vehicle price is shown:
 *  1. full price set            → "full"
 *  2. no price, cash/bank set   → "split" (cash upfront + remaining bank loan)
 *  3. nothing                   → "none"  ("Call for Price")
 *
 * The admin form stores the split as "Cash Upfront" + "Remaining Loan", so
 * cash + bank is the full amount; `total` is only given when both are set.
 */
export type PriceInfo =
  | { kind: "full"; price: number }
  | { kind: "split"; cash: number | null; bank: number | null; total: number | null }
  | { kind: "none" };

const positive = (n: number | null | undefined): number | null =>
  n != null && Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null;

export function getSplitParts(v: Vehicle): { cash: number | null; bank: number | null } {
  return {
    cash: positive(v.cash_price ?? v.down_payment),
    bank: positive(v.bank_loan_amount ?? v.bank_loan),
  };
}

export function getPriceInfo(v: Vehicle): PriceInfo {
  if (v.price != null && Number(v.price) > 0) return { kind: "full", price: Number(v.price) };
  const { cash, bank } = getSplitParts(v);
  if (cash == null && bank == null) return { kind: "none" };
  return { kind: "split", cash, bank, total: cash != null && bank != null ? cash + bank : null };
}

export const fmtEtb = (n: number) => `${n.toLocaleString("en-US")} ETB`;

export const CASH_LABEL = "Cash / በጥሬ";
export const BANK_LABEL = "Bank / ባንክ";
export const CALL_FOR_PRICE = { en: "Call for Price", am: "ዋጋ በስልክ" } as const;

/** Plain-text price for share/copy/meta text. `callText` is used for "none". */
export function priceText(v: Vehicle, callText: string, negotiable?: string): string {
  const info = getPriceInfo(v);
  if (info.kind === "full") return `${fmtEtb(info.price)}${negotiable ? ` (${negotiable})` : ""}`;
  if (info.kind === "none") return callText;
  const parts: string[] = [];
  if (info.cash != null) parts.push(`${CASH_LABEL}: ${fmtEtb(info.cash)}`);
  if (info.bank != null) parts.push(`${BANK_LABEL}: ${fmtEtb(info.bank)}`);
  if (info.total != null) parts.push(`Total ≈ ${fmtEtb(info.total)}`);
  return parts.join(" | ");
}
