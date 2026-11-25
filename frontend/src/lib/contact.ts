// Single source for AC WALE MARKET public contact details used across the customer pages.

export interface PhoneLine {
  /** E.164 number used in tel: links */
  tel: string;
  /** Human-readable international format */
  display: string;
  /** Local format (09…) */
  local: string;
}

/** The two public contact fields of a dealership record (from the API). */
export interface DealerContact {
  phone_number?: string | null;
  phone_number_2?: string | null;
}

/**
 * One phone (any format: "+251 98…", "2519…", "09…") -> tel / display / local strings.
 * Returns null for an empty value. Numbers are never hardcoded in the UI: they come from
 * the dealership record, which the backend fills from PRIMARY_DEALERSHIP_PHONE / _PHONE_2.
 */
export function toPhoneLine(raw?: string | null): PhoneLine | null {
  const text = (raw || "").trim();
  if (!text) return null;
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("2510") && digits.length === 13) digits = "251" + digits.slice(4);
  else if (/^0[79]\d{8}$/.test(digits)) digits = "251" + digits.slice(1);
  else if (/^[79]\d{8}$/.test(digits)) digits = "251" + digits;

  if (/^251[79]\d{8}$/.test(digits)) {
    const n = digits.slice(3); // 9XXXXXXXX
    return {
      tel: `+${digits}`,
      display: `+251 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
      local: `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
    };
  }
  return { tel: text.startsWith("+") ? `+${digits}` : digits, display: text, local: text };
}

/** The dealership's public call lines (primary first), de-duplicated. Empty if none are set. */
export function dealerPhoneLines(dealer?: DealerContact | null): PhoneLine[] {
  const lines: PhoneLine[] = [];
  for (const raw of [dealer?.phone_number, dealer?.phone_number_2]) {
    const line = toPhoneLine(raw);
    if (line && !lines.some((l) => l.tel === line.tel)) lines.push(line);
  }
  return lines;
}

/** "📞 +251 … / +251 …" text for share captions and print sheets ("" when no phone is set). */
export function dealerPhonesText(dealer?: DealerContact | null, sep = " / "): string {
  return dealerPhoneLines(dealer).map((p) => p.display).join(sep);
}

/** Telegram chat link for the primary line (t.me/+2519…), or undefined when no phone is set. */
export function dealerTelegramUrl(dealer?: DealerContact | null): string | undefined {
  const first = dealerPhoneLines(dealer)[0];
  return first && first.tel.startsWith("+251") ? `https://t.me/${first.tel}` : undefined;
}

export const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/v5NbRBzRNaNNZWzQA?g_st=atm";
export const CONTACT_EMAIL = "acwalecarmarket@gmail.com";

export const ADDRESS = {
  am: { line1: "22 (ሃያ ሁለት) አዋራሪስ ሆቴል ጀርባ", line2: "አዲስ አበባ" },
  en: { line1: "Hayahulet, Behind Awraris Hotel", line2: "Addis Ababa, Ethiopia" },
};

/** Text placed on the clipboard by "Copy address" */
export const addressCopyText = (lang: "am" | "en") =>
  lang === "am"
    ? "22 (ሃያ ሁለት) አዋራሪስ ሆቴል ጀርባ፣ አዲስ አበባ (AC WALE MARKET)"
    : "Hayahulet, Behind Awraris Hotel, Addis Ababa, Ethiopia (AC WALE MARKET)";

/** Business hours, both international and Ethiopian (local clock) formats */
export const HOURS = {
  weekdays: {
    label: { am: "ሰኞ–ቅዳሜ", en: "Mon–Sat" },
    intl: "8:30 AM – 6:30 PM",
    local: "2:30 ጠዋት – 12:30 ማታ",
  },
  sunday: {
    label: { am: "እሁድ", en: "Sun" },
    text: { am: "በከፊል ክፍት / በቀጠሮ", en: "Half day / by appointment" },
  },
};
