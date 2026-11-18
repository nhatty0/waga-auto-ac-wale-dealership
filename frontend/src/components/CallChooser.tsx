"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Phone, X } from "lucide-react";
import { PhoneLine } from "@/lib/contact";

interface CallChooserProps {
  open: boolean;
  onClose: () => void;
  phones: PhoneLine[];
  lang: "am" | "en";
}

/** Small bottom sheet that lets the visitor pick which sales line to call. */
export default function CallChooser({ open, onClose, phones, lang }: CallChooserProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portal to <body> so blurred/transformed ancestors (modals, sheets) can't trap or clip the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={lang === "am" ? "ዝጋ" : "Close"}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
      />
      <div className="relative w-full sm:max-w-sm bg-zinc-950 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">
            {lang === "am" ? "የትኛውን ስልክ ይደውሉ?" : "Call our sales team"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === "am" ? "ዝጋ" : "Close"}
            className="h-11 w-11 -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          {phones.map((p, i) => (
            <a
              key={p.tel}
              href={`tel:${p.tel}`}
              onClick={onClose}
              className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] transition"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-amber-500 text-black flex items-center justify-center">
                <Phone size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white tabular-nums">{p.display}</span>
                <span className="block text-[11px] text-zinc-500">
                  {lang === "am" ? `ሽያጭ እና ኪራይ ${i + 1}` : `Sales line ${i + 1}`}
                </span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
