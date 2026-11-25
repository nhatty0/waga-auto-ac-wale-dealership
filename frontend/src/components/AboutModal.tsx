"use client";

import React, { useState } from "react";
import { X, Sparkles, MapPin, Building2, Phone, Mail, Clock, ShieldCheck, Navigation } from "lucide-react";
import AboutSection from "./AboutSection";
import LocationSection from "./LocationSection";
import { PhoneLine } from "@/lib/contact";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "about" | "location";
  lang?: "am" | "en";
  phones?: PhoneLine[];
  telegramUrl?: string;
}

export default function AboutModal({
  isOpen,
  onClose,
  initialTab = "about",
  lang = "am",
  phones = [],
  telegramUrl,
}: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<"about" | "location">(initialTab);
  const isAm = lang === "am";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white my-auto">
        {/* Modal Top Bar */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/ac-wale-logo.png"
              alt="AC WALE"
              className="h-10 w-10 rounded-lg object-contain flex-shrink-0 bg-black border border-zinc-800"
            />
            <div>
              <h3 className="font-black text-sm sm:text-base text-white tracking-tight uppercase leading-none">
                AC WALE MARKET
              </h3>
              <p className="text-[11px] text-amber-400 font-bold mt-0.5">
                {isAm ? "ስለ እኛ እና የሾውሩም አድራሻ" : "About Us & Showroom Location"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch pills */}
            <div className="bg-zinc-800 p-1 rounded-xl flex items-center text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className={`py-1.5 px-3 rounded-lg transition ${
                  activeTab === "about"
                    ? "bg-amber-500 text-black shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {isAm ? "ስለ እኛ" : "About Us"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("location")}
                className={`py-1.5 px-3 rounded-lg transition ${
                  activeTab === "location"
                    ? "bg-amber-500 text-black shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {isAm ? "አድራሻ" : "Location"}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-black">
          {activeTab === "about" ? (
            <AboutSection lang={lang} />
          ) : (
            <LocationSection lang={lang} phones={phones} telegramUrl={telegramUrl} />
          )}
        </div>
      </div>
    </div>
  );
}
