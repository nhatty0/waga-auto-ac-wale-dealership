"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ExternalLink, Send, X } from "lucide-react";

interface QrLinkModalProps {
  title: string;
  subtitle?: string;
  url: string;
  /** Label of the main button that opens the link (e.g. "Open in Telegram"). */
  openLabel?: string;
  note?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * A link shown as a big QR (scan with another phone) plus Open / Copy buttons.
 * Used for one-time Telegram links (staff, owner) and a gate pass's driver link.
 */
export default function QrLinkModal({ title, subtitle, url, openLabel = "Open in Telegram", note, onClose, children }: QrLinkModalProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] bg-black/80 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-h-[94dvh] overflow-y-auto text-white">
        <div className="flex items-start gap-2 p-4 pb-2">
          <div className="min-w-0 flex-1">
            <p className="font-black text-base">{title}</p>
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 rounded-xl bg-zinc-800 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="mx-auto w-fit bg-white p-3 rounded-2xl">
            <QRCodeSVG value={url} size={208} level="M" />
          </div>
          <p className="text-[11px] text-zinc-500 text-center">Scan with the other phone&apos;s camera, or open / copy the link.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-black flex items-center justify-center gap-2"
          >
            <Send size={16} /> {openLabel} <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={copy}
            className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-bold flex items-center justify-center gap-2"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
          </button>
          <p className="text-[11px] text-zinc-500 break-all font-mono">{url}</p>
          {note && <div className="text-xs text-zinc-400">{note}</div>}
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
