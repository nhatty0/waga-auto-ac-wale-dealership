"use client";

import React, { useEffect } from "react";
import { Printer, X, Loader2 } from "lucide-react";

interface PrintModalShellProps {
  /** Short title: kept to one line (truncated) on phones. */
  title: React.ReactNode;
  /** Longer description: hidden under 480px. */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Small chip after the title (e.g. a slip or contract number). */
  badge?: React.ReactNode;
  onClose: () => void;
  /** When given, a compact "Print / PDF" button is shown in the header. */
  onPrint?: () => void;
  printing?: boolean;
  /** Full label for screen readers / tooltips, e.g. the Amharic action name. */
  printTitle?: string;
  /** Extra header buttons (rendered before Print). */
  headerActions?: React.ReactNode;
  /** Optional bar under the header (filters etc.). */
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  /** Desktop max width of the dialog. */
  maxWidthClass?: string;
  children: React.ReactNode;
}

/**
 * Screen chrome shared by the print / PDF generator modals.
 * Phones: full-screen with a sticky one-line header. Larger screens: centered dialog.
 * It never takes part in printing (print:hidden); each modal keeps its own print path.
 */
export default function PrintModalShell({
  title,
  description,
  icon,
  badge,
  onClose,
  onPrint,
  printing,
  printTitle,
  headerActions,
  toolbar,
  footer,
  maxWidthClass = "sm:max-w-3xl",
  children,
}: PrintModalShellProps) {
  useEffect(() => {
    // Note: deliberately no <body> scroll lock: an inline overflow:hidden on <body> would still be
    // present during window.print() and could clip multi-page printouts.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/85 backdrop-blur-md sm:p-4 print:hidden"
    >
      <div
        className={`relative w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] bg-zinc-950 sm:border sm:border-zinc-800 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white ${maxWidthClass}`}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 shrink-0 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2 px-3 sm:px-5 h-16">
            {icon && <span className="hidden min-[400px]:flex shrink-0">{icon}</span>}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="truncate text-sm sm:text-base font-bold text-white">{title}</h3>
                {badge && <span className="hidden min-[480px]:inline-flex shrink-0">{badge}</span>}
              </div>
              {description && (
                <p className="hidden min-[480px]:block truncate text-xs text-zinc-400">{description}</p>
              )}
            </div>
            {headerActions}
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                disabled={printing}
                title={printTitle}
                aria-label={printTitle || "Print / PDF"}
                className="h-11 shrink-0 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 whitespace-nowrap shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-60 transition"
              >
                {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                <span>Print / PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close / ዝጋ"
              title="Close / ዝጋ"
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {toolbar && <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/40">{toolbar}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-3 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
