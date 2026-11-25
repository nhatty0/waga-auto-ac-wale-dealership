"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { X, Share, PlusSquare, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallAppBanner() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [bannerType, setBannerType] = useState<"android" | "ios" | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed as PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    if (isStandalone) {
      return;
    }

    // 2. Check if previously dismissed by user (stored in localStorage)
    try {
      const dismissed = localStorage.getItem("waga_pwa_banner_dismissed");
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        // Do not prompt again for 7 days if dismissed
        if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
          return;
        }
      }
    } catch {
      // Ignore storage access errors
    }

    // 3. Android / Chromium handler
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setBannerType("android");
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 4. iOS Safari detection
    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: boolean }).MSStream;

    // Detect if running Safari browser on iOS
    const isSafari =
      isIOS &&
      /WebKit/i.test(ua) &&
      !/CriOS|FxiOS|OPiOS|EdgiOS|Brave/i.test(ua);

    if (isIOS && !isStandalone) {
      // Show iOS banner after short delay so initial render finishes smoothly
      const timer = setTimeout(() => {
        setBannerType((prev) => (prev ? prev : "ios"));
        setIsVisible(true);
      }, 1500);

      return () => {
        clearTimeout(timer);
        window.removeEventListener(
          "beforeinstallprompt",
          handleBeforeInstallPrompt
        );
      };
    }

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsVisible(false);
      }
    } catch (err) {
      console.error("PWA install error:", err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(
        "waga_pwa_banner_dismissed",
        Date.now().toString()
      );
    } catch {
      // Ignore storage errors
    }
  };

  // The public pass-verify page is shown to gate guards: no install prompt over it.
  if (!isVisible || !bannerType || pathname?.startsWith("/verify")) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="App Installation Banner"
      className="fixed bottom-3 inset-x-3 sm:left-auto sm:right-4 sm:w-[420px] z-[9999] transition-all duration-300 ease-out"
    >
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950/95 border border-amber-500/40 p-4 shadow-2xl shadow-black/80 backdrop-blur-xl ring-1 ring-white/10">
        {/* Glow effect */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top bar: Icon, Title, and Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-amber-500/30 flex-shrink-0 shadow-md">
              <Image
                src="/icons/icon-192x192.png"
                alt="AC WALE MARKET Logo"
                width={48}
                height={48}
                className="object-cover w-full h-full"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-white text-sm sm:text-base tracking-tight">
                  AC WALE MARKET
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  App
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-medium">
                ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Android Installation Button */}
        {bannerType === "android" && (
          <div className="mt-3.5 space-y-2">
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 active:scale-[0.98] text-black font-extrabold text-sm shadow-lg shadow-amber-500/25 transition cursor-pointer"
            >
              <Smartphone size={18} className="text-black stroke-[2.5]" />
              <span>📱 አፑን ስልክዎ ላይ ይጫኑ (Install App)</span>
            </button>
          </div>
        )}

        {/* iOS Safari Instructions */}
        {bannerType === "ios" && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
            <p className="text-xs text-zinc-200 font-medium leading-relaxed">
              📱 አፑን ለመጫን: <span className="text-amber-400 font-bold">&apos;Share&apos;</span> አዝራርን ነክተው{" "}
              <span className="text-amber-400 font-bold">&apos;Add to Home Screen&apos;</span> የሚለውን ይምረጡ።
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-zinc-300">
              <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1.5 rounded-lg">
                <Share size={14} className="text-amber-400 shrink-0" />
                <span>1. &apos;Share&apos; ይንኩ</span>
              </div>
              <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1.5 rounded-lg">
                <PlusSquare size={14} className="text-amber-400 shrink-0" />
                <span>2. &apos;Add to Home Screen&apos;</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
