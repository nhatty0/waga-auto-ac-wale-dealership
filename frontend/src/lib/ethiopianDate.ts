/**
 * Gregorian -> Ethiopian calendar (ዓ.ም), for documents whose paper templates print E.C. dates.
 * Uses Julian Day Numbers (Ethiopian epoch JDN 1723856 = Meskerem 1, year 1, Amete Mihret).
 */

export const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ",
];

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function toEthiopian(y: number, m: number, d: number): { year: number; month: number; day: number } {
  const jdn = gregorianToJdn(y, m, d);
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

/** "2026-11-28..." -> "19/03/2019" (day/month/year, E.C.). Empty or unparsable -> "". */
export function ethiopianDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const e = toEthiopian(+m[1], +m[2], +m[3]);
  return `${String(e.day).padStart(2, "0")}/${String(e.month).padStart(2, "0")}/${e.year}`;
}

/** "2026-11-28" -> "ኅዳር 19 ቀን 2019" */
export function ethiopianDateLong(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const e = toEthiopian(+m[1], +m[2], +m[3]);
  return `${ETHIOPIAN_MONTHS[e.month - 1]} ${e.day} ቀን ${e.year}`;
}
