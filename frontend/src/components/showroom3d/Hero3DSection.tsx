"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Dealership } from "@/types";
import { detectDevicePerformance, DevicePerformanceProfile } from "./devicePerformance";
import Hero3DPoster from "./Hero3DPoster";
import ProceduralCarModel from "./ProceduralCarModel";

// Lazy-load the WebGL Three.js Pro Canvas with ssr: false
const Hero3DCanvasPro = dynamic(() => import("./Hero3DCanvasPro"), {
  ssr: false,
  loading: () => null,
});

export const COLOR_SWATCHES = [
  { id: "amber", nameEn: "Imperial Amber", nameAm: "ወርቃማ አምበር", hex: "#d97706" },
  { id: "black", nameEn: "Obsidian Black", nameAm: "ጥቁር ኦብሲዲያን", hex: "#121214" },
  { id: "silver", nameEn: "Titanium Silver", nameAm: "የብር ቲታኒየም", hex: "#64748b" },
  { id: "white", nameEn: "Alpine White", nameAm: "አልፓይን ነጭ", hex: "#f8fafc" },
  { id: "red", nameEn: "Crimson Red", nameAm: "ቀይ ክሪምሰን", hex: "#b91c1c" },
  { id: "green", nameEn: "Entoto Green", nameAm: "እንጦጦ አረንጓዴ", hex: "#064e3b" },
];

export const HERO_CAR_COLOR = COLOR_SWATCHES[0].hex; // #d97706 (Imperial Amber)

interface Hero3DSectionProps {
  dealership?: Dealership | null;
}

export default function Hero3DSection({ dealership }: Hero3DSectionProps) {
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [forceLoad3D, setForceLoad3D] = useState(false);
  const [perfProfile, setPerfProfile] = useState<DevicePerformanceProfile | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // 1. Detect hardware and network capabilities on mount
  useEffect(() => {
    const profile = detectDevicePerformance();
    setPerfProfile(profile);
  }, []);

  // 2. Viewport Intersection Observer: only mount WebGL when near viewport
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
        }
      },
      { rootMargin: "250px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldRenderWebGL =
    Boolean(perfProfile && (!perfProfile.isLowEnd || forceLoad3D) && isNearViewport);

  const dealerName = dealership?.name || "AC WALE MARKET";

  return (
    <section ref={sectionRef} className="relative w-full mb-8 pt-2">
      {/* 3D Visual Stage Container */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-zinc-800/80 bg-zinc-950 shadow-2xl">
        {/* Instant LCP Poster Image (always mounted, fades out when WebGL is ready) */}
        <div
          className={`transition-opacity duration-700 ${
            isCanvasReady ? "opacity-0 pointer-events-none absolute inset-0 z-0" : "opacity-100 relative z-10"
          }`}
        >
          <Hero3DPoster
            isLowEnd={perfProfile?.isLowEnd}
            lowEndReason={perfProfile?.reason}
            isLoading={shouldRenderWebGL && !isCanvasReady}
            onForceLoad3D={() => setForceLoad3D(true)}
            dealerName={dealerName}
          />
        </div>

        {/* Dynamic 3D WebGL Pro Canvas */}
        {shouldRenderWebGL && (
          <div
            className={`transition-opacity duration-700 ${
              isCanvasReady ? "opacity-100 relative z-10" : "opacity-0 absolute inset-0 z-0 pointer-events-none"
            }`}
          >
            <div className="relative w-full h-[460px] sm:h-[540px] md:h-[620px] rounded-3xl overflow-hidden bg-black select-none cursor-grab active:cursor-grabbing">
              <Hero3DCanvasPro
                paintColor={HERO_CAR_COLOR}
                preset="overview"
                modelUrl="/models/showroom_car.glb"
                fallbackCar={<ProceduralCarModel bodyColor={HERO_CAR_COLOR} />}
                dpr={perfProfile?.targetDpr || 1.5}
                isDesktop={perfProfile?.isDesktop ?? true}
                active={isNearViewport}
                reducedMotion={perfProfile?.reducedMotion ?? false}
                onReady={() => setIsCanvasReady(true)}
                onContextLost={() => {
                  setIsCanvasReady(false);
                  setForceLoad3D(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
