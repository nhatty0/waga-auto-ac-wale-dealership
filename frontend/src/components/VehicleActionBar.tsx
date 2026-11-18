"use client";

import { useState } from "react";
import { Phone, CalendarCheck } from "lucide-react";
import TelegramIcon from "@/components/TelegramIcon";
import CallChooser from "@/components/CallChooser";
import { PhoneLine } from "@/lib/contact";

interface VehicleActionBarProps {
  lang: "am" | "en";
  phones: PhoneLine[];
  /** Direct Telegram chat with the sales desk (icon hidden when omitted) */
  telegramUrl?: string;
  isSold?: boolean;
  onBook: () => void;
  /** Label for the sold-vehicle primary action */
  findSimilarLabel: string;
  className?: string;
}

/**
 * Bottom action bar for a vehicle: Call (opens a chooser when there are two lines),
 * Telegram chat, and a wide primary "Book a Visit" button. Pads for the iPhone home indicator.
 */
export default function VehicleActionBar({
  lang,
  phones,
  telegramUrl,
  isSold,
  onBook,
  findSimilarLabel,
  className = "",
}: VehicleActionBarProps) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const am = lang === "am";
  const callLabel = am ? "ደውል" : "Call";

  const callClasses =
    "h-12 shrink-0 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-sm font-bold flex items-center justify-center gap-2 transition active:scale-95";

  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}
      >
        {phones.length > 1 ? (
          <button
            type="button"
            data-call-chooser
            onClick={() => setChooserOpen(true)}
            className={callClasses}
            aria-haspopup="dialog"
          >
            <Phone size={17} className="text-amber-400" />
            <span>{callLabel}</span>
          </button>
        ) : phones[0] ? (
          <a href={`tel:${phones[0].tel}`} className={callClasses} title={phones[0].display}>
            <Phone size={17} className="text-amber-400" />
            <span>{callLabel}</span>
          </a>
        ) : null}

        {telegramUrl && (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="h-12 w-12 shrink-0 rounded-xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#45B6ED] flex items-center justify-center transition active:scale-95"
            aria-label={am ? "በቴሌግራም ያነጋግሩን" : "Chat on Telegram"}
            title={am ? "በቴሌግራም ያነጋግሩን" : "Chat on Telegram"}
          >
            <TelegramIcon size={20} />
          </a>
        )}

        {isSold ? (
          <a
            href={phones[0] ? `tel:${phones[0].tel}` : undefined}
            className="h-12 flex-1 min-w-0 px-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center"
          >
            <span className="truncate">{findSimilarLabel}</span>
          </a>
        ) : (
          <button
            type="button"
            data-book-button
            onClick={onBook}
            className="h-12 flex-1 min-w-0 px-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <CalendarCheck size={18} className="shrink-0" />
            <span className="min-w-0 flex flex-col items-start leading-tight">
              <span className="text-sm font-black truncate max-w-full">{am ? "ቀጠሮ ይያዙ" : "Book a Visit"}</span>
              <span className="text-[10px] font-semibold text-black/65 truncate max-w-full">
                {am ? "በአካል መጥተው ይመልከቱ" : "In-person showroom visit"}
              </span>
            </span>
          </button>
        )}
      </div>

      <CallChooser open={chooserOpen} onClose={() => setChooserOpen(false)} phones={phones} lang={lang} />
    </>
  );
}
