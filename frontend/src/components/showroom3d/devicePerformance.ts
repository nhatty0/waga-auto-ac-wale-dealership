"use client";

export interface DevicePerformanceProfile {
  isLowEnd: boolean;
  reason: string | null;
  targetDpr: number;
  hasWebGL: boolean;
  reducedMotion: boolean;
  isDesktop: boolean;
}

export function detectDevicePerformance(): DevicePerformanceProfile {
  if (typeof window === "undefined") {
    return {
      isLowEnd: false,
      reason: null,
      targetDpr: 1,
      hasWebGL: true,
      reducedMotion: false,
      isDesktop: true,
    };
  }

  // 1. Reduced Motion Preference
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // 2. Desktop vs Mobile detection
  const isDesktop = window.innerWidth >= 1024;

  // 3. WebGL Support Check
  let hasWebGL = false;
  try {
    const canvas = document.createElement("canvas");
    hasWebGL = Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    hasWebGL = false;
  }

  if (!hasWebGL) {
    return {
      isLowEnd: true,
      reason: "No WebGL support detected",
      targetDpr: 1,
      hasWebGL: false,
      reducedMotion,
      isDesktop,
    };
  }

  // 4. Network Data Saver & Effective Connection Type
  const nav = navigator as Navigator & {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };

  if (nav.connection?.saveData) {
    return {
      isLowEnd: true,
      reason: "Data Saver active",
      targetDpr: 1,
      hasWebGL: true,
      reducedMotion,
      isDesktop,
    };
  }

  const effectiveType = nav.connection?.effectiveType;
  if (effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g") {
    return {
      isLowEnd: true,
      reason: `Slow network detected (${effectiveType})`,
      targetDpr: 1,
      hasWebGL: true,
      reducedMotion,
      isDesktop,
    };
  }

  // 5. Hardware Memory & CPU Core Constraints
  const mem = nav.deviceMemory;
  if (typeof mem === "number" && mem <= 2) {
    return {
      isLowEnd: true,
      reason: `Low RAM detected (${mem}GB)`,
      targetDpr: 1,
      hasWebGL: true,
      reducedMotion,
      isDesktop,
    };
  }

  const cores = nav.hardwareConcurrency;
  if (typeof cores === "number" && cores <= 2) {
    return {
      isLowEnd: true,
      reason: `Limited CPU cores (${cores})`,
      targetDpr: 1,
      hasWebGL: true,
      reducedMotion,
      isDesktop,
    };
  }

  // High performance target DPR: 1.5 on desktop, 1.0 on mobile
  const rawDpr = window.devicePixelRatio || 1;
  const targetDpr = isDesktop ? Math.min(rawDpr, 1.5) : 1.0;

  return {
    isLowEnd: false,
    reason: null,
    targetDpr,
    hasWebGL: true,
    reducedMotion,
    isDesktop,
  };
}
