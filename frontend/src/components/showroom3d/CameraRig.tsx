"use client";

import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type PresetKey = "overview" | "front" | "wheel" | "cabin";

type V3 = [number, number, number];

/** Car is centred at the origin, ~4.2 long along Z, front toward +Z. Tweak to taste. */
export const CAMERA_PRESETS: Record<PresetKey, { position: V3; target: V3; fov: number }> = {
  overview: { position: [5.4, 1.7, 5.6], target: [0, 0.55, 0], fov: 32 },
  front: { position: [1.6, 0.75, 6.2], target: [0, 0.55, 1.2], fov: 30 },
  wheel: { position: [3.6, 0.55, 2.6], target: [1.0, 0.4, 1.3], fov: 28 },
  cabin: { position: [3.4, 1.35, 0.2], target: [0, 0.9, 0], fov: 34 },
};

interface CameraRigProps {
  preset: PresetKey;
  autoRotate?: boolean;
  reducedMotion?: boolean;
}

/**
 * Glides the camera to the chosen preset, then hands control back to the user.
 * Dragging at any time cancels the glide. Overview slowly turntables when idle.
 */
export default function CameraRig({ preset, autoRotate = true, reducedMotion = false }: CameraRigProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const flying = useRef(true);
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalTarget = useMemo(() => new THREE.Vector3(), []);
  const p = CAMERA_PRESETS[preset];

  useEffect(() => {
    flying.current = true;
  }, [preset]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !flying.current) return;
    goalPos.set(...p.position);
    goalTarget.set(...p.target);
    const k = reducedMotion ? 1 : 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(goalPos, k);
    c.target.lerp(goalTarget, k);
    camera.fov = THREE.MathUtils.lerp(camera.fov, p.fov, k);
    camera.updateProjectionMatrix();
    c.update();
    if (camera.position.distanceTo(goalPos) < 0.02 && c.target.distanceTo(goalTarget) < 0.02) {
      flying.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={9}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 - 0.05}
      autoRotate={autoRotate && !reducedMotion && preset === "overview"}
      autoRotateSpeed={0.6}
      onStart={() => {
        flying.current = false;
      }}
    />
  );
}
