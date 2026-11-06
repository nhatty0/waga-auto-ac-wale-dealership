"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import ProceduralCarModel from "./ProceduralCarModel";

export type CameraPreset = "wide" | "grille" | "wheel" | "cabin";

interface Hero3DCanvasProps {
  bodyColor: string;
  cameraPreset: CameraPreset;
  targetDpr: number;
  isDesktop: boolean;
  onReady?: () => void;
  onContextLost?: () => void;
}

const PRESET_CONFIGS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; fov: number }
> = {
  wide: {
    pos: [4.2, 1.8, 4.6],
    target: [0, 0.5, 0],
    fov: 38,
  },
  grille: {
    pos: [1.1, 0.75, 3.2],
    target: [0, 0.48, 1.6],
    fov: 34,
  },
  wheel: {
    pos: [2.1, 0.55, 1.6],
    target: [0.96, 0.36, 1.45],
    fov: 32,
  },
  cabin: {
    pos: [2.7, 1.4, -0.3],
    target: [0, 0.8, 0],
    fov: 36,
  },
};

function CameraRig({
  preset,
  isUserInteracting,
}: {
  preset: CameraPreset;
  isUserInteracting: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const targetConfig = PRESET_CONFIGS[preset];

  const desiredPos = useMemo(
    () => new THREE.Vector3(...targetConfig.pos),
    [targetConfig]
  );
  const desiredTarget = useMemo(
    () => new THREE.Vector3(...targetConfig.target),
    [targetConfig]
  );

  useFrame((_, delta) => {
    // Only glide camera position and target if user is not manually orbiting
    if (!isUserInteracting && controlsRef.current) {
      camera.position.lerp(desiredPos, Math.min(delta * 2.8, 1));
      controlsRef.current.target.lerp(desiredTarget, Math.min(delta * 2.8, 1));
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.85}
      zoomSpeed={0.7}
      panSpeed={0.5}
      enablePan={false}
      minDistance={2.4}
      maxDistance={7.5}
      minPolarAngle={Math.PI / 4.8}
      maxPolarAngle={Math.PI / 2 - 0.05} // prevent going beneath showroom floor
    />
  );
}

function TurntableGroup({
  bodyColor,
  isUserInteracting,
}: {
  bodyColor: string;
  isUserInteracting: boolean;
}) {
  const carGroupRef = useRef<THREE.Group>(null);

  // Slow idle turntable rotation when idle
  useFrame((_, delta) => {
    if (!isUserInteracting && carGroupRef.current) {
      carGroupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={carGroupRef}>
      <ProceduralCarModel bodyColor={bodyColor} />
    </group>
  );
}

function StudioEnvironment({ isDesktop }: { isDesktop: boolean }) {
  return (
    <>
      {/* Showroom Ambient Lighting */}
      <ambientLight intensity={0.4} color="#f8fafc" />

      {/* Main Overhead Softbox Light */}
      <directionalLight
        position={[4, 7, 3]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />

      {/* Warm Front-Right Accent Light */}
      <directionalLight
        position={[-3, 4, 4]}
        intensity={1.1}
        color="#fef3c7"
      />

      {/* Cool Rear-Left Rim / Silhouette Light */}
      <directionalLight
        position={[-4, 3, -4]}
        intensity={1.4}
        color="#93c5fd"
      />

      {/* Ground Bounce Fill Light */}
      <pointLight position={[0, -0.4, 0]} intensity={0.5} color="#e0f2fe" />

      {/* Soft Contact Shadows beneath tires & underbody */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.8}
        scale={12}
        blur={2.4}
        far={3.8}
        resolution={512}
        color="#000000"
      />

      {/* Subtle Showroom Reflective Floor (Desktop Only) */}
      {isDesktop && (
        <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial
            color="#050507"
            roughness={0.25}
            metalness={0.7}
            envMapIntensity={0.6}
          />
        </mesh>
      )}
    </>
  );
}

export default function Hero3DCanvas({
  bodyColor,
  cameraPreset,
  targetDpr,
  isDesktop,
  onReady,
  onContextLost,
}: Hero3DCanvasProps) {
  const [isInteracting, setIsInteracting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notify parent when mounted and ready
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady?.();
    }, 180);
    return () => clearTimeout(timer);
  }, [onReady]);

  // Handle WebGL context lost gracefully
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleLost = (e: Event) => {
      e.preventDefault();
      console.warn("[AutoShowroom 3D] WebGL context lost");
      onContextLost?.();
    };

    canvas.addEventListener("webglcontextlost", handleLost, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost, false);
    };
  }, [onContextLost]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[460px] sm:h-[540px] md:h-[620px] rounded-3xl overflow-hidden bg-black select-none cursor-grab active:cursor-grabbing"
      onPointerDown={() => setIsInteracting(true)}
      onPointerUp={() => setIsInteracting(false)}
      onPointerLeave={() => setIsInteracting(false)}
      onTouchStart={() => setIsInteracting(true)}
      onTouchEnd={() => setIsInteracting(false)}
    >
      <Canvas
        ref={canvasRef}
        dpr={targetDpr}
        camera={{ position: [4.2, 1.8, 4.6], fov: 38 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={["#08080a"]} />
        <fog attach="fog" args={["#08080a", 8, 22]} />

        <CameraRig preset={cameraPreset} isUserInteracting={isInteracting} />
        <TurntableGroup bodyColor={bodyColor} isUserInteracting={isInteracting} />
        <StudioEnvironment isDesktop={isDesktop} />
      </Canvas>
    </div>
  );
}
