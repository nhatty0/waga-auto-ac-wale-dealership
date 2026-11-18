// Single source for AC WALE MARKET public contact details used across the customer pages.

export interface PhoneLine {
  /** E.164 number used in tel: links */
  tel: string;
  /** Human-readable international format */
  display: string;
  /** Local format (09…) */
  local: string;
}

export const SALES_PHONES: PhoneLine[] = [
  { tel: "+251911646628", display: "+251 911 646 628", local: "0911 646 628" },
  { tel: "+251900061300", display: "+251 900 061 300", local: "0900 061 300" },
];

export const TELEGRAM_CHAT_URL = "https://t.me/+251911646628";
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
