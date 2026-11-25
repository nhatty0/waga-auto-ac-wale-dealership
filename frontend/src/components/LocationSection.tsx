"use client";

import React, { useState } from "react";
import { MapPin, Phone, Mail, Clock, Navigation, Copy, Check, Send } from "lucide-react";
import CallChooser from "@/components/CallChooser";
import {
  ADDRESS,
  CONTACT_EMAIL,
  GOOGLE_MAPS_URL,
  HOURS,
  PhoneLine,
  addressCopyText,
} from "@/lib/contact";

interface LocationSectionProps {
  lang?: "am" | "en";
  /** The dealership's call lines (dealerPhoneLines(dealership)); none are hardcoded here. */
  phones?: PhoneLine[];
  /** Telegram chat link for the primary line (hidden when omitted). */
  telegramUrl?: string;
}

export default function LocationSection({ lang = "am", phones = [], telegramUrl }: LocationSectionProps) {
  const isAm = lang === "am";
  const [copied, setCopied] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const address = isAm ? ADDRESS.am : ADDRESS.en;

  const handleCopyAddress = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(addressCopyText(lang));
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      console.warn("Clipboard copy skipped", e);
    }
  };

  const secondaryBtn =
    "h-11 px-3.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-100 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 whitespace-nowrap";

  return (
    <section id="showroom-location" className="max-w-5xl mx-auto px-4 py-6 scroll-mt-20">
      <div className="rounded-3xl bg-zinc-900/60 ring-1 ring-white/[0.06] p-5 sm:p-8">
        {/* Header */}
        <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {isAm ? "ክፍት ነው • ሾውሩሙን ይጎብኙ" : "Open Today • Visit Our Lot"}
        </span>
        <h2 className="mt-2 text-xl sm:text-2xl font-black text-white tracking-tight">
          {isAm ? "ይምጡ እና ይጎብኙን" : "Visit Our Showroom Lot"}
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-zinc-400">
          {isAm
            ? "በአካል መጥተው ይመርጡ፣ ይሞክሩ፣ በደቂቃዎች ውስጥ ይጨርሱ።"
            : "Inspect vehicles in person, test drive on our lot, and finalize deals securely."}
        </p>

        {/* Address: two lines max */}
        <div className="mt-5 flex items-start gap-3">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <MapPin size={20} />
          </span>
          <address className="not-italic min-w-0">
            <p className="text-[15px] font-bold text-white leading-snug">{address.line1}</p>
            <p className="text-sm text-zinc-400">{address.line2}</p>
          </address>
        </div>

        {/* Actions: Maps / Copy / Call */}
        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 min-w-0 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[13px] font-black flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/15 transition active:scale-95"
          >
            <Navigation size={16} className="shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">{isAm ? "ካርታ" : "Maps"}</span>
              <span className="hidden sm:inline">{isAm ? "አድራሻ በ Google Maps" : "Open in Google Maps"}</span>
            </span>
          </a>
          <button type="button" onClick={handleCopyAddress} className={secondaryBtn} aria-live="polite">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            <span className={copied ? "text-emerald-400" : ""}>
              {copied ? (isAm ? "ተገልብጧል" : "Copied") : isAm ? "ኮፒ" : "Copy"}
            </span>
          </button>
          {phones.length > 1 ? (
            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className={secondaryBtn}
              aria-haspopup="dialog"
            >
              <Phone size={16} className="text-amber-400" />
              <span>{isAm ? "ደውል" : "Call"}</span>
            </button>
          ) : phones[0] ? (
            <a href={`tel:${phones[0].tel}`} className={secondaryBtn} title={phones[0].display}>
              <Phone size={16} className="text-amber-400" />
              <span>{isAm ? "ደውል" : "Call"}</span>
            </a>
          ) : null}
        </div>

        {/* Hours: compact table, international + Ethiopian time */}
        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            <Clock size={13} className="text-amber-400" />
            {isAm ? "የስራ ሰዓታት" : "Working Hours"}
          </h3>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13px]">
            <dt className="text-zinc-400">{HOURS.weekdays.label[lang]}</dt>
            <dd className="text-white font-semibold">
              <span className="whitespace-nowrap">{isAm ? HOURS.weekdays.local : HOURS.weekdays.intl}</span>
              <span className="block sm:inline sm:ml-2 text-xs font-normal text-zinc-500 whitespace-nowrap">
                {isAm ? HOURS.weekdays.intl : HOURS.weekdays.local}
              </span>
            </dd>
            <dt className="text-zinc-400">{HOURS.sunday.label[lang]}</dt>
            <dd className="text-zinc-300">{HOURS.sunday.text[lang]}</dd>
          </dl>
        </div>

        {/* Other ways to reach us */}
        <div className="mt-5 flex flex-wrap items-center gap-x-1 text-[13px] text-zinc-400">
          {phones.map((p) => (
            <a key={p.tel} href={`tel:${p.tel}`} className="h-11 px-2 -ml-2 mr-1 inline-flex items-center gap-1.5 hover:text-amber-400 tabular-nums">
              <Phone size={13} className="text-zinc-500" />
              {p.display}
            </a>
          ))}
          {telegramUrl && (
            <a
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="h-11 px-2 -ml-2 mr-1 inline-flex items-center gap-1.5 hover:text-sky-400"
            >
              <Send size={13} className="text-zinc-500" />
              {isAm ? "በቴሌግራም ያነጋግሩን" : "Telegram Chat"}
            </a>
          )}
          <a href={`mailto:${CONTACT_EMAIL}`} className="h-11 px-2 -ml-2 inline-flex items-center gap-1.5 hover:text-zinc-200 break-all">
            <Mail size={13} className="text-zinc-500" />
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <CallChooser open={callOpen} onClose={() => setCallOpen(false)} phones={phones} lang={lang} />
    </section>
  );
}
