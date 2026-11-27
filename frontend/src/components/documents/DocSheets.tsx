"use client";

/**
 * A4 sheets for the new Document Center types, following the client's paper templates
 * (docs/templates/downpayment_form.jpg and Car_Rental_Agreements.pdf). Styled by DOC_SHEET_CSS.
 */
import React from "react";
import type { Dealership } from "@/types";
import { DocData, RENTAL_CHECKLIST, docDate, str } from "@/lib/docCenter";
import { birrInAmharicWords, formatBirr } from "@/lib/amharicNumber";
import { CONTACT_EMAIL, dealerPhoneLines } from "@/lib/contact";
import { StampMark } from "@/components/print/Stamp";

const Fill = ({ v, cls = "" }: { v?: unknown; cls?: string }) => (
  <span className={`ds-fill ${cls}`}>{str(v) || " "}</span>
);

const Row = ({ children, indent }: { children: React.ReactNode; indent?: boolean }) => (
  <div className={`ds-row${indent ? " ds-indent" : ""}`}>{children}</div>
);

/** Black band with logo, Amharic name, phones from Settings and the e-mail. */
export function Letterhead({ dealership }: { dealership?: Dealership | null }) {
  const phones = dealerPhoneLines(dealership).map((p) => p.local);
  const email = dealership?.email || CONTACT_EMAIL;
  return (
    <div className="ds-head">
      <div className="ds-head-left">
        <div className="ds-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ac-wale-logo.png" alt="AC WALE" />
          <span className="ds-brand-market">MARKET</span>
        </div>
        {(phones.length > 0 || email) && (
          <div className="ds-contact">
            {phones.length > 0 && <span>☎ {phones.join(" / ")}</span>}
            {email && <span>✉ {email}</span>}
          </div>
        )}
      </div>
      <div className="ds-head-right">
        ኤሲ ዋለ
        <br />
        የመኪና መሸጫ
      </div>
    </div>
  );
}

function Meta({ number, date }: { number: string; date?: unknown }) {
  return (
    <div className="ds-meta">
      <div className="ds-meta-row">
        <span>ቁጥር</span>
        <Fill v={number} cls="ds-sm" />
      </div>
      <div className="ds-meta-row">
        <span>ቀን</span>
        <Fill v={docDate(str(date))} cls="ds-sm" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Down-payment receipt

/** `stamp`: the company stamp as a data: URL (final documents only), placed on the seller's
 * (the dealership's) signature. */
export function DownPaymentSheet({ number, data, dealership, stamp = null }: { number: string; data: DocData; dealership?: Dealership | null; stamp?: string | null }) {
  const amount = str(data.amount);
  const figures = amount ? `${formatBirr(amount)} ብር` : "";
  const words = str(data.amount_words) || birrInAmharicWords(amount);
  return (
    <div className="ds-sheet">
      <Letterhead dealership={dealership} />
      <Meta number={number} date={data.date} />
      <div className="ds-title">የቀብድ መቀበያ ፎርም</div>

      <Row>
        <span className="ds-label">ሻጭ/ ቀብድ የተከፈለዉ ግለሰብ /ድርጅት</span>
        <Fill v={data.seller_name} cls="ds-grow" />
      </Row>
      <Row indent>
        <span className="ds-label">አድራሻ ;</span>
        <Fill v={data.seller_city} cls="ds-sm" />
        <span className="ds-label">ክ/ከ</span>
        <Fill v={data.seller_subcity} cls="ds-sm" />
        <span className="ds-label">ወረዳ</span>
        <Fill v={data.seller_woreda} cls="ds-sm" />
        <span className="ds-label">የቤት ቁ.</span>
        <Fill v={data.seller_house_no} cls="ds-sm" />
      </Row>
      <Row>
        <span className="ds-label">ገዢ/ ቀብድ ከፋይ ስም</span>
        <Fill v={data.buyer_name} cls="ds-grow" />
      </Row>
      <Row indent>
        <span className="ds-label">አድራሻ;</span>
        <Fill v={data.buyer_city} cls="ds-sm" />
        <span className="ds-label">ክ/ከ</span>
        <Fill v={data.buyer_subcity} cls="ds-sm" />
        <span className="ds-label">ወረዳ</span>
        <Fill v={data.buyer_woreda} cls="ds-sm" />
        <span className="ds-label">የቤት ቁ.</span>
        <Fill v={data.buyer_house_no} cls="ds-sm" />
      </Row>

      {[
        ["የተሽከርካሪዉ ዓይነት", data.vehicle_type],
        ["የተሽከርካሪዉ የቻንሲ ቁጥር", data.chassis_number],
        ["የተሽከርካሪዉ የሞተር ቁጥር", data.engine_number],
        ["የተሽከርካሪዉ የፈረስ ጉልበት", data.horsepower],
        ["የተሽከርካሪዉ ቀለም", data.color],
        ["የተሽከርካሪዉ ሰሌዳ ቁጥር", data.plate_number],
      ].map(([label, v]) => (
        <Row indent key={label as string}>
          <span className="ds-label">{label as string}</span>
          <Fill v={v} cls="ds-grow" />
        </Row>
      ))}

      <p className="ds-para">
        እኔ ሻጭ ከላይ የተጠቀሰውን ተሽከርካሪ ለማስፈተሽ በዚሁ ውል መሰረት ቅድመ ክፍያ ከገዢ ላይ ቀብድ <Fill v={figures} />
        /<Fill v={words} />/ መኪናውን ካላለፈ ተመላሽ የሚሆን ተቀብያለሁ ::
      </p>
      <p className="ds-para">
        እኔ ገዢ ከሻጭ ላይ ከላይ የተጠቀሰዉን መኪና በዚህ ውል መሠረት ቅድመ ክፍያ ቀብድ <Fill v={figures} />
        /<Fill v={words} />/ መኪናው ካላለፈ ተመላሽ የሚሆን ገንዘብ ከፍያለሁ ::
      </p>

      <div className="ds-signs ds-block">
        {/* With the stamp, the column reserves its height so the stamp never crosses a page break. */}
        <div style={{ position: "relative", minHeight: stamp ? "44mm" : undefined }}>
          <div className="ds-label">የሻጭ/ቀብድ ተከፋይ ስምና ፊርማ</div>
          <div className="ds-sign-name">{str(data.seller_name)}</div>
          <div className="ds-sign-line" />
          <StampMark src={stamp} widthMm={35} style={{ right: 0, top: 30 }} />
        </div>
        <div>
          <div className="ds-label">የገዢ/ ቀብድ ከፋይ ስምና ፊርማ</div>
          <div className="ds-sign-name">{str(data.buyer_name)}</div>
          <div className="ds-sign-line" />
        </div>
      </div>
      <div className="ds-footer-line" />
    </div>
  );
}

// ------------------------------------------------------------------ Car rental agreement

const RENTER_DUTIES = [
  "በተረከብኩት መኪና ህገወጥ የሆነ እቃ ጭኜ ብገኝ ሀላፊነቱን ሙሉ በ ሙሉ እወስዳለሁ።",
  "የተረከብኩትን መኪና ከእኔ በስተቀር ለሌላ ግለሰብ ወይም ድርጅት አሳልፌ ላልሰጥ ተስማምቻለሁ።",
  "በተረከብኩት መኪና የትራፊክ ደንብ ብተላለፍ ሆነ ማንኛውም ወንጀል ተሰርቶ ቢገኝ ለሚፈለገው የህግ አካል ቀርቤ ላስረዳ እና ቅጣትም ካለ ልከፍል ተስማምቻለሁ።",
  "__KM__",
  "ጠዋት ጠዋት የመኪናውን ውሃ እና ዘይት እያየሁ ልጠቀም ተስማምቻለሁ።",
  "መኪናውን ይዤ ስንቀሳቀስ ሰውም ሆነ ንብረት ላይ አደጋ ቢደርስ ወዲያውኑ ለውል ሰጪውና ለትራፊክ ላሳውቅ ተስማምቻለው ፣ በተከራየሁት መኪና በሶስተኛ ወገን ንብረት እና ህይወት ላይ ጉዳት ባደርስ የፍትሐብሄር ሀላፊነቱ የተከራይ መሆኑን ተስማምተናል።",
  "የተረከብኩትን መኪና ስመልስ ማንኛውም ጉድለት ቢኖር ፣ ግጭት ቢገኝበት የአያያዝ ጉድለት ቢፈጠር ፤ ግጭቱን ወይም ብልሽቱን ላሰራ እና መኪናው እስኪሰራ የቆመበትን ኪራይ ልከፍል ተስማምቻለሁ።",
  "መኪናውን ለመመለስ ከተዋዋልኩበት በላይ ለማራዘም ቢያስፈልገኝ ከ24 ሰአት በፊት በግንባር ቀርቤ ውሉን ማደስ እንዳለብኝ ተስማምቻለሁ።",
];

const LESSOR_DUTIES = [
  "መኪናው በተሟላ ሁኔታ መስራቱን እና ምንም አይነት የቴክኒክ ብልሽት አለመኖሩን አረጋግጦ ማስረከብ።",
  "ተከራይ ስራውን ጨርሶ መኪናውን በተረከቡበት ሁኔታ ሲያስረክቡ ያስያዙትን ገንዘብ ወዲያውኑ ይመልሳል።",
];

function PersonLine({ n, p, data }: { n: string; p: string; data: DocData }) {
  return (
    <div className="ds-person ds-block">
      <Row>
        <span className="ds-label">{n} ስም</span>
        <Fill v={data[`${p}_name`]} cls="ds-grow" />
        <span className="ds-label">አድራሻ</span>
        <Fill v={data[`${p}_city`]} cls="ds-sm" />
        <span className="ds-label">ክ/ከተማ</span>
        <Fill v={data[`${p}_subcity`]} cls="ds-sm" />
      </Row>
      <Row indent>
        <span className="ds-label">ወረዳ</span>
        <Fill v={data[`${p}_woreda`]} cls="ds-sm" />
        <span className="ds-label">የቤት ቁጥር</span>
        <Fill v={data[`${p}_house_no`]} cls="ds-sm" />
        <span className="ds-label">ፊርማ</span>
        <Fill cls="ds-sm" />
        <span className="ds-label">ስልክ ቁጥር</span>
        <Fill v={data[`${p}_phone`]} cls="ds-grow" />
      </Row>
    </div>
  );
}

const CarSide = ({ flip }: { flip?: boolean }) => (
  <svg viewBox="0 0 200 70" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
    <path d="M8 50 L12 36 Q16 30 30 29 L58 27 L80 12 Q86 8 96 8 L132 8 Q142 8 150 14 L168 28 L186 31 Q194 33 194 42 L194 50 Z" fill="none" stroke="#000" strokeWidth="2" />
    <path d="M84 14 L98 12 L98 27 L66 27 Z M104 12 L130 12 Q138 12 144 18 L152 27 L104 27 Z" fill="none" stroke="#000" strokeWidth="1.5" />
    <circle cx="48" cy="52" r="11" fill="#fff" stroke="#000" strokeWidth="2" />
    <circle cx="156" cy="52" r="11" fill="#fff" stroke="#000" strokeWidth="2" />
  </svg>
);
const CarEnd = ({ rear }: { rear?: boolean }) => (
  <svg viewBox="0 0 120 80" aria-hidden>
    <path d="M14 62 L14 40 Q14 32 24 30 L32 14 Q35 9 42 9 L78 9 Q85 9 88 14 L96 30 Q106 32 106 40 L106 62 Z" fill="none" stroke="#000" strokeWidth="2" />
    <path d="M36 15 L84 15 L92 30 L28 30 Z" fill="none" stroke="#000" strokeWidth="1.5" />
    {rear ? <rect x="46" y="44" width="28" height="9" fill="none" stroke="#000" /> : <path d="M40 46 L80 46 M40 50 L80 50" stroke="#000" />}
    <rect x="20" y="38" width="16" height="7" fill="none" stroke="#000" />
    <rect x="84" y="38" width="16" height="7" fill="none" stroke="#000" />
    <rect x="16" y="62" width="14" height="10" fill="#000" />
    <rect x="90" y="62" width="14" height="10" fill="#000" />
  </svg>
);

/** `stamp`: the company stamp as a data: URL (final only), placed on the lessor's (dealership's) signature. */
export function RentalAgreementSheet({ number, data, dealership, stamp = null }: { number: string; data: DocData; dealership?: Dealership | null; stamp?: string | null }) {
  const checklist = (data.checklist as Record<string, string>) || {};
  const mark = (k: string) => (checklist[k] === "ok" ? "✓" : checklist[k] === "no" ? "X" : "");
  const money = (v: unknown) => (str(v) ? `${formatBirr(str(v))} ብር` : "");
  return (
    <div className="ds-sheet ds-compact">
      <Letterhead dealership={dealership} />
      <Meta number={number} date={data.date} />
      <div className="ds-title">የመኪና ኪራይ ውል ስምምነት</div>

      <div className="ds-h2">1. የተከራይ እና የአከራይ ሙሉ ስም አድራሻ</div>
      <div className="ds-block">
        <Row>
          <span className="ds-label">1. የተከራይ ስም ከነ አያት</span>
          <Fill v={data.renter_name} cls="ds-grow" />
          <span className="ds-label">ዜግነት</span>
          <Fill v={data.renter_nationality} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">አድራሻ (ከተማ)</span>
          <Fill v={data.renter_city} cls="ds-sm" />
          <span className="ds-label">ክ/ከተማ</span>
          <Fill v={data.renter_subcity} cls="ds-sm" />
          <span className="ds-label">ወረዳ</span>
          <Fill v={data.renter_woreda} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">የቤት ቁጥር</span>
          <Fill v={data.renter_house_no} cls="ds-sm" />
          <span className="ds-label">መታወቂያ ቁጥር</span>
          <Fill v={data.renter_id_number} cls="ds-grow" />
        </Row>
        <Row indent>
          <span className="ds-label">የመንጃ ፍቃድ ቁጥር</span>
          <Fill v={data.renter_license_number} cls="ds-grow" />
          <span className="ds-label">ስልክ ቁጥር (የቢሮ)</span>
          <Fill v={data.renter_office_phone} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">ሞባይል</span>
          <Fill v={data.renter_mobile} />
        </Row>
      </div>
      <div className="ds-block">
        <Row>
          <span className="ds-label">2. የአከራይ ስም ከነ አያት</span>
          <Fill v={data.lessor_name} cls="ds-grow" />
          <span className="ds-label">ዜግነት</span>
          <Fill v={data.lessor_nationality} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">አድራሻ (ከተማ)</span>
          <Fill v={data.lessor_city} cls="ds-sm" />
          <span className="ds-label">ወረዳ</span>
          <Fill v={data.lessor_woreda} cls="ds-sm" />
          <span className="ds-label">ክ/ከተማ</span>
          <Fill v={data.lessor_subcity} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">የቤት ቁጥር</span>
          <Fill v={data.lessor_house_no} cls="ds-sm" />
          <span className="ds-label">መታወቂያ ቁጥር</span>
          <Fill v={data.lessor_id_number} cls="ds-grow" />
        </Row>
        <Row indent>
          <span className="ds-label">የሊብሬ ቁጥር</span>
          <Fill v={data.lessor_libre_number} cls="ds-grow" />
          <span className="ds-label">ስልክ ቁጥር (የቢሮ)</span>
          <Fill v={data.lessor_office_phone} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">ሞባይል</span>
          <Fill v={data.lessor_mobile} />
        </Row>
      </div>

      <div className="ds-h2">2. የተከራይ ግዴታዎች</div>
      {RENTER_DUTIES.map((t, i) => (
        <p className="ds-clause" key={i}>
          <b>2.{i + 1}.</b>
          {t === "__KM__" ? (
            <>
              ከተስማማሁበት ክልል ወጪ ወጥቼ ከተገኘሁ በ ኪሎሜትር <Fill v={data.km_overage_rate} cls="ds-sm" /> ብር ልከፍል ተስማምቻለሁ።
            </>
          ) : (
            t
          )}
        </p>
      ))}

      <div className="ds-h2">3. የአከራይ ግዴታዎች</div>
      {LESSOR_DUTIES.map((t, i) => (
        <p className="ds-clause" key={i}>
          <b>3.{i + 1}.</b>
          {t}
        </p>
      ))}

      <div className="ds-block">
        <div className="ds-h2">4. የመኪና መረካከቢያ ዝርዝር</div>
        <Row>
          <span className="ds-label">4.1. መኪናውን የተረከቡበት ቀን</span>
          <Fill v={docDate(str(data.pickup_date))} />
          <span className="ds-label">ሰአት</span>
          <Fill v={data.pickup_time} cls="ds-sm" />
          <span className="ds-label">ኪ.ሜ</span>
          <Fill v={data.pickup_km} cls="ds-sm" />
        </Row>
        <Row>
          <span className="ds-label">4.2. የአንድ ቀን ክፍያ ተመን</span>
          <Fill v={money(data.daily_rate)} cls="ds-sm" />
          <span className="ds-label">የተከራየበት ቀን ብዛት</span>
          <Fill v={data.days} cls="ds-sm" />
          <span className="ds-label">አጠቃላይ ክፍያ</span>
          <Fill v={money(data.total)} cls="ds-sm" />
        </Row>
        <Row indent>
          <span className="ds-label">ለዋስትና የተያዘ ገንዘብ</span>
          <Fill v={money(data.deposit)} cls="ds-sm" />
          <span className="ds-label">ቀሪ ክፍያ</span>
          <Fill v={money(data.balance)} cls="ds-sm" />
        </Row>
        <Row>
          <span className="ds-label">4.3. የመኪናው ታርጋ ቁጥር</span>
          <Fill v={data.plate_number} cls="ds-sm" />
          <span className="ds-label">የሞተር ቁጥር</span>
          <Fill v={data.engine_number} cls="ds-sm" />
          <span className="ds-label">ሻንሲ ቁጥር</span>
          <Fill v={data.chassis_number} cls="ds-sm" />
        </Row>
        <Row>
          <span className="ds-label">4.4. የመኪናው መመለሻ ቀን</span>
          <Fill v={docDate(str(data.return_date))} />
          <span className="ds-label">ሰአት</span>
          <Fill v={data.return_time} cls="ds-sm" />
          <span className="ds-label">ኪ.ሜ</span>
          <Fill v={data.return_km} cls="ds-sm" />
        </Row>
        <Row>
          <span className="ds-label">4.5. ለዋስትና የተያዘ ቼክ</span>
          <Fill v={data.cheque_bank} cls="ds-grow" />
          <span className="ds-label">የቼክ ቁጥር</span>
          <Fill v={data.cheque_number} cls="ds-sm" />
          <span className="ds-label">ፊርማ</span>
          <Fill cls="ds-sm" />
        </Row>
        <p className="ds-note">መግለጫ፡- ለዋስትና የተያዘው ቼክ መኪናው በሚመለስበት ወቅት ለባለቤቱ ተመላሽ ይደረጋል።</p>
      </div>

      <p className="ds-legal">
        ተሽከርካሪውን በተመለከተ ከላይ በተዘረዘረው መሰረት አይቼ የተረከብኩ ሲሆን በውሉ መሰረት ኮንትራቴ ሲጠናቀቅ ተሽከርካሪውን በተረከብኩበት ሁኔታ
        ለማስረከብ የተስማማው ስለመሆኑ በፍ/ብ/ሕ/ቁ 1975/1691/1731/2005 በህግ ፊት የሚጸና ውል ውድጄ እና ፈቅጄ ፈርሜያለው።
      </p>
      <p className="ds-legal">
        ይህ ዉል ከሁለት አንዳችን ለማፍረስ የሚሞክር ወገን ቢኖር ዉሉን ላከበረ ወገን 10,000 ብር (አስር ሺህ ብር) ለመንግስት 5,000 ብር (አምስት ሺህ
        ብር) ከፍሎ ዉሉን በፍ/ብ/ሕ/ቁ 1889/1890 ከፍሎ ዉሉን በፍ/ብ/ሕ/ቁ 1731/2005/2266 መሰረት በሕግ ፊት የጸና ይሆናል።
      </p>

      <div className="ds-signs ds-block" style={{ marginTop: 14 }}>
        {[
          ["የተከራይ ስም", data.renter_name],
          ["የአከራይ ስም", data.lessor_name],
        ].map(([label, name], i) => (
          <div key={label as string} style={{ position: "relative", minHeight: i === 1 && stamp ? "37mm" : undefined }}>
            {i === 1 && <StampMark src={stamp} widthMm={35} style={{ right: 0, top: 4 }} />}
            <Row>
              <span className="ds-label">{label as string}</span>
              <Fill v={name} cls="ds-grow" />
            </Row>
            <Row>
              <span className="ds-label">ፊርማ</span>
              <Fill cls="ds-grow" />
            </Row>
            <Row>
              <span className="ds-label">ቀን</span>
              <Fill v={docDate(str(data.date))} cls="ds-grow" />
            </Row>
          </div>
        ))}
      </div>

      <div className="ds-h3">የዋስ</div>
      <PersonLine n="1." p="guarantor" data={data} />
      <div className="ds-h3">የምስክሮች</div>
      <PersonLine n="1." p="witness1" data={data} />
      <PersonLine n="2." p="witness2" data={data} />
      <PersonLine n="3." p="witness3" data={data} />

      <div className="ds-block">
        <div className="ds-h2">5. የመኪና ዝርዝር</div>
        <Row>
          <span className="ds-label">የመኪናው አይነት</span>
          <Fill v={data.vehicle_type} cls="ds-grow" />
          <span className="ds-label">የሰሌዳ ቁጥር</span>
          <Fill v={data.plate_number} cls="ds-sm" />
          <span className="ds-label">የነዳጅ መጠን</span>
          <Fill v={data.fuel_level} cls="ds-sm" />
        </Row>
      </div>

      <div className="ds-block">
        <div className="ds-h2">6. ከመኪናው ጋር አብረው ያሉ እቃዎች እና የተሽከርካሪው ሁኔታ</div>
        <div className="ds-check">
          {RENTAL_CHECKLIST.map((c) => (
            <div className="ds-check-item" key={c.key}>
              <span>{c.am}</span>
              <span className="ds-box">{mark(c.key)}</span>
            </div>
          ))}
        </div>
        <div className="ds-small ds-label">ምልክቶች</div>
        <div className="ds-legend">
          <span>✓ = በትክክል የሚሰራ ከሆነ ወይም እቃዎች ካሉ</span>
          <span>X = በትክክል የማይሰራ ከሆነ ወይም እቃዎች ከሌሉ</span>
        </div>
        {str(data.body_notes) && (
          <Row>
            <span className="ds-label">ማስታወሻ</span>
            <Fill v={data.body_notes} cls="ds-grow" />
          </Row>
        )}
        <div className="ds-cars">
          <div className="ds-car"><CarEnd rear />ከኋላ</div>
          <div className="ds-car"><CarSide />ግራ ጎን</div>
          <div className="ds-car"><CarSide flip />ቀኝ ጎን</div>
          <div className="ds-car"><CarEnd />ከፊት</div>
        </div>
      </div>
    </div>
  );
}
