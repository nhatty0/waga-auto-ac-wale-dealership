"use client";

import React, { useState } from "react";
import { 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Navigation, 
  ExternalLink, 
  Copy, 
  Check, 
  Send, 
  Building2, 
  Compass, 
  Calendar 
} from "lucide-react";

interface LocationSectionProps {
  lang?: "am" | "en";
}

export default function LocationSection({ lang = "am" }: LocationSectionProps) {
  const isAm = lang === "am";
  const [copied, setCopied] = useState(false);

  const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/v5NbRBzRNaNNZWzQA?g_st=atm";

  const addressText = isAm
    ? "22 (ሃያ ሁለት) አዋራሪስ ሆቴል ጀርባ፣ አዲስ አበባ (AC WALE MARKET)"
    : "Hayahulet, Behind Awraris Hotel, Addis Ababa, Ethiopia (AC WALE MARKET)";

  const handleCopyAddress = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(addressText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      console.warn("Clipboard copy skipped", e);
    }
  };

  return (
    <section id="showroom-location" className="max-w-4xl mx-auto px-4 py-8 scroll-mt-20">
      <div className="relative overflow-hidden rounded-3xl bg-zinc-950 border border-zinc-800 p-6 sm:p-10 shadow-2xl">
        {/* Glow ambient background accents */}
        <div className="absolute top-0 left-1/3 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-10 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-8">
          {/* Header Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{isAm ? "ክፍት ነው • ሾውሩሙን ይጎብኙ" : "Open Today • Visit Our Lot"}</span>
                </span>
                <span className="text-[11px] font-mono text-amber-400 font-semibold">22 አዋራሪስ ሆቴል ጀርባ</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {isAm ? "ይምጡ እና ይጎብኙን (Visit Our Showroom Lot)" : "Visit Our Showroom Lot"}
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                {isAm 
                  ? "AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ) • በአካል መጥተው ይመርጡ፣ ይሞክሩ፣ በደቂቃዎች ውስጥ ይጨርሱ"
                  : "AC WALE MARKET • Inspect vehicles in person, test drive on our lot, and finalize deals securely."}
              </p>
            </div>

            {/* Quick Map Action */}
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start sm:self-auto py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95"
            >
              <Navigation size={15} />
              <span>{isAm ? "📍 አድራሻ በ Google Maps" : "Open in Google Maps"}</span>
            </a>
          </div>

          {/* Location & Working Hours Dual Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1: Physical Presence & Address */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white uppercase tracking-wide">
                    {isAm ? "የሾውሩም ዋና አድራሻ" : "Showroom Address"}
                  </h3>
                  <p className="text-xs text-amber-400 font-semibold">
                    AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ)
                  </p>
                </div>
              </div>

              {/* Address Box */}
              <div className="bg-black/70 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-zinc-200 leading-relaxed">
                    <p className="font-bold text-white text-sm">
                      {isAm 
                        ? "22 (ሃያ ሁለት) አዋራሪስ ሆቴል ጀርባ፣ አዲስ አበባ" 
                        : "Hayahulet, Behind Awraris Hotel, Addis Ababa, Ethiopia"}
                    </p>
                    <p className="text-amber-400/90 font-medium text-[11px] mt-0.5">
                      {isAm 
                        ? "22 አዋራሪስ ሆቴል ጀርባ • ዋና የመኪና መሸጫ እና ኪራይ ማዕከል" 
                        : "Behind Awraris Hotel, 22 Mazoria Area • Primary Showroom Lot"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="w-full mt-2 py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-700/60 transition flex items-center justify-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      <span className="text-emerald-400">{isAm ? "አድራሻው ተገልብጧል!" : "Address Copied!"}</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>{isAm ? "አድራሻውን ኮፒ አድርግ (Copy Address)" : "Copy Showroom Address"}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Map Preview Simulated Frame */}
              <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 p-3 text-center relative group">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Compass size={13} className="text-amber-400" /> 22 Awraris Hotel Pin
                  </span>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-semibold">
                    Hayahulet Lot
                  </span>
                </div>
                <div className="h-28 rounded-lg bg-gradient-to-tr from-zinc-900 via-zinc-900 to-zinc-800 border border-zinc-800/80 flex flex-col items-center justify-center gap-2 p-3 group-hover:border-amber-500/40 transition">
                  <MapPin size={28} className="text-amber-400 animate-bounce" />
                  <span className="text-xs font-bold text-white">
                    {isAm ? "22 አዋራሪስ ሆቴል ጀርባ በቀላሉ ያገኙናል" : "Located Behind Awraris Hotel, 22"}
                  </span>
                  <a
                    href={GOOGLE_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>{isAm ? "አድራሻ በካርታ ይመልከቱ (Google Maps Pin)" : "Open Exact Google Maps Pin"}</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>

            {/* Column 2: Working Hours & Instant Hotlines */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white uppercase tracking-wide">
                      {isAm ? "የስራ ሰዓታት (Working Hours)" : "Business Working Hours"}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {isAm ? "በቀጥታ መጥተው መኪኖችን መመልከት ይችላሉ" : "Walk-ins & Test Drives Welcome"}
                    </p>
                  </div>
                </div>

                {/* Hours Table */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/60 border border-zinc-800 text-xs">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <Calendar size={14} className="text-amber-400" />
                      <span>{isAm ? "ሰኞ - ቅዳሜ (Mon - Sat)" : "Monday - Saturday"}</span>
                    </div>
                    <span className="font-mono text-amber-400 font-bold">
                      2:30 ጠዋት - 12:30 ማታ (8:30 AM - 6:30 PM)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-zinc-800 text-xs">
                    <div className="flex items-center gap-2 font-medium text-zinc-300">
                      <Calendar size={14} className="text-zinc-500" />
                      <span>{isAm ? "እሁድ (Sunday)" : "Sunday"}</span>
                    </div>
                    <span className="font-mono text-zinc-400">
                      {isAm ? "በከፊል ክፍት / በቀጠሮ (Half Day / Appointment)" : "Half Day / By Appointment"}
                    </span>
                  </div>
                </div>

                {/* Hotlines Grid */}
                <div className="mt-5 pt-4 border-t border-zinc-800 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    {isAm ? "የቀጥታ ስልክ መስመሮች (Hotlines)" : "Direct Hotlines & Support"}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href="tel:+251911646628"
                      className="p-2.5 rounded-xl bg-black/80 border border-amber-500/20 hover:border-amber-500 hover:bg-amber-500/10 text-white font-mono text-xs transition flex items-center gap-2 group"
                    >
                      <Phone size={14} className="text-amber-400 group-hover:scale-110 transition" />
                      <div>
                        <span className="block text-[10px] text-zinc-400 uppercase font-sans">
                          {isAm ? "ሽያጭ እና ኪራይ 1" : "Sales Hotline 1"}
                        </span>
                        <span className="font-bold text-amber-300">+251 911 646 628</span>
                      </div>
                    </a>

                    <a
                      href="tel:+251900061300"
                      className="p-2.5 rounded-xl bg-black/80 border border-amber-500/20 hover:border-amber-500 hover:bg-amber-500/10 text-white font-mono text-xs transition flex items-center gap-2 group"
                    >
                      <Phone size={14} className="text-amber-400 group-hover:scale-110 transition" />
                      <div>
                        <span className="block text-[10px] text-zinc-400 uppercase font-sans">
                          {isAm ? "ሽያጭ እና ኪራይ 2" : "Sales Hotline 2"}
                        </span>
                        <span className="font-bold text-amber-300">+251 900 061 300</span>
                      </div>
                    </a>
                  </div>

                  <div className="pt-1 flex items-center gap-2 text-xs text-zinc-400">
                    <Mail size={13} className="text-zinc-500" />
                    <span>acwalecarmarket@gmail.com</span>
                  </div>
                </div>
              </div>

              {/* Quick Contact Action Row */}
              <div className="grid grid-cols-2 gap-3 pt-3">
                <a
                  href="tel:+251911646628"
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <Phone size={14} />
                  <span>{isAm ? "ቀጥታ ይደውሉ" : "Call Now"}</span>
                </a>

                <a
                  href="https://t.me/+251911646628"
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/20"
                >
                  <Send size={14} />
                  <span>{isAm ? "በቴሌግራም ያነጋግሩን" : "Telegram Chat"}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
