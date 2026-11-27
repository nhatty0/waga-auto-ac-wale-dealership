"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";
import PrintModalShell from "@/components/print/PrintModalShell";
import ScaledPreview, { A4_PORTRAIT_PX } from "@/components/print/ScaledPreview";
import { StampToggle } from "@/components/print/Stamp";
import { nextPaint, useDocStamp } from "@/lib/stamp";

/**
 * Self-contained print styles for the Document Center sheets (Down-payment Receipt, Rental
 * Agreement). No Tailwind: the sheet is copied into an empty iframe to print, so it must not
 * depend on the app's stylesheet. All classes are prefixed "ds-".
 */
export const DOC_SHEET_CSS = `
.ds-sheet { box-sizing: border-box; width: 794px; min-height: 1123px; margin: 0 auto; padding: 40px 46px 36px;
  background: #fff; color: #000; font-family: "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", "Ebrima", system-ui, sans-serif;
  font-size: 13.5px; line-height: 1.55; }
.ds-sheet * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ds-head { background: #000; color: #f5e000; border-radius: 4px; padding: 10px 16px 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ds-head-left { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ds-brand { display: flex; align-items: center; gap: 10px; }
.ds-brand img { width: 64px; height: 64px; object-fit: contain; }
.ds-brand-market { font: 900 30px/1 "Arial Black", Arial, sans-serif; letter-spacing: 1px; color: #f5e000; }
.ds-contact { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; background: #fff; color: #000; border-radius: 999px; padding: 3px 12px; font: 700 11.5px/1.4 Arial, sans-serif; }
.ds-head-right { font-weight: 900; font-size: 34px; line-height: 1.12; text-align: center; color: #f5e000; }
.ds-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin: 14px 0 6px; }
.ds-meta-row { display: flex; gap: 8px; align-items: baseline; font-weight: 700; }
.ds-title { text-align: center; font-weight: 900; font-size: 19px; text-decoration: underline; text-underline-offset: 5px; margin: 10px 0 18px; }
.ds-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; margin: 0 0 11px; }
.ds-label { white-space: nowrap; font-weight: 600; }
.ds-fill { display: inline-block; min-width: 120px; border-bottom: 1px dotted #000; padding: 0 6px; font-weight: 700; flex: 0 1 auto; min-height: 1.4em; }
.ds-fill.ds-grow { flex: 1 1 160px; }
.ds-fill.ds-sm { min-width: 70px; }
.ds-indent { padding-left: 34px; }
.ds-para { text-align: justify; margin: 14px 0; text-indent: 34px; line-height: 2; }
.ds-para .ds-fill { min-width: 90px; text-indent: 0; }
.ds-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; }
.ds-sign-line { border-bottom: 1px solid #000; height: 34px; margin-top: 8px; }
.ds-sign-name { font-weight: 700; margin-top: 4px; min-height: 1.4em; }
.ds-footer-line { height: 4px; background: #2f6fd1; margin-top: 40px; }
.ds-h2 { font-weight: 900; font-size: 15px; text-align: center; margin: 16px 0 10px; }
.ds-h3 { font-weight: 900; font-size: 14px; margin: 14px 0 6px; text-decoration: underline; }
.ds-clause { margin: 0 0 5px; padding-left: 34px; text-indent: -34px; text-align: justify; }
.ds-clause b { display: inline-block; width: 34px; text-indent: 0; }
.ds-clause .ds-fill, .ds-legal .ds-fill { text-indent: 0; }
.ds-block { break-inside: avoid; page-break-inside: avoid; }
.ds-note { font-weight: 800; margin: 8px 0; }
.ds-legal { text-align: justify; margin: 8px 0; line-height: 1.8; }
.ds-person { margin: 0 0 8px; }
.ds-check { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 36px; margin: 8px 0 10px; }
.ds-check-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ds-box { width: 66px; height: 26px; border: 1.5px solid #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; }
.ds-legend { display: flex; gap: 30px; font-size: 12px; font-weight: 700; margin: 6px 0; }
.ds-cars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
.ds-car { border: 1px solid #999; border-radius: 6px; padding: 6px; text-align: center; font-size: 11px; }
.ds-car svg { width: 100%; height: 64px; }
.ds-small { font-size: 12px; }
/* Rental agreement: denser so the whole contract fits on 2 A4 pages. */
.ds-compact { font-size: 12px; line-height: 1.4; padding-top: 28px; }
.ds-compact .ds-head { padding: 6px 12px 5px; }
.ds-compact .ds-brand img { width: 44px; height: 44px; }
.ds-compact .ds-brand-market { font-size: 22px; }
.ds-compact .ds-head-right { font-size: 24px; }
.ds-compact .ds-meta { margin: 6px 0 0; flex-direction: row; justify-content: flex-end; gap: 16px; }
.ds-compact .ds-title { margin: 4px 0 8px; font-size: 17px; }
.ds-compact .ds-row { margin: 0 0 5px; }
.ds-compact .ds-h2 { margin: 9px 0 5px; font-size: 13px; }
.ds-compact .ds-h3 { margin: 8px 0 4px; font-size: 13px; }
.ds-compact .ds-clause { margin: 0 0 2px; }
.ds-compact .ds-legal { margin: 5px 0; line-height: 1.5; }
.ds-compact .ds-note { margin: 4px 0; }
.ds-compact .ds-person { margin: 0 0 4px; }
.ds-compact .ds-check { gap: 3px 30px; margin: 4px 0 6px; }
.ds-compact .ds-box { height: 20px; width: 56px; font-size: 14px; }
.ds-compact .ds-cars { margin-top: 6px; gap: 8px; }
.ds-compact .ds-car { padding: 3px; }
.ds-compact .ds-car svg { height: 44px; }
.ds-compact .ds-fill { min-height: 1.3em; }
.ds-pagebreak { break-before: page; page-break-before: always; height: 0; }
@media screen { /* Rental agreement: denser so the whole contract fits on 2 A4 pages. */
.ds-compact { font-size: 12px; line-height: 1.4; padding-top: 28px; }
.ds-compact .ds-head { padding: 6px 12px 5px; }
.ds-compact .ds-brand img { width: 44px; height: 44px; }
.ds-compact .ds-brand-market { font-size: 22px; }
.ds-compact .ds-head-right { font-size: 24px; }
.ds-compact .ds-meta { margin: 6px 0 0; flex-direction: row; justify-content: flex-end; gap: 16px; }
.ds-compact .ds-title { margin: 4px 0 8px; font-size: 17px; }
.ds-compact .ds-row { margin: 0 0 5px; }
.ds-compact .ds-h2 { margin: 9px 0 5px; font-size: 13px; }
.ds-compact .ds-h3 { margin: 8px 0 4px; font-size: 13px; }
.ds-compact .ds-clause { margin: 0 0 2px; }
.ds-compact .ds-legal { margin: 5px 0; line-height: 1.5; }
.ds-compact .ds-note { margin: 4px 0; }
.ds-compact .ds-person { margin: 0 0 4px; }
.ds-compact .ds-check { gap: 3px 30px; margin: 4px 0 6px; }
.ds-compact .ds-box { height: 20px; width: 56px; font-size: 14px; }
.ds-compact .ds-cars { margin-top: 6px; gap: 8px; }
.ds-compact .ds-car { padding: 3px; }
.ds-compact .ds-car svg { height: 44px; }
.ds-compact .ds-fill { min-height: 1.3em; }
.ds-pagebreak { break-before: auto; border-top: 2px dashed #bbb; margin: 26px -46px; height: 0; } }
@media print {
  @page { size: A4 portrait; margin: 11mm 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .ds-sheet { width: 100%; min-height: 0; padding: 0; }
}
`;

interface DocPrintModalProps {
  title: string;
  number: string;
  onClose: () => void;
  /** Open the system print dialog as soon as the sheet is ready (the "Print / PDF" button). */
  autoPrint?: boolean;
  headerActions?: React.ReactNode;
  /** Final documents may carry the company stamp (drafts never do). */
  stampAllowed?: boolean;
  /** The form's "Stamp" toggle (default ON). */
  initialStamp?: boolean;
  /** Called after a copy was sent to print WITH the stamp (records stamped / stamped_by). */
  onStampedPrint?: () => void;
  /** The sheet; given the stamp data: URL (or null) to place on the company's signature. */
  children: (stampSrc: string | null) => React.ReactNode;
}

/** Print an element's HTML in a hidden iframe with only the sheet styles. */
export function printSheet(el: HTMLElement, docTitle: string) {
  document.getElementById("ds-print-frame")?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "ds-print-frame";
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) return;
  const safeTitle = docTitle.replace(/[<>&]/g, "");
  doc.open();
  doc.write(
    `<!DOCTYPE html><html lang="am"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${safeTitle}</title><style>${DOC_SHEET_CSS}</style></head><body>${el.outerHTML}</body></html>`
  );
  doc.close();
  const go = () => {
    win.focus();
    win.print();
  };
  const imgs = Array.from(doc.images);
  Promise.all(
    imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); })))
  ).then(() => setTimeout(go, 150));
}

export default function DocPrintModal({
  title,
  number,
  onClose,
  autoPrint,
  headerActions,
  stampAllowed = false,
  initialStamp = true,
  onStampedPrint,
  children,
}: DocPrintModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const printed = useRef(false);
  const stamp = useDocStamp(stampAllowed, initialStamp);

  const handlePrint = async () => {
    if (!stamp.ready) return;
    await nextPaint();
    const el = sheetRef.current?.querySelector<HTMLElement>(".ds-sheet");
    if (!el) return;
    printSheet(el, `${number} ${title}`);
    if (stamp.src && el.querySelector("img.doc-stamp")) onStampedPrint?.();
  };

  // Auto print waits for the stamp so a final copy never goes out unstamped by accident.
  useEffect(() => {
    if (!autoPrint || printed.current || !stamp.ready) return;
    printed.current = true;
    const t = setTimeout(handlePrint, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, stamp.ready]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <PrintModalShell
      title={title}
      description="A4 · Print or save as PDF"
      icon={<FileText size={20} className="text-amber-400" />}
      badge={<span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">{number}</span>}
      onClose={onClose}
      onPrint={handlePrint}
      printing={!stamp.ready}
      printTitle="Print / PDF (ማተም)"
      headerActions={
        <>
          <StampToggle stamp={stamp} />
          {headerActions}
        </>
      }
      maxWidthClass="sm:max-w-4xl"
    >
      <style>{DOC_SHEET_CSS}</style>
      <div className="p-3 sm:p-5 bg-zinc-800/40" ref={sheetRef}>
        <ScaledPreview designWidth={A4_PORTRAIT_PX}>{children(stamp.src)}</ScaledPreview>
      </div>
    </PrintModalShell>,
    document.body
  );
}
