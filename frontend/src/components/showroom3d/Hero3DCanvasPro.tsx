"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import RealisticCar from "./RealisticCar";
import ShowroomStage from "./ShowroomStage";
import CameraRig, { CAMERA_PRESETS, type PresetKey } from "./CameraRig";

/** HEAD-checks the GLB so a missing file falls back instead of crashing the canvas. */
function useModelAvailable(url: string) {
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  useEffect(() => {
    let alive = true;
    fetch(url, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") || "";
        if (alive) setState(r.ok && !type.includes("text/html") ? "yes" : "no");
      })
      .catch(() => alive && setState("no"));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

export interface Hero3DCanvasProProps {
  paintColor: string;
  preset: PresetKey;
  modelUrl?: string;
  /** Rendered if the GLB is missing, e.g. your existing <ProceduralCarModel color={...} />. */
  fallbackCar?: ReactNode;
  isDesktop?: boolean;
  /** Max DPR (devicePerformance.targetDpr). */
  dpr?: number;
  /** false when offscreen or tab hidden: stops rendering entirely. */
  active?: boolean;
  reducedMotion?: boolean;
  background?: string;
  onReady?: () => void;
  onContextLost?: () => void;
}

export default function Hero3DCanvasPro({
  paintColor,
  preset,
  modelUrl = "/models/showroom_car.glb",
  fallbackCar,
  isDesktop = true,
  dpr = 1.5,
  active = true,
  reducedMotion = false,
  background = "#0a0a0b",
  onReady,
  onContextLost,
}: Hero3DCanvasProProps) {
  const available = useModelAvailable(modelUrl);
  const [carReady, setCarReady] = useState(false);
  const start = CAMERA_PRESETS.overview;

  useEffect(() => {
    if (available === "no") {
      setCarReady(true);
      onReady?.();
    }
  }, [available, onReady]);

  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: start.position, fov: start.fov, near: 0.1, far: 60 }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
    >
      <ShowroomStage
        ready={carReady}
        reflective={isDesktop}
        animate={!reducedMotion}
        background={background}
      />
      <Suspense fallback={null}>
        {available === "yes" && (
          <RealisticCar
            url={modelUrl}
            paintColor={paintColor}
            onLoaded={() => {
              setCarReady(true);
              onReady?.();
            }}
          />
        )}
        {available === "no" && fallbackCar}
      </Suspense>
      <CameraRig preset={preset} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
