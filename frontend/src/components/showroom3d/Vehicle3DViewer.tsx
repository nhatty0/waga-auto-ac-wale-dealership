"use client";

import React, { useRef, useState, Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useGLTF } from "@react-three/drei";
import { RotateCw, RefreshCw, Sparkles, Box, Info } from "lucide-react";
import ProceduralCarModel from "./ProceduralCarModel";

interface Vehicle3DViewerProps {
  modelUrl?: string | null;
  bodyColor?: string;
  vehicleTitle?: string;
  lang?: "en" | "am";
}

function ModelLoader({ modelUrl, bodyColor }: { modelUrl: string; bodyColor: string }) {
  try {
    const gltf = useGLTF(modelUrl);
    return <primitive object={gltf.scene} dispose={null} />;
  } catch (err) {
    console.warn("Failed to load custom GLB model, falling back to procedural model", err);
    return <ProceduralCarModel bodyColor={bodyColor} />;
  }
}

export default function Vehicle3DViewer({
  modelUrl,
  bodyColor = "#d97706",
  vehicleTitle = "Vehicle Inspection",
  lang = "en",
}: Vehicle3DViewerProps) {
  const [isRotating, setIsRotating] = useState(true);

  return (
    <div className="relative aspect-[16/10] w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800/80 shadow-2xl select-none group">
      {/* Top Header Badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-black border border-amber-400 text-xs font-black shadow-lg backdrop-blur-md">
          <Box size={14} />
          <span>3D INSPECT</span>
        </span>
      </div>

      {/* Top Right Quick Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsRotating(!isRotating)}
          className={`p-2 rounded-xl border backdrop-blur-md transition ${
            isRotating
              ? "bg-amber-500/20 border-amber-500 text-amber-400"
              : "bg-black/60 border-white/10 text-zinc-400 hover:text-white"
          }`}
          title={isRotating ? "Pause Turntable" : "Resume Turntable"}
        >
          <RotateCw size={15} className={isRotating ? "animate-spin-slow" : ""} />
        </button>
      </div>

      {/* Canvas */}
      <Canvas
        camera={{ position: [4.2, 1.8, 4.2], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={["#09090b"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 4]} intensity={1.8} castShadow />
        <directionalLight position={[-4, 4, -4]} intensity={1.2} color="#93c5fd" />
        <directionalLight position={[3, -2, -3]} intensity={0.4} color="#fef3c7" />

        <Suspense fallback={null}>
          {modelUrl ? (
            <ModelLoader modelUrl={modelUrl} bodyColor={bodyColor} />
          ) : (
            <ProceduralCarModel bodyColor={bodyColor} />
          )}
        </Suspense>

        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.8}
          scale={10}
          blur={2.5}
          far={3.5}
          resolution={512}
        />

        <OrbitControls
          autoRotate={isRotating}
          autoRotateSpeed={1.2}
          enableDamping
          dampingFactor={0.06}
          minDistance={2.5}
          maxDistance={7.5}
          minPolarAngle={Math.PI / 4.5}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>

      {/* Bottom Hint */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
        <span className="text-[11px] text-zinc-400 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10">
          {lang === "am" ? "ለማሽከርከር ይጎትቱ • ለማጉላት ፒንች ያድርጉ" : "Drag to inspect • Scroll to zoom"}
        </span>
      </div>
    </div>
  );
}
