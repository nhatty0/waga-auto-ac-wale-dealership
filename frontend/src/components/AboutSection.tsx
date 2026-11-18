"use client";

import React, { useState } from "react";
import {
  FileCheck2,
  Wrench,
  BadgePercent,
  Car,
  Sparkles,
  Award,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

interface AboutSectionProps {
  lang?: "am" | "en";
}

export default function AboutSection({ lang = "am" }: AboutSectionProps) {
  const isAm = lang === "am";
  const [expanded, setExpanded] = useState(false);

  const trustPillars = [
    {
      icon: FileCheck2,
      title: isAm 
        ? "100% ሕጋዊ ሰነዶች እና የባለቤትነት ማረጋገጫ" 
        : "100% Legal Title & Libret Verification",
      subtitle: isAm 
        ? "Legal Title & Inspection" 
        : "Guaranteed Clear Ownership",
      description: isAm
        ? "ማንኛውም መኪና ለሽያጭ ወይም ለኪራይ ከመቅረቡ በፊት የባለቤትነት እና የዕዳ ማጣሪያ ይደረግለታል። ሰነዱ ያልተጣራ አጠራጣሪ መኪና አንቀበልም።"
        : "Every car undergoes exhaustive legal title and bank lien clearance before listing. Zero title disputes or fraudulent documentation.",
      tag: isAm ? "የተረጋገጠ ሊብሬ" : "Verified Libret"
    },
    {
      icon: Wrench,
      title: isAm 
        ? "የተሟላ የቴክኒክ እና የአካል ምርመራ" 
        : "Complete Mechanical & Body Inspection",
      subtitle: isAm 
        ? "Rigorous Multi-Point Check" 
        : "Engine, Transmission & Frame",
      description: isAm
        ? "የሞተር፣ የጊርቦክስ፣ የኤሌክትሪክ እና የአደጋ ታሪክ በትክክለኛ የሞተር ባለሙያ የተረጋገጠ። የኮምፒውተር ምርመራ (OBD Diagnostics) ተከናውኗል።"
        : "Engine compression, gearbox health, suspension, and chassis alignment verified by certified technicians with full computer OBD diagnostics.",
      tag: isAm ? "የቴክኒክ ምርመራ" : "Multi-Point Check"
    },
    {
      icon: BadgePercent,
      title: isAm 
        ? "ግልጽ እና ቀጥተኛ የዋጋ ስምምነት" 
        : "Transparent Pricing & Zero Hidden Fees",
      subtitle: isAm 
        ? "No Hidden Commissions" 
        : "Direct Buyer-Dealer Agreement",
      description: isAm
        ? "በእጅ የሚከፈል ቅድመ ክፍያ እና የባንክ ብድር በግልጽ የተቀመጠበት ግብይት። ያልታወቁ ኮሚሽኖች ወይም የተደበቁ ወጪዎች የሉም።"
        : "Upfront cash breakdown and transferable bank debt transparently declared. Fair market value with direct dealership contracts.",
      tag: isAm ? "ግልጽ ዋጋ" : "Zero Hidden Fees"
    },
    {
      icon: Car,
      title: isAm 
        ? "ፈጣን የኪራይ መኪና ማድረስ እና አሽከርካሪ" 
        : "Reliable Rental Fleet & Chauffeur Service",
      subtitle: isAm 
        ? "Showroom Pickup or Doorstep" 
        : "Daily & Corporate Dispatch",
      description: isAm
        ? "ለግል፣ ለድርጅት ወይም ለክስተቶች በሰዓቱ የሚደርስ ዘመናዊ የመኪና ኪራይ። ልምድ ያላቸው ህጋዊ አሽከርካሪዎች እና ንጹህ ተሽከርካሪዎች።"
        : "Punctual delivery to your doorstep or showroom pickup with professional vetted chauffeurs. Clean, insured, modern fleet ready 24/7.",
      tag: isAm ? "ስምሪት እና ኪራይ" : "On-Demand Fleet"
    }
  ];

  const statHighlights = [
    {
      value: "10+",
      label: isAm ? "ዓመታት በዘርፉ" : "Years of Experience",
      sub: isAm ? "የአዲስ አበባ ታማኝ ገበያ" : "Established in Addis Ababa"
    },
    {
      value: "500+",
      label: isAm ? "የተሸጡ እና የተከራዩ መኪኖች" : "Delivered Vehicles",
      sub: isAm ? "ደስተኛ ደንበኞች እና አሽከርካሪዎች" : "Satisfied Clients & Renters"
    },
    {
      value: "100%",
      label: isAm ? "የተረጋገጡ ዝርዝሮች" : "Verified Fleet",
      sub: isAm ? "ትክክለኛ የፎቶ እና ቪዲዮ መረጃ" : "Authentic Inspection Specs"
    },
    {
      value: "24/7",
      label: isAm ? "የደንበኞች አገልግሎት" : "Customer Support",
      sub: isAm ? "ፈጣን የስልክ እና ቴሌግራም ምላሽ" : "Direct Hotline & Telegram"
    }
  ];

  return (
    <section id="about-us" className="max-w-5xl mx-auto px-4 pt-14 pb-4 scroll-mt-20">
      {/* Eyebrow + title */}
      <div className="flex items-center gap-2 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
        <Sparkles size={13} />
        <span>{isAm ? "የታማኝነት እና የጥራት ማረጋገጫ" : "Reputation & Verified Quality"}</span>
        <span className="hidden sm:inline text-zinc-500 font-mono normal-case tracking-normal">· Est. Addis Ababa</span>
      </div>
      <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
        {isAm ? "ስለ ኤሲ ዋለ የመኪና መሸጫ" : "About AC WALE MARKET"}
      </h2>
      <p className="mt-1 text-amber-400/90 font-semibold text-sm">
        {isAm
          ? "በአዲስ አበባ ታማኝ እና ቀልጣፋ የመኪና ግብይት እና ኪራይ አጋርዎ"
          : "Your Trusted & Agile Automotive Sales & Car Rental Partner in Addis Ababa"}
      </p>

      {/* Short intro with Read more */}
      <p
        id="about-intro"
        className={`mt-3 max-w-3xl text-sm text-zinc-300 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}
      >
        {isAm
          ? "ኤሲ ዋለ የመኪና መሸጫ (AC WALE MARKET) በአዲስ አበባ ከተማ 22 አዋራሪስ ሆቴል ጀርባ የሚገኝ ሲሆን፣ ጥራት ያላቸውን አዲስ (Brand New)፣ በጥቂቱ ያገለገሉ (Slightly Used) እና በጥሩ ይዞታ ላይ የሚገኙ ያገለገሉ መኪኖችን (Excellent Condition Used) እንዲሁም የባንክ ዕዳ ዝውውር (Bank Loan Transfer) ያላቸውን ተሽከርካሪዎች በከፍተኛ ጥንቃቄ እና ታማኝነት የሚያቀርብ ቀዳሚ ዲጂታል እና አካላዊ ሾውሩም ነው። እንዲሁም ለግለሰቦች እና ለድርጅቶች አስተማማኝ የመኪና ኪራይ ከአሽከርካሪ ጋር ያቀርባል።"
          : "Located at Hayahulet behind Awraris Hotel in Addis Ababa, AC WALE MARKET is a premier showroom offering Brand New, Slightly Used, and well-maintained Excellent Condition Used vehicles—alongside transparent Bank Loan Transfer options and reliable chauffeur-driven car rentals."}
      </p>
      <button
        type="button"
        data-about-more
        aria-expanded={expanded}
        aria-controls="about-intro"
        onClick={() => setExpanded((v) => !v)}
        className="h-11 -ml-1 px-1 inline-flex items-center gap-1 text-sm font-semibold text-amber-400 hover:text-amber-300"
      >
        {expanded ? (isAm ? "ያሳጥሩ" : "Show less") : isAm ? "ተጨማሪ ያንብቡ" : "Read more"}
        <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Compact stat tiles: 2x2 on phones, one row on larger screens */}
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statHighlights.map((stat) => (
          <div key={stat.value} className="rounded-xl bg-white/[0.04] px-3.5 py-3 flex flex-col">
            <dt className="mt-1.5 text-xs font-semibold text-zinc-200 leading-snug">{stat.label}</dt>
            <dd className="order-first text-xl sm:text-2xl font-black text-amber-400 tracking-tight leading-none">{stat.value}</dd>
            <dd className="hidden sm:block mt-0.5 text-[10px] text-zinc-500 line-clamp-1">{stat.sub}</dd>
          </div>
        ))}
      </dl>

      {/* Quality pillars as an accordion */}
      <h3 className="mt-8 mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
        <Award size={14} className="text-amber-400" />
        <span>{isAm ? "ለምን ኤሲ ዋለን ይመርጣሉ? (4ቱ ዋና ዋና የጥራት መርሆዎች)" : "Why Choose AC Wale Market? (Our 4 Quality Pillars)"}</span>
      </h3>
      <div className="rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.06] divide-y divide-white/[0.06] sm:grid sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-white/[0.06] sm:overflow-hidden">
        {trustPillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <details key={pillar.tag} className="group sm:bg-zinc-950">
              <summary className="flex items-center gap-3 min-h-14 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-white/[0.02]">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Icon size={18} />
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-white leading-snug">{pillar.title}</span>
                <ChevronDown size={18} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 pl-16 -mt-1">
                <p className="text-[13px] text-zinc-400 leading-relaxed">{pillar.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-zinc-300 uppercase tracking-wider">{pillar.tag}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={13} />
                    {isAm ? "በ AC WALE የተረጋገጠ" : "Guaranteed by AC Wale"}
                  </span>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
