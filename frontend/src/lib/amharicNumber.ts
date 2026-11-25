/**
 * Birr amounts in Amharic words for receipts, e.g.
 *   250000      -> "ሁለት መቶ ሃምሳ ሺህ ብር"
 *   1500000.5   -> "አንድ ሚሊዮን አምስት መቶ ሺህ ብር ከሃምሳ ሳንቲም"
 * The form puts this in an editable field, so staff can still correct the wording.
 */
const ONES = ["", "አንድ", "ሁለት", "ሶስት", "አራት", "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ"];
const TENS = ["", "አስር", "ሃያ", "ሰላሳ", "አርባ", "ሃምሳ", "ስልሳ", "ሰባ", "ሰማንያ", "ዘጠና"];
const SCALES: [number, string][] = [
  [1_000_000_000, "ቢሊዮን"],
  [1_000_000, "ሚሊዮን"],
  [1_000, "ሺህ"],
];

function below100(n: number): string {
  if (n < 10) return ONES[n];
  if (n === 10) return TENS[1];
  if (n < 20) return `አስራ ${ONES[n - 10]}`;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} መቶ`);
  if (rest) parts.push(below100(rest));
  return parts.join(" ");
}

export function integerToAmharic(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "ዜሮ";
  const parts: string[] = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      parts.push(`${below1000(Math.floor(n / value))} ${name}`);
      n %= value;
    }
  }
  if (n) parts.push(below1000(n));
  return parts.join(" ");
}

/** "" for an empty / invalid amount. */
export function birrInAmharicWords(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "";
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(/,/g, ""));
  if (!isFinite(value) || value < 0) return "";
  const birr = Math.floor(value);
  const cents = Math.round((value - birr) * 100);
  let out = `${integerToAmharic(birr)} ብር`;
  if (cents > 0) out += ` ከ${integerToAmharic(cents)} ሳንቲም`;
  return out;
}

/** 250000 -> "250,000.00" */
export function formatBirr(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "";
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(/,/g, ""));
  if (!isFinite(value)) return String(amount);
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
