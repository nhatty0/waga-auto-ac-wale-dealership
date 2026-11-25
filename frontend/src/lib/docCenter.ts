/**
 * Document Center (/superadmin -> Documents): the five document types, their form layouts and
 * the API client. Every endpoint is superadmin-only on the backend (403 for staff).
 */
import { getApiBaseUrl } from "@/lib/api";

export type DocType = "intake" | "gatepass" | "handover" | "downpayment" | "rental";
export type DocStatus = "draft" | "final" | "archived";
export type DocData = Record<string, unknown>;

export interface DocItem {
  type: DocType;
  id: number;
  number: string;
  date: string | null;
  status: DocStatus;
  title: string | null;
  plate_number: string | null;
  party_name: string | null;
  party_phone: string | null;
  amount: number | null;
  vehicle_id: number | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string | null;
  extra: Record<string, unknown>;
}

export interface DocDetail extends DocItem {
  data: DocData;
}

export interface LookupHit {
  source: "vehicle" | "intake";
  vehicle_id: number | null;
  lot_intake_id: number | null;
  label: string;
  vehicle_type: string;
  year: number | null;
  color: string;
  plate_number: string;
  status: string;
  daily_rate: number | null;
  owner_name: string;
  owner_phone: string;
  is_in_lot: boolean | null;
  chassis_number: string;
  engine_number: string;
  horsepower: string;
}

export type DocSummary = Record<DocType, { active: number; draft: number; archived: number; in_lot?: number }>;

export const DOC_TYPES: DocType[] = ["intake", "gatepass", "handover", "downpayment", "rental"];

export const DOC_INFO: Record<DocType, { am: string; en: string; short: string; prefix: string; accent: string }> = {
  intake: { am: "የዕለት መኪና መቀበያ", en: "Daily Intake", short: "Intake", prefix: "IN", accent: "emerald" },
  gatepass: { am: "መውጫ ፓስ", en: "Gate / Release Pass", short: "Gate pass", prefix: "AC", accent: "amber" },
  handover: { am: "የርክክብ ውል", en: "Handover Contract", short: "Handover", prefix: "AC-rec", accent: "sky" },
  downpayment: { am: "የቀብድ መቀበያ ፎርም", en: "Down-payment Receipt", short: "Down payment", prefix: "DP", accent: "violet" },
  rental: { am: "የመኪና ኪራይ ውል ስምምነት", en: "Car Rental Agreement", short: "Rental", prefix: "RA", accent: "rose" },
};

// ---------------------------------------------------------------- form layout

export type FieldKind = "text" | "tel" | "number" | "money" | "date" | "time" | "datetime" | "textarea" | "select";

export interface FieldDef {
  key: string;
  am: string;
  en: string;
  kind?: FieldKind;
  options?: string[];
  required?: boolean;
  /** Full row on wider screens. */
  wide?: boolean;
  placeholder?: string;
  readOnly?: boolean;
}

export type SectionSpecial = "vehicle" | "checklist" | "belongings" | "booking" | "publish" | "telegram";

export interface SectionDef {
  am: string;
  en: string;
  special?: SectionSpecial;
  fields: FieldDef[];
}

export const RELEASE_REASONS = [
  "የዕለት መልስ",
  "የተሸጠ (Sold)",
  "ለጥገና / እጥበት (Maintenance/Wash)",
  "የባለቤት ጥያቄ (Owner Request)",
  "ሙከራ / ቴስት ድራይቭ (Test Drive)",
  "ሌላ ምክንያት (Other)",
];

const address = (p: string, cityAm = "ከተማ"): FieldDef[] => [
  { key: `${p}_city`, am: cityAm, en: "City" },
  { key: `${p}_subcity`, am: "ክ/ከተማ", en: "Sub-city" },
  { key: `${p}_woreda`, am: "ወረዳ", en: "Woreda" },
  { key: `${p}_house_no`, am: "የቤት ቁጥር", en: "House no." },
];

const person = (p: string): FieldDef[] => [
  { key: `${p}_name`, am: "ስም", en: "Name", wide: true },
  ...address(p, "አድራሻ (ከተማ)"),
  { key: `${p}_phone`, am: "ስልክ ቁጥር", en: "Phone", kind: "tel" },
];

/** Section 6 of the rental agreement template (✓ / X), in template order. */
export const RENTAL_CHECKLIST: { key: string; am: string; en: string }[] = [
  { key: "battery", am: "የባትሪ አይነት", en: "Battery" },
  { key: "sun_visor", am: "የጽፀሀይ መከላከያ", en: "Sun visor" },
  { key: "left_mirror", am: "የግራ ስፖኪዮ", en: "Left mirror" },
  { key: "window_winder", am: "የመስታወት ማውረጃ", en: "Window winder" },
  { key: "right_mirror", am: "የቀኝ ስፖኪዮ", en: "Right mirror" },
  { key: "door_handles", am: "የበር እጀታዎች", en: "Door handles" },
  { key: "seat_covers", am: "የወንበር ልብስ", en: "Seat covers" },
  { key: "jack", am: "ክሪክ", en: "Jack" },
  { key: "floor_mats", am: "የወለል ምንጣፍ", en: "Floor mats" },
  { key: "spare_tyre", am: "ስኮርት ጎማ", en: "Spare tyre" },
  { key: "tape_recorder", am: "የቴፕ ሪከርደር አይነት", en: "Radio / tape" },
  { key: "wheel_wrench", am: "የጎማ መፍቻ", en: "Wheel wrench" },
  { key: "fire_extinguisher", am: "የእሳት ማጥፊያ", en: "Fire extinguisher" },
  { key: "hubcaps", am: "የቼርኬ ክዳኖች", en: "Hubcaps" },
  { key: "wipers", am: "የዝናብ መጥረጊያ", en: "Wipers" },
  { key: "engine_start", am: "የሞተር አነሳስና ሁኔታ", en: "Engine start" },
  { key: "inside_mirror", am: "የውስጥ ስፖኪዮ", en: "Inside mirror" },
  { key: "body_condition", am: "የመኪና አካላዊ ይዞታ", en: "Body condition" },
];

export const DOC_FORMS: Record<DocType, SectionDef[]> = {
  intake: [
    {
      am: "ተሽከርካሪ", en: "Vehicle", special: "vehicle", fields: [
        { key: "vehicle_name", am: "የመኪናው ዓይነት", en: "Vehicle", required: true, wide: true, placeholder: "e.g. Suzuki Dzire" },
        { key: "year_of_production", am: "የተመረተበት ዓመት", en: "Year", kind: "number" },
        { key: "plate_number", am: "የሰሌዳ ቁጥር", en: "Plate", required: true },
      ],
    },
    {
      am: "ባለቤት", en: "Owner", fields: [
        { key: "owner_name", am: "የባለቤት ስም", en: "Owner name", required: true },
        { key: "owner_phone", am: "የባለቤት ስልክ", en: "Owner phone", kind: "tel", required: true },
      ],
    },
    {
      am: "ዋጋ", en: "Prices", fields: [
        { key: "primary_cash_price", am: "መነሻ በእጅ", en: "Asking, cash", kind: "money" },
        { key: "primary_bank_price", am: "መነሻ ባንክ", en: "Asking, bank", kind: "money" },
        { key: "final_cash_price", am: "የመጨረሻ በእጅ", en: "Final, cash", kind: "money" },
        { key: "final_bank_price", am: "የመጨረሻ ባንክ", en: "Final, bank", kind: "money" },
      ],
    },
    {
      am: "ርክክብ", en: "Receiving", special: "publish", fields: [
        { key: "date", am: "ርክክብ ቀን", en: "Date received", kind: "date" },
        { key: "received_by_name", am: "የተረካቢው ስም", en: "Received by" },
        { key: "remark", am: "ማስታወሻ", en: "Remark", kind: "textarea", wide: true, placeholder: "ቁልፍ እና ሊብሬ ተረክበናል" },
      ],
    },
  ],
  gatepass: [
    {
      am: "ተሽከርካሪ", en: "Car leaving", special: "vehicle", fields: [
        { key: "vehicle_name", am: "የመኪናው ዓይነት", en: "Vehicle", wide: true },
        { key: "plate_number", am: "የሰሌዳ ቁጥር", en: "Plate", required: true },
        { key: "color", am: "ቀለም", en: "Color" },
      ],
    },
    {
      am: "መውጫ", en: "Release", fields: [
        { key: "driver_name", am: "የሹፌሩ ስም", en: "Driver", required: true },
        { key: "driver_phone", am: "የሹፌሩ ስልክ", en: "Driver phone", kind: "tel" },
        { key: "release_reason", am: "የመውጣት ምክንያት", en: "Reason", kind: "select", options: RELEASE_REASONS, required: true },
        { key: "authorized_by", am: "የፈቀደው ኃላፊ", en: "Authorized by" },
        { key: "date", am: "ቀን", en: "Date", kind: "date" },
        { key: "valid_until", am: "የሚያገለግለው እስከ", en: "Valid until (empty = 23:59 today)", kind: "datetime" },
      ],
    },
    { am: "ቴሌግራም", en: "Remote release", special: "telegram", fields: [] },
  ],
  handover: [
    {
      am: "አስረካቢ (ባለንብረት)", en: "Owner", fields: [
        { key: "owner_full_name", am: "ሙሉ ስም", en: "Full name", required: true, wide: true },
        { key: "owner_phone", am: "ስልክ", en: "Phone", kind: "tel", required: true },
        { key: "owner_subcity", am: "ክ/ከተማ", en: "Sub-city" },
        { key: "owner_woreda", am: "ወረዳ", en: "Woreda" },
        { key: "owner_house_no", am: "የቤት ቁጥር", en: "House no." },
      ],
    },
    {
      am: "ተሽከርካሪ", en: "Vehicle", special: "vehicle", fields: [
        { key: "vehicle_type", am: "የተሽከርካሪው ዓይነት", en: "Vehicle type", required: true, wide: true },
        { key: "manufacture_year", am: "የተመረተበት ዓ.ም", en: "Year", kind: "number" },
        { key: "plate_number", am: "ሰሌዳ ቁጥር", en: "Plate", required: true },
        { key: "chassis_number", am: "የቻንሲ ቁጥር", en: "Chassis no." },
        { key: "engine_number", am: "የሞተር ቁጥር", en: "Engine no." },
        { key: "horsepower", am: "የፈረስ ጉልበት", en: "Horse power" },
        { key: "color", am: "ቀለም", en: "Color" },
      ],
    },
    { am: "አብረው የተረከቡ እቃዎች", en: "Items handed over", special: "belongings", fields: [] },
    {
      am: "ሽያጭ", en: "Sale terms", fields: [
        { key: "agreed_selling_price", am: "የሚሸጥበት ዋጋ (ብር)", en: "Agreed price", kind: "money" },
        { key: "commission_or_net_payout", am: "ኮሚሽን / ለአስረካቢ የሚሰጥ", en: "Commission / payout" },
        { key: "date", am: "ቀን", en: "Date", kind: "date" },
      ],
    },
  ],
  downpayment: [
    {
      am: "ሻጭ / ቀብድ የተከፈለው", en: "Seller (receives the down payment)", fields: [
        { key: "seller_name", am: "ግለሰብ / ድርጅት", en: "Person / company", wide: true },
        ...address("seller", "አድራሻ (ከተማ)"),
      ],
    },
    {
      am: "ገዢ / ቀብድ ከፋይ", en: "Buyer (pays)", fields: [
        { key: "buyer_name", am: "ስም", en: "Name", required: true, wide: true },
        { key: "buyer_phone", am: "ስልክ", en: "Phone", kind: "tel" },
        ...address("buyer", "አድራሻ (ከተማ)"),
      ],
    },
    {
      am: "ተሽከርካሪ", en: "Vehicle", special: "vehicle", fields: [
        { key: "vehicle_type", am: "የተሽከርካሪው ዓይነት", en: "Type", wide: true },
        { key: "chassis_number", am: "የቻንሲ ቁጥር", en: "Chassis no." },
        { key: "engine_number", am: "የሞተር ቁጥር", en: "Engine no." },
        { key: "horsepower", am: "የፈረስ ጉልበት", en: "Horse power" },
        { key: "color", am: "ቀለም", en: "Color" },
        { key: "plate_number", am: "ሰሌዳ ቁጥር", en: "Plate", required: true },
      ],
    },
    {
      am: "ቀብድ", en: "Down payment", fields: [
        { key: "amount", am: "የቀብድ መጠን (በአሃዝ)", en: "Amount, figures (ETB)", kind: "money", required: true },
        { key: "amount_words", am: "በፊደል", en: "Amount in Amharic words (auto, editable)", kind: "textarea", wide: true },
        { key: "date", am: "ቀን", en: "Date", kind: "date" },
      ],
    },
  ],
  rental: [
    { am: "ከኪራይ ቦታ ማስያዣ", en: "Fill from a rental booking (optional)", special: "booking", fields: [] },
    {
      am: "1.1 ተከራይ", en: "Renter", fields: [
        { key: "renter_name", am: "ስም ከነ አያት", en: "Full name", required: true, wide: true },
        { key: "renter_nationality", am: "ዜግነት", en: "Nationality" },
        ...address("renter", "አድራሻ (ከተማ)"),
        { key: "renter_id_number", am: "መታወቂያ ቁጥር", en: "ID no." },
        { key: "renter_license_number", am: "የመንጃ ፍቃድ ቁጥር", en: "Driving licence no." },
        { key: "renter_office_phone", am: "ስልክ (የቢሮ)", en: "Office phone", kind: "tel" },
        { key: "renter_mobile", am: "ሞባይል", en: "Mobile", kind: "tel" },
      ],
    },
    {
      am: "1.2 አከራይ", en: "Lessor", fields: [
        { key: "lessor_name", am: "ስም ከነ አያት", en: "Full name", wide: true },
        { key: "lessor_nationality", am: "ዜግነት", en: "Nationality" },
        ...address("lessor", "አድራሻ (ከተማ)"),
        { key: "lessor_id_number", am: "መታወቂያ ቁጥር", en: "ID no." },
        { key: "lessor_libre_number", am: "የሊብሬ ቁጥር", en: "Libre no." },
        { key: "lessor_office_phone", am: "ስልክ (የቢሮ)", en: "Office phone", kind: "tel" },
        { key: "lessor_mobile", am: "ሞባይል", en: "Mobile", kind: "tel" },
      ],
    },
    {
      am: "5. የመኪና ዝርዝር", en: "Vehicle", special: "vehicle", fields: [
        { key: "vehicle_type", am: "የመኪናው አይነት", en: "Vehicle type", wide: true },
        { key: "plate_number", am: "የሰሌዳ ቁጥር", en: "Plate", required: true },
        { key: "engine_number", am: "የሞተር ቁጥር", en: "Engine no." },
        { key: "chassis_number", am: "ሻንሲ ቁጥር", en: "Chassis no." },
        { key: "fuel_level", am: "የነዳጅ መጠን", en: "Fuel level" },
      ],
    },
    {
      am: "4. የመኪና መረካከቢያ ዝርዝር", en: "Handover & payment", fields: [
        { key: "pickup_date", am: "የተረከቡበት ቀን", en: "Pick-up date", kind: "date", required: true },
        { key: "pickup_time", am: "ሰአት", en: "Time", kind: "time" },
        { key: "pickup_km", am: "ኪ.ሜ", en: "Km at pick-up", kind: "number" },
        { key: "return_date", am: "የመመለሻ ቀን", en: "Return date", kind: "date" },
        { key: "return_time", am: "ሰአት", en: "Time", kind: "time" },
        { key: "return_km", am: "ኪ.ሜ", en: "Km at return", kind: "number" },
        { key: "daily_rate", am: "የአንድ ቀን ክፍያ ተመን", en: "Daily rate (ETB)", kind: "money" },
        { key: "days", am: "የተከራየበት ቀን ብዛት", en: "Days", kind: "number" },
        { key: "total", am: "አጠቃላይ ክፍያ", en: "Total = rate × days (auto)", kind: "money", readOnly: true },
        { key: "deposit", am: "ለዋስትና የተያዘ ገንዘብ", en: "Deposit held", kind: "money" },
        { key: "balance", am: "ቀሪ ክፍያ", en: "Balance (auto, editable)", kind: "money" },
        { key: "km_overage_rate", am: "ከክልል ውጪ በኪ.ሜ (ብር)", en: "Out-of-area rate per km (2.4)", kind: "money" },
        { key: "cheque_bank", am: "ለዋስትና የተያዘ ቼክ", en: "Guarantee cheque (bank / amount)" },
        { key: "cheque_number", am: "የቼክ ቁጥር", en: "Cheque no." },
        { key: "date", am: "የውሉ ቀን", en: "Agreement date", kind: "date" },
      ],
    },
    { am: "የዋስ", en: "Guarantor", fields: person("guarantor") },
    { am: "ምስክር 1", en: "Witness 1", fields: person("witness1") },
    { am: "ምስክር 2", en: "Witness 2", fields: person("witness2") },
    { am: "ምስክር 3", en: "Witness 3", fields: person("witness3") },
    {
      am: "6. እቃዎች እና የተሽከርካሪው ሁኔታ", en: "Accessories & condition (✓ / X)", special: "checklist", fields: [
        { key: "body_notes", am: "የአካል ጉዳት / ማስታወሻ", en: "Body damage / notes", kind: "textarea", wide: true },
      ],
    },
  ],
};

/** Field defaults for a new document of each type. */
export function newDocDefaults(type: DocType, opts: { userName?: string; dealerPhone?: string } = {}): DocData {
  const today = new Date().toISOString().slice(0, 10);
  switch (type) {
    case "intake":
      return { date: today, received_by_name: opts.userName || "" };
    case "gatepass":
      return { date: today, release_reason: RELEASE_REASONS[0], authorized_by: opts.userName || "", send_telegram: true };
    case "handover":
      return {
        date: today,
        belongings: [
          { item_name: "ትርፍ ጎማ (Spare Tire)", quantity: "1" },
          { item_name: "ክሪክ እና መፍቻ (Jack & Tools)", quantity: "1" },
        ],
      };
    case "downpayment":
      return {
        date: today, seller_name: "ኤሲ ዋለ መኪና መሸጫ", seller_city: "አ/አ", seller_subcity: "ቦሌ",
        seller_woreda: "04", seller_house_no: "አዲስ", buyer_city: "አ/አ",
      };
    case "rental":
      return {
        date: today, pickup_date: today, renter_nationality: "ኢትዮጵያዊ", renter_city: "አ/አ",
        lessor_name: "ኤሲ ዋለ መኪና መሸጫ", lessor_nationality: "ኢትዮጵያዊ", lessor_city: "አ/አ",
        lessor_subcity: "ቦሌ", lessor_woreda: "04", lessor_house_no: "አዲስ", lessor_mobile: opts.dealerPhone || "",
        checklist: {},
      };
  }
}

/** Car details a picked vehicle fills in, per document type. Empty values never overwrite. */
export function vehicleFill(type: DocType, hit: LookupHit): DocData {
  const typeWithYear = hit.vehicle_type || hit.label;
  const out: DocData = {
    vehicle_id: hit.vehicle_id ?? undefined,
    plate_number: hit.plate_number,
  };
  if (type === "intake") Object.assign(out, { vehicle_name: hit.vehicle_type, year_of_production: hit.year ?? "" });
  if (type === "gatepass") Object.assign(out, { vehicle_name: hit.label, lot_intake_id: hit.lot_intake_id ?? undefined, color: hit.color });
  if (type === "handover")
    Object.assign(out, {
      vehicle_type: hit.vehicle_type, manufacture_year: hit.year ?? "", chassis_number: hit.chassis_number,
      engine_number: hit.engine_number, horsepower: hit.horsepower, color: hit.color,
    });
  if (type === "downpayment")
    Object.assign(out, {
      vehicle_type: hit.year ? `${typeWithYear} (${hit.year})` : typeWithYear, chassis_number: hit.chassis_number,
      engine_number: hit.engine_number, horsepower: hit.horsepower, color: hit.color,
    });
  if (type === "rental")
    Object.assign(out, {
      vehicle_type: hit.label, engine_number: hit.engine_number, chassis_number: hit.chassis_number,
      daily_rate: hit.daily_rate ? String(hit.daily_rate) : undefined,
    });
  Object.keys(out).forEach((k) => (out[k] === "" || out[k] === undefined || out[k] === null) && delete out[k]);
  return out;
}

// ---------------------------------------------------------------- API

export const getDocToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("token") || localStorage.getItem("dealer_token");

export class DocApiError extends Error {
  status: number;
  missing: string[];
  constructor(message: string, status: number, missing: string[] = []) {
    super(message);
    this.status = status;
    this.missing = missing;
  }
}

export async function docApi<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}/api/superadmin/documents${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getDocToken() || ""}`, ...(init?.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail;
    if (detail && typeof detail === "object" && Array.isArray(detail.missing)) {
      throw new DocApiError(detail.message || "Missing fields", res.status, detail.missing);
    }
    const msg =
      typeof detail === "string"
        ? detail
        : res.status === 403
        ? "Only the owner can use the Document Center."
        : `Request failed (HTTP ${res.status}).`;
    throw new DocApiError(msg, res.status);
  }
  return body as T;
}

export const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Date-only display, e.g. "25/11/2026" (as printed on the paper forms). */
export function docDate(s?: string | null): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
