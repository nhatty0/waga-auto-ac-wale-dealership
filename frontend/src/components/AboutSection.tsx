"use client";

import React from "react";
import { 
  ShieldCheck, 
  FileCheck2, 
  Wrench, 
  BadgePercent, 
  Car, 
  Sparkles, 
  Award, 
  Clock, 
  CheckCircle2, 
  Users 
} from "lucide-react";

interface AboutSectionProps {
  lang?: "am" | "en";
}

export default function AboutSection({ lang = "am" }: AboutSectionProps) {
  const isAm = lang === "am";

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
    <section id="about-us" className="max-w-4xl mx-auto px-4 py-12 scroll-mt-20">
      {/* Narrative Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-black border border-amber-500/30 p-6 sm:p-10 shadow-2xl shadow-black">
        {/* Amber Ambient Underglow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-72 h-72 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider shadow-sm">
              <Sparkles size={13} className="text-amber-400" />
              {isAm ? "የታማኝነት እና የጥራት ማረጋገጫ" : "Reputation & Verified Quality"}
            </span>
            <span className="text-zinc-500 text-xs font-mono hidden sm:inline">
              Est. Addis Ababa
            </span>
          </div>

          {/* Title & Tagline */}
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
            {isAm ? "ስለ ኤሲ ዋለ የመኪና መሸጫ" : "About AC WALE MARKET"}
          </h2>
          <p className="text-amber-400/95 font-bold text-sm sm:text-base mt-1.5">
            {isAm 
              ? "በአዲስ አበባ ታማኝ እና ቀልጣፋ የመኪና ግብይት እና ኪራይ አጋርዎ"
              : "Your Trusted & Agile Automotive Sales & Car Rental Partner in Addis Ababa"}
          </p>

          <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mt-4 max-w-3xl">
            {isAm
              ? "ኤሲ ዋለ የመኪና መሸጫ (AC WALE MARKET) በአዲስ አበባ ከተማ 22 አዋራሪስ ሆቴል ጀርባ የሚገኝ ሲሆን፣ ጥራት ያላቸውን አዲስ (Brand New)፣ በጥቂቱ ያገለገሉ (Slightly Used) እና በጥሩ ይዞታ ላይ የሚገኙ ያገለገሉ መኪኖችን (Excellent Condition Used) እንዲሁም የባንክ ዕዳ ዝውውር (Bank Loan Transfer) ያላቸውን ተሽከርካሪዎች በከፍተኛ ጥንቃቄ እና ታማኝነት የሚያቀርብ ቀዳሚ ዲጂታል እና አካላዊ ሾውሩም ነው። እንዲሁም ለግለሰቦች እና ለድርጅቶች አስተማማኝ የመኪና ኪራይ ከአሽከርካሪ ጋር ያቀርባል።"
              : "Located at Hayahulet behind Awraris Hotel in Addis Ababa, AC WALE MARKET is a premier showroom offering Brand New, Slightly Used, and well-maintained Excellent Condition Used vehicles—alongside transparent Bank Loan Transfer options and reliable chauffeur-driven car rentals."}
          </p>

          {/* Metric Proof Highlights (Horizontal Stat Bar) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-zinc-800/80">
            {statHighlights.map((stat, i) => (
              <div 
                key={i} 
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 text-center transition hover:border-amber-500/40"
              >
                <span className="text-2xl sm:text-3xl font-black text-amber-400 block tracking-tight">
                  {stat.value}
                </span>
                <span className="text-xs font-bold text-white block mt-0.5">
                  {stat.label}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 line-clamp-1">
                  {stat.sub}
                </span>
              </div>
            ))}
          </div>

          {/* 4 Pillar Trust Badges Grid */}
          <div className="mt-8 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Award size={14} className="text-amber-400" />
              <span>{isAm ? "ለምን ኤሲ ዋለን ይመርጣሉ? (4ቱ ዋና ዋና የጥራት መርሆዎች)" : "Why Choose AC Wale Market? (Our 4 Quality Pillars)"}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {trustPillars.map((pillar, idx) => {
                const Icon = pillar.icon;
                return (
                  <div 
                    key={idx}
                    className="group bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 rounded-2xl p-4 sm:p-5 transition-all duration-300 shadow-lg hover:shadow-amber-500/5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                          <Icon size={20} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                          {pillar.tag}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm sm:text-base text-white tracking-tight leading-snug">
                        {pillar.title}
                      </h4>
                      <p className="text-zinc-400 text-xs mt-2 leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                      <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                      <span>{isAm ? "በ AC WALE የተረጋገጠ" : "Guaranteed by AC Wale"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
