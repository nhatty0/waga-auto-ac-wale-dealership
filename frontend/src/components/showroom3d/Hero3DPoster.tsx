"use client";

import React from "react";
import { Eye, ZapOff, RefreshCw } from "lucide-react";

interface Hero3DPosterProps {
  onForceLoad3D?: () => void;
  isLowEnd?: boolean;
  lowEndReason?: string | null;
  isLoading?: boolean;
  dealerName?: string;
  lang?: "en" | "am";
}

export default function Hero3DPoster({
  onForceLoad3D,
  isLowEnd = false,
  lowEndReason,
  isLoading = false,
  dealerName = "AutoShowroom Ethiopia",
  lang = "en",
}: Hero3DPosterProps) {
  return (
    <div className="relative w-full h-[460px] sm:h-[540px] md:h-[620px] bg-gradient-to-b from-zinc-950 via-zinc-900 to-black rounded-3xl overflow-hidden border border-zinc-800/80 shadow-2xl flex flex-col justify-between p-6 select-none">
      {/* Ambient Radial Glow and Grid Floor */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.18),transparent_70%)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-48 opacity-20 pointer-events-none bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.05)),repeating-linear-gradient(90deg,transparent,transparent_40px,rgba(255,255,255,0.03)_40px,rgba(255,255,255,0.03)_41px)]"
        aria-hidden="true"
      />

      {/* Top Meta Bar */}
      <div className="relative z-10 flex items-center justify-end gap-3 min-h-[32px]">
        {isLowEnd && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-[11px] font-medium backdrop-blur-md">
            <ZapOff size={12} className="text-amber-400" />
            <span>{lang === "am" ? "ቀላል ዳታ ሁነታ" : "Data Saver Mode"}</span>
          </div>
        )}
      </div>

      {/* Centerpiece Car Silhouette Vector / Visual Backdrop */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center px-4">
        {/* SVG Stylized Sports Coupe Silhouette with Headlight Beam */}
        <div className="relative w-full max-w-md h-36 sm:h-44 flex items-center justify-center">
          <svg
            viewBox="0 0 600 240"
            className="w-full h-full text-zinc-700/60 drop-shadow-[0_10px_25px_rgba(245,158,11,0.12)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Ground Reflection Glow */}
            <ellipse cx="300" cy="210" rx="260" ry="12" fill="url(#groundGlow)" opacity="0.6" />

            {/* Aerodynamic Body Silhouette */}
            <path
              d="M70 170 C90 145, 140 135, 190 130 C230 110, 270 90, 340 90 C420 90, 470 115, 510 145 C540 150, 560 160, 560 175 C560 190, 545 195, 520 195 L80 195 C65 195, 55 185, 70 170 Z"
              fill="#18181b"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeOpacity="0.4"
            />
            {/* Cabin Glass */}
            <path
              d="M235 125 C260 100, 310 95, 360 95 C410 95, 450 115, 470 130 C410 130, 320 130, 235 125 Z"
              fill="#09090b"
              stroke="#52525b"
              strokeWidth="1"
            />
            {/* LED Headlight Beam */}
            <path
              d="M530 155 L590 165 L570 180 Z"
              fill="url(#headlightBeam)"
              opacity="0.8"
            />
            {/* Front Wheel */}
            <circle cx="460" cy="190" r="32" fill="#09090b" stroke="#71717a" strokeWidth="4" />
            <circle cx="460" cy="190" r="16" fill="#18181b" stroke="#f59e0b" strokeWidth="2" />
            {/* Rear Wheel */}
            <circle cx="160" cy="190" r="32" fill="#09090b" stroke="#71717a" strokeWidth="4" />
            <circle cx="160" cy="190" r="16" fill="#18181b" stroke="#f59e0b" strokeWidth="2" />

            <defs>
              <linearGradient id="groundGlow" x1="40" y1="210" x2="560" y2="210" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="headlightBeam" x1="530" y1="160" x2="600" y2="170" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Loading Indicator or Force Load 3D Button */}
        <div className="mt-5">
          {isLoading ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-300">
              <RefreshCw size={14} className="animate-spin text-amber-400" />
              <span>
                {lang === "am" ? "3D ሞዴል በመጫን ላይ ነው..." : "Loading 3D Showroom..."}
              </span>
            </div>
          ) : isLowEnd && onForceLoad3D ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onForceLoad3D}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition"
              >
                <Eye size={15} />
                <span>
                  {lang === "am" ? "3D ሞዴሉን ክፈት (Load 3D)" : "Launch Interactive 3D Canvas"}
                </span>
              </button>
              {lowEndReason && (
                <span className="text-[11px] text-zinc-500">
                  {lowEndReason}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
