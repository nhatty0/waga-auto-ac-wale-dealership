"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  ArrowRight,
  Phone,
  CarFront,
  QrCode,
  Send,
  Banknote,
  PhoneCall,
  Check,
} from "lucide-react";
import Hero3DSection from "@/components/showroom3d/Hero3DSection";
import { useLanguage } from "@/context/LanguageContext";

const PARTNER_BADGES = [
  "Nyala Motors",
  "KAKI Motors",
  "Markon Car Importer",
  "Bole Luxury Imports",
  "Kerchanshe Auto",
  "Addis Auto Gallery",
];

export default function SaaSPlatformLanding() {
  const { lang, toggleLang, t } = useLanguage();

  return (
    <div className="min-h-screen bg-black text-white selection:bg-amber-500 selection:text-black">
      {/* ========================================================
          1. MODERN SAAS HEADER (WAGA DEALERSHIP HUB)
         ======================================================== */}
      <header className="sticky top-0 z-50 bg-black/85 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 select-none group">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-amber-500/10 group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
              <Image
                src="/logo.svg"
                alt="Waga Dealership Hub Logo"
                width={40}
                height={40}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold tracking-wider text-white text-base sm:text-lg">
                {lang === "am" ? "ዋጋ" : "WAGA"}
              </span>
              <span className="font-semibold tracking-widest text-amber-500 text-[10px] sm:text-xs uppercase mt-0.5">
                DEALERSHIP HUB
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-zinc-400">
            <a href="#features" className="hover:text-amber-400 transition">
              {t.saasNavFeatures}
            </a>
            <a href="#partners" className="hover:text-amber-400 transition">
              {t.saasNavPartners}
            </a>
            <a href="#contact" className="hover:text-amber-400 transition">
              {t.saasNavContact}
            </a>
          </nav>

          {/* Right Header: Single Clean Login Button + Language Switcher */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Switcher */}
            <button
              onClick={toggleLang}
              className="px-2.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-700/80 hover:border-amber-500 text-xs font-bold text-zinc-200 hover:text-amber-400 transition flex items-center gap-1"
              title="Switch Language / ቋንቋ ቀይር"
            >
              <span className={lang === "en" ? "text-amber-400 font-black" : "text-zinc-500 font-normal"}>
                EN
              </span>
              <span className="text-zinc-600">|</span>
              <span className={lang === "am" ? "text-amber-400 font-black" : "text-zinc-500 font-normal"}>
                አማ
              </span>
            </button>

            {/* Login Point 1 of 2: Dealer Login CTA */}
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-amber-400 border border-zinc-800 hover:border-amber-500/50 text-xs font-bold transition shadow-sm active:scale-95"
            >
              <span>{t.saasDealerLogin}</span>
              <ArrowRight size={13} className="text-amber-400" />
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================================
          2. HERO SECTION WITH 3D SHOWCASE EMBED
         ======================================================== */}
      <section className="relative overflow-hidden pt-8 sm:pt-14 pb-12 border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-8">
            {/* Platform Badge */}
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold backdrop-blur-md shadow-lg shadow-amber-500/10 animate-in fade-in">
              <Sparkles size={14} className="text-amber-400" />
              <span>{t.saasHeroBadge}</span>
            </span>

            {/* Main Value Proposition Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.15]">
              {t.saasHeroTitle}
            </h1>

            {/* Subheadline */}
            <p className="text-zinc-400 text-xs sm:text-base leading-relaxed max-w-2xl mx-auto">
              {t.saasHeroSub}
            </p>

            {/* Consolidated Hero Primary CTA Button */}
            <div className="pt-2 flex justify-center">
              <Link
                href="/admin"
                className="px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm sm:text-base shadow-xl shadow-amber-500/25 active:scale-95 transition flex items-center gap-2 group"
              >
                <span>{t.saasHeroCtaPrimary}</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition" />
              </Link>
            </div>
          </div>

          {/* Centerpiece 3D Interactive Car Hero Showcase */}
          <div className="max-w-4xl mx-auto">
            <Hero3DSection dealership={null} />
          </div>
        </div>
      </section>

      {/* ========================================================
          3. INFINITE BRAND PARTNER MARQUEE TICKER
         ======================================================== */}
      <section id="partners" className="py-10 border-b border-zinc-800/80 bg-zinc-950/90 overflow-hidden relative">
        <div className="max-w-6xl mx-auto px-4 mb-6 text-center">
          <span className="text-zinc-400 text-xs sm:text-sm font-semibold tracking-wide">
            {t.saasPartnersTitle}
          </span>
        </div>

        {/* Marquee Ticker Track with Left/Right Gradient Fades */}
        <div className="relative w-full overflow-hidden">
          {/* Left subtle edge fade */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent z-10" />

          {/* Right subtle edge fade */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-l from-zinc-950 via-zinc-950/80 to-transparent z-10" />

          <div className="animate-marquee flex items-center gap-4 sm:gap-6 py-2">
            {/* Duplicated thrice to provide perfectly seamless infinite loop */}
            {[...PARTNER_BADGES, ...PARTNER_BADGES, ...PARTNER_BADGES].map((partner, idx) => (
              <div
                key={`${partner}-${idx}`}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800/90 hover:border-amber-500/40 text-zinc-300 hover:text-white font-bold text-xs sm:text-sm tracking-wide shadow-md transition whitespace-nowrap cursor-default group"
              >
                <div className="w-2 h-2 rounded-full bg-amber-400 group-hover:scale-125 transition shadow-sm shadow-amber-400/50" />
                <span>{partner}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          4. PLATFORM CORE FEATURES SECTION
         ======================================================== */}
      <section id="features" className="py-16 sm:py-24 border-b border-zinc-800/80 bg-black">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {t.saasFeaturesTitle}
            </h2>
            <p className="text-zinc-400 text-xs sm:text-sm mt-2">
              {t.saasFeaturesSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1: Bank Loan Split */}
            <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-6 space-y-3 hover:border-amber-500/40 transition group shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition">
                <Banknote size={24} />
              </div>
              <h3 className="font-bold text-white text-base">
                {t.saasFeature1Title}
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                {t.saasFeature1Desc}
              </p>
            </div>

            {/* Feature 2: Instant Telegram & AfroMessage SMS Leads */}
            <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-6 space-y-3 hover:border-amber-500/40 transition group shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 text-[#45B6ED] flex items-center justify-center group-hover:scale-110 transition">
                <Send size={22} />
              </div>
              <h3 className="font-bold text-white text-base">
                {t.saasFeature2Title}
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                {t.saasFeature2Desc}
              </p>
            </div>

            {/* Feature 3: Printable A4 QR Spec Sheets */}
            <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-6 space-y-3 hover:border-amber-500/40 transition group shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-110 transition">
                <QrCode size={24} />
              </div>
              <h3 className="font-bold text-white text-base">
                {t.saasFeature4Title}
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                {t.saasFeature4Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          5. EARLY ACCESS & DIRECT SALES CONTACT SECTION
         ======================================================== */}
      <section id="contact" className="py-16 sm:py-24 border-b border-zinc-800/80 bg-zinc-950/70">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-black border-2 border-amber-500/40 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-amber-500/10 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
                <Sparkles size={13} />
                <span>{t.saasPilotBadge}</span>
              </div>

              {/* Headline & Subhead */}
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                  {t.saasPilotTitle}
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-2 leading-relaxed max-w-2xl">
                  {t.saasPilotSubtitle}
                </p>
              </div>

              {/* 5 Key Feature Pillars */}
              <div className="py-2 border-y border-zinc-800/80 space-y-3">
                {[
                  t.saasPillar1,
                  t.saasPillar2,
                  t.saasPillar3,
                  t.saasPillar4,
                  t.saasPillar5,
                ].map((pillar, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={13} strokeWidth={3} />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-zinc-200">
                      {pillar}
                    </span>
                  </div>
                ))}
              </div>

              {/* Direct Sales Desk Call to Action */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">
                    Direct Dealership Onboarding & Pilot Setup
                  </span>
                  <a
                    href="tel:+251918032065"
                    className="text-lg sm:text-xl font-black text-amber-400 hover:text-amber-300 transition tracking-wide flex items-center gap-2 mt-0.5"
                  >
                    <PhoneCall size={18} />
                    <span>+251 918 032 065</span>
                  </a>
                </div>

                <a
                  href="tel:+251918032065"
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 active:scale-95 transition flex items-center justify-center gap-2"
                >
                  <Phone size={15} />
                  <span>{t.saasContactSalesCta}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          6. SAAS FOOTER (WAGA DEALERSHIP HUB)
         ======================================================== */}
      <footer className="border-t border-zinc-800/80 bg-black py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-amber-500/10 flex-shrink-0">
              <Image
                src="/logo.svg"
                alt="Waga Dealership Hub Logo"
                width={36}
                height={36}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold tracking-wider text-white text-sm sm:text-base">
                WAGA
              </span>
              <span className="font-semibold tracking-widest text-amber-500 text-[10px] uppercase mt-0.5">
                DEALERSHIP HUB
              </span>
              <span className="text-[11px] text-zinc-500 block mt-1">
                © {new Date().getFullYear()} {t.saasAllRights} • {t.saasLocation}
              </span>
            </div>
          </div>

          <div className="flex items-center text-xs font-semibold text-zinc-400">
            <a
              href="tel:+251918032065"
              className="hover:text-amber-400 transition flex items-center gap-1.5"
            >
              <Phone size={13} className="text-amber-400" />
              <span>+251 918 032 065</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
