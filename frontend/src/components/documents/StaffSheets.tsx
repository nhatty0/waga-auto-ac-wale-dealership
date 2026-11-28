"use client";

/**
 * Staff (HR) document sheets, following the client's paper templates in docs/templates/staff/:
 *   EmploymentContractSheet  A4 portrait, multi-page (letterhead + footer repeat on every page)
 *   PropertyHandoverSheet    A4 landscape table (ንብረት መረካከቢያ ፎርም)
 * Styled by DOC_SHEET_CSS (ds-*) plus STAFF_SHEET_CSS (ss-*). Both are copied into a bare print
 * iframe, so no Tailwind here.
 */
import React from "react";
import type { Dealership } from "@/types";
import { DocData, PropertyItem, docDate, str } from "@/lib/docCenter";
import { birrInAmharicWords, formatBirr } from "@/lib/amharicNumber";
import { CONTACT_EMAIL, dealerPhoneLines } from "@/lib/contact";
import { ethiopianDate, ethiopianDateLong } from "@/lib/ethiopianDate";
import { EMPLOYMENT_ARTICLES, SIGNING_ARTICLE } from "@/lib/staffDocs";
import { StampMark } from "@/components/print/Stamp";
import { Letterhead } from "@/components/documents/DocSheets";

export const STAFF_SHEET_CSS = `
.ss-frame { width: 100%; border-collapse: collapse; }
.ss-frame > thead > tr > td, .ss-frame > tfoot > tr > td, .ss-frame > tbody > tr > td { padding: 0; vertical-align: top; }
.ss-frame > thead > tr > td { padding-bottom: 10px; }
.ss-frame > tfoot > tr > td { padding-top: 10px; }
.ss-foot { text-align: center; font: 700 11.5px/1.45 Arial, sans-serif; }
.ss-foot-blue { height: 3px; background: #1f4e9c; width: 46%; margin: 0 auto 4px; }
.ss-foot-orange { height: 7px; background: #f5a623; border-radius: 999px; width: 82%; margin: 5px auto 0; }
.ss-contract { font-size: 12px; line-height: 1.5; padding-top: 28px; padding-bottom: 24px; }
.ss-contract .ds-head { padding: 6px 12px 5px; }
.ss-contract .ds-brand img { width: 46px; height: 46px; }
.ss-contract .ds-brand-market { font-size: 22px; }
.ss-contract .ds-head-right { font-size: 24px; }
.ss-contract .ds-meta { margin: 2px 0 0; }
.ss-contract .ds-title { margin: 4px 0 12px; font-size: 17px; }
.ss-contract .ds-row { margin: 0 0 5px; }
.ss-contract .ds-fill { min-width: 90px; min-height: 1.35em; }
.ss-contract .ds-fill.ds-sm { min-width: 60px; }
.ss-art { margin-top: 4px; }
.ss-art-head { text-align: center; font-weight: 900; font-size: 13px; line-height: 1.35; margin: 7px 0 3px; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
.ss-art-head span { display: block; text-decoration: underline; text-underline-offset: 3px; }
.ss-contract .ds-clause { margin: 0 0 2px; padding-left: 40px; text-indent: -40px; break-inside: avoid; page-break-inside: avoid; line-height: 1.55; }
.ss-contract .ds-clause b { width: 40px; }
.ss-center { text-align: center; font-weight: 800; margin: 4px 0; }
.ss-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 14px; }
.ss-sign-title { font-weight: 900; margin-bottom: 6px; }
.ss-sign-row { display: flex; align-items: baseline; gap: 8px; margin: 0 0 9px; }
.ss-sign-row > span:first-child { width: 64px; flex: none; font-weight: 700; text-decoration: underline; }
.ss-sign-row .ds-fill { flex: 1 1 auto; min-width: 0; }
.ss-guar { margin-top: 12px; }
.ss-guar-sign { width: 60%; margin: 14px auto 0; }
/* Property handover: A4 landscape */
.ss-land { width: 1123px; min-height: 794px; padding: 26px 34px 22px; font-size: 12.5px; }
.ss-land .ds-head { padding: 5px 12px 4px; }
.ss-land .ds-brand img { width: 40px; height: 40px; }
.ss-land .ds-brand-market { font-size: 20px; }
.ss-land .ds-head-right { font-size: 20px; }
.ss-land .ds-title { margin: 8px 0 8px; font-size: 19px; text-decoration: none; }
.ss-land-meta { display: grid; grid-template-columns: 1.4fr 1fr 1fr 0.8fr 0.8fr; gap: 6px 14px; margin-bottom: 6px; }
.ss-land-meta .ds-row { margin: 0; flex-wrap: nowrap; }
.ss-land-meta .ds-fill { min-width: 0; flex: 1 1 auto; }
.ss-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ss-table th, .ss-table td { border: 1px solid #000; padding: 3px 6px; height: 27px; vertical-align: middle; overflow-wrap: anywhere; }
.ss-table th { font-weight: 800; font-size: 13px; text-align: center; height: 30px; }
.ss-table td { font-weight: 600; font-size: 12px; line-height: 1.25; }
.ss-table tr { break-inside: avoid; page-break-inside: avoid; }
.ss-table td.ss-c { text-align: center; }
.ss-ret { font-size: 10.5px; font-weight: 800; }
.ss-land-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding-top: 12px; text-align: left; }
.ss-table td.ss-foot-cell { border: none; padding: 0; height: auto; font-size: 12.5px; font-weight: 400; }
@media print {
  .ss-land { width: 100%; min-height: 0; padding: 0; }
}
`;

const Fill = ({ v, cls = "" }: { v?: unknown; cls?: string }) => <span className={`ds-fill ${cls}`}>{str(v) || " "}</span>;

/** Footer like the paper: blue rule, phones + e-mail from Settings, orange bar. */
function SheetFooter({ dealership }: { dealership?: Dealership | null }) {
  const phones = dealerPhoneLines(dealership).map((p) => p.display);
  const email = dealership?.email || CONTACT_EMAIL;
  return (
    <div className="ss-foot">
      <div className="ss-foot-blue" />
      {phones.length > 0 && <div>Telephone :- {phones.join(" / ")}</div>}
      {email && <div>Email :- {email}</div>}
      <div className="ss-foot-orange" />
    </div>
  );
}

/** Repeats the letterhead and footer on every printed page (thead/tfoot repeat in print). */
function Paged({ dealership, children }: { dealership?: Dealership | null; children: React.ReactNode }) {
  return (
    <table className="ss-frame">
      <thead>
        <tr>
          <td>
            <Letterhead dealership={dealership} />
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td>
            <SheetFooter dealership={dealership} />
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Renders "text {key} text {key:sm}" with inline fields. */
function Inline({ text, values }: { text: string; values: Record<string, string> }) {
  const parts = text.split(/(\{\w+(?::sm)?\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\{(\w+)(:sm)?\}$/.exec(p);
        if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
        return <Fill key={i} v={values[m[1]]} cls={m[2] ? "ds-sm" : ""} />;
      })}
    </>
  );
}

function SignRow({ label, v }: { label: string; v?: unknown }) {
  return (
    <div className="ss-sign-row">
      <span>{label}</span>
      <Fill v={v} />
    </div>
  );
}

// ------------------------------------------------------------------ Employment contract

/** `stamp`: company stamp data: URL (final only), placed on the EMPLOYER's signature. */
export function EmploymentContractSheet({
  number,
  data,
  dealership,
  stamp = null,
}: {
  number: string;
  data: DocData;
  dealership?: Dealership | null;
  stamp?: string | null;
}) {
  const salary = str(data.salary);
  const values: Record<string, string> = {};
  Object.entries(data).forEach(([k, v]) => (values[k] = typeof v === "string" || typeof v === "number" ? String(v) : ""));
  values.start_date_ec = ethiopianDate(str(data.start_date));
  values.salary_figures = salary ? formatBirr(salary) : "";
  values.salary_words = str(data.salary_words) || birrInAmharicWords(salary);
  const ecDate = ethiopianDate(str(data.date));
  const signedOn = ethiopianDateLong(str(data.date));
  const employee = [str(data.employee_title), str(data.employee_name)].filter(Boolean).join(" ");

  return (
    <div className="ds-sheet ss-contract">
      <Paged dealership={dealership}>
        <div className="ds-meta">
          <div className="ds-meta-row">
            <span>ቀን:-</span>
            <Fill v={ecDate ? `${ecDate} ዓ.ም` : ""} cls="ds-sm" />
          </div>
          <div className="ds-meta-row">
            <span>የውል ቁጥር:-</span>
            <Fill v={number} cls="ds-sm" />
          </div>
        </div>
        <div className="ds-title">የሰራተኛ የስራ ቅጥር የውል ስምምነት</div>

        <div className="ds-block">
          <div className="ds-row">
            <span className="ds-label" style={{ textDecoration: "underline" }}>አሰሪ:-</span>
            <Fill v={data.employer_name} cls="ds-grow" />
          </div>
          <div className="ds-row">
            <span className="ds-label" style={{ textDecoration: "underline" }}>አድራሻ</span>
            <span className="ds-label">ከተማ</span>
            <Fill v={data.employer_city} cls="ds-sm" />
            <span className="ds-label">ክ/ከተማ</span>
            <Fill v={data.employer_subcity} cls="ds-sm" />
            <span className="ds-label">ወረዳ</span>
            <Fill v={data.employer_woreda} cls="ds-sm" />
            <span className="ds-label">ቀበሌ</span>
            <Fill v={data.employer_kebele} cls="ds-sm" />
            <span className="ds-label">የቤ.ት.ቁ</span>
            <Fill v={data.employer_house_no} cls="ds-sm" />
          </div>
          <div className="ds-row">ከዚህ በኋላ አሰሪ እየተባለ በሚጠራው መካከል</div>
        </div>
        <div className="ss-center">እና</div>
        <div className="ds-block">
          <div className="ds-row">
            <span className="ds-label" style={{ textDecoration: "underline" }}>ሰራተኛ:-</span>
            <span className="ds-label">አቶ/ወ/ሮ/ወ/ሪት</span>
            <Fill v={employee} cls="ds-grow" />
            <span className="ds-label">የትውልድ ዘመን</span>
            <Fill v={data.employee_birth_year} cls="ds-sm" />
          </div>
          <div className="ds-row">
            <span className="ds-label">ዜግነት</span>
            <Fill v={data.employee_nationality} cls="ds-sm" />
            <span className="ds-label">የቤተሰብ ሁኔታ</span>
            <Fill v={data.employee_marital_status} cls="ds-sm" />
            <span className="ds-label">የትምህርት ደረጃ</span>
            <Fill v={data.employee_education} cls="ds-grow" />
          </div>
          <div className="ds-row">
            <span className="ds-label" style={{ textDecoration: "underline" }}>አድራሻ:-</span>
            <span className="ds-label">ከተማ</span>
            <Fill v={data.employee_city} cls="ds-sm" />
            <span className="ds-label">ክ/ከተማ</span>
            <Fill v={data.employee_subcity} cls="ds-sm" />
            <span className="ds-label">ወረዳ</span>
            <Fill v={data.employee_woreda} cls="ds-sm" />
            <span className="ds-label">ቀበሌ</span>
            <Fill v={data.employee_kebele} cls="ds-sm" />
            <span className="ds-label">የቤት ቁጥር</span>
            <Fill v={data.employee_house_no} cls="ds-sm" />
          </div>
          <div className="ds-row">
            <span className="ds-label">ስልክ ቁጥር</span>
            <Fill v={data.employee_phone} cls="ds-sm" />
            <span>ከዚህ በኋላ ሰራተኛ እየተባለ በሚጠራው መካከል ይህ የስራ ውል ስምምነት ተፈፅሟል።</span>
          </div>
        </div>

        {EMPLOYMENT_ARTICLES.map((a) => (
          <div className="ss-art" key={a.n}>
            <div className="ss-art-head">
              <span>{a.n}</span>
              <span>{a.title}</span>
            </div>
            {a.clauses
              .filter((c) => !c.onlyIf || str(data[c.onlyIf]).trim())
              .map((c) => (
                <p className="ds-clause" key={c.no}>
                  <b>{c.no}</b>
                  <Inline text={c.text} values={values} />
                </p>
              ))}
          </div>
        ))}

        <div className="ds-block">
          <div className="ss-art-head">
            <span>{SIGNING_ARTICLE.n}</span>
            <span>{SIGNING_ARTICLE.title}</span>
          </div>
          <p className="ss-center" style={{ fontWeight: 700, margin: "8px 0" }}>
            ይህ ውል ዛሬ <Fill v={signedOn} /> ዓ.ም በ <Fill v={data.sign_city} cls="ds-sm" /> ከተማ ተፈረመ።
          </p>
          <div className="ss-signs">
            <div>
              <div className="ss-sign-title">የሰራተኛው</div>
              <SignRow label="ሙሉ ስም" v={employee} />
              <SignRow label="ሃላፊነት" v={data.job_position} />
              <SignRow label="ፊርማ" />
            </div>
            {/* The stamp sits on the employer's signature; the block reserves its height. */}
            <div style={{ position: "relative", minHeight: stamp ? "36mm" : undefined }}>
              <div className="ss-sign-title">የአሰሪው መ/ቤት ኃላፊ/ተወካይ</div>
              <SignRow label="ሙሉ ስም" v={data.employer_rep_name} />
              <SignRow label="ሃላፊነት" v={data.employer_rep_title} />
              <SignRow label="ፊርማ" />
              <StampMark src={stamp} widthMm={34} style={{ right: 70, top: 18 }} />
            </div>
          </div>
        </div>

        <div className="ds-block ss-guar">
          <p className="ds-para" style={{ textIndent: 0, margin: "0 0 4px", lineHeight: 1.9 }}>
            እኔ <Fill v={data.guarantor_name} cls="ds-grow" /> የተባልኩ በድርጅቱ ለተቀጠረው/ችው ሰራተኛ ዋስ የሆንኩላቸው መሆኔን በፊርማዬ አረጋግጣለሁ።
          </p>
          <div className="ds-row">
            <span className="ds-label">አድራሻ:-</span>
            <span className="ds-label">ከተማ</span>
            <Fill v={data.guarantor_city} cls="ds-sm" />
            <span className="ds-label">ክ/ከተማ</span>
            <Fill v={data.guarantor_subcity} cls="ds-sm" />
            <span className="ds-label">ወረዳ</span>
            <Fill v={data.guarantor_woreda} cls="ds-sm" />
            <span className="ds-label">ቀበሌ</span>
            <Fill v={data.guarantor_kebele} cls="ds-sm" />
            <span className="ds-label">የቤት ቁጥር</span>
            <Fill v={data.guarantor_house_no} cls="ds-sm" />
            <span className="ds-label">ስልክ</span>
            <Fill v={data.guarantor_phone} cls="ds-sm" />
          </div>
          <div className="ss-guar-sign">
            <div className="ss-center">የዋስ ፊርማ</div>
            <SignRow label="ሙሉ ስም" v={data.guarantor_name} />
            <SignRow label="ፊርማ" />
          </div>
        </div>
      </Paged>
    </div>
  );
}

// ------------------------------------------------------------------ Property handover

/** Rows printed on one landscape page; more items continue on the next page (header repeats). */
export const PROPERTY_PRINT_ROWS = 13;

/** `stamp`: company stamp (final only), on the owner / handover signature at the bottom. */
export function PropertyHandoverSheet({
  number,
  data,
  dealership,
  stamp = null,
}: {
  number: string;
  data: DocData;
  dealership?: Dealership | null;
  stamp?: string | null;
}) {
  const items = ((data.items as PropertyItem[]) || []).filter((i) => str(i?.item).trim());
  const blanks = Math.max(0, PROPERTY_PRINT_ROWS - items.length);
  const remarks = (i: PropertyItem) => {
    const ret = i.returned ? `ተመልሷል${i.returned_date ? ` ${docDate(i.returned_date)}` : ""}` : "";
    return (
      <>
        {i.remarks}
        {i.remarks && ret ? " · " : ""}
        {ret && <span className="ss-ret">✓ {ret}</span>}
      </>
    );
  };
  return (
    <div className="ds-sheet ss-land">
      <Letterhead dealership={dealership} />
      <div className="ds-title">ንብረት መረካከቢያ ፎርም</div>
      <div className="ss-land-meta">
        <div className="ds-row">
          <span className="ds-label">ሰራተኛ</span>
          <Fill v={data.staff_name} />
        </div>
        <div className="ds-row">
          <span className="ds-label">ስልክ</span>
          <Fill v={data.staff_phone} />
        </div>
        <div className="ds-row">
          <span className="ds-label">የስራ መደብ</span>
          <Fill v={data.staff_position} />
        </div>
        <div className="ds-row">
          <span className="ds-label">ቀን</span>
          <Fill v={docDate(str(data.date))} />
        </div>
        <div className="ds-row">
          <span className="ds-label">ቁጥር</span>
          <Fill v={number} />
        </div>
      </div>
      {str(data.note).trim() && (
        <div className="ds-row" style={{ marginBottom: 6 }}>
          <span className="ds-label">ማስታወሻ</span>
          <Fill v={data.note} cls="ds-grow" />
        </div>
      )}
      <table className="ss-table">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "21%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>ተ.ቁ</th>
            <th>የንብረቱ ዓይነት</th>
            <th>ያስረከበው</th>
            <th>የተረከበው</th>
            <th>ሰዓት</th>
            <th>ፊርማ</th>
            <th>ማብራሪያ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={n}>
              <td className="ss-c">{n + 1}</td>
              <td>{i.item}</td>
              <td>{i.handed_by}</td>
              <td>{i.received_by}</td>
              <td className="ss-c">{i.time}</td>
              <td />
              <td>{remarks(i)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, n) => (
            <tr key={`b${n}`}>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
        {/* In tfoot so a long list never leaves the signatures alone on a page: they repeat at
            the bottom of every printed page (each page gets signed). */}
        <tfoot>
          <tr>
            <td colSpan={7} className="ss-foot-cell">
              <div className="ss-land-signs">
                <div style={{ position: "relative", minHeight: stamp ? "30mm" : undefined }}>
                  <div className="ss-sign-title">ያስረከበው (ድርጅቱ)</div>
                  <SignRow label="ስም" v={data.handover_by} />
                  <SignRow label="ፊርማ" />
                  <StampMark src={stamp} widthMm={32} style={{ right: 24, top: 2 }} />
                </div>
                <div>
                  <div className="ss-sign-title">የተረከበው ሰራተኛ</div>
                  <SignRow label="ስም" v={str(data.receiver_name) || data.staff_name} />
                  <SignRow label="ፊርማ" />
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
