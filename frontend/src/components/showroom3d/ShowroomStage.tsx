"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
} from "@react-three/drei";
import * as THREE from "three";

/**
 * Procedural studio: no HDRI download needed. Lightformers paint soft-box
 * reflections onto the clearcoat (the long white strips you see on real car
 * photography), plus a dark glossy floor and a slow moving spot highlight.
 */

function LightSweep() {
  const ref = useRef<THREE.SpotLight>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x = Math.sin(clock.elapsedTime * 0.35) * 4;
  });
  return (
    <spotLight
      ref={ref}
      position={[0, 5.5, 3]}
      angle={0.45}
      penumbra={1}
      intensity={70}
      color="#fff3e0"
    />
  );
}

interface ShowroomStageProps {
  /** Flip to true once the car is in the scene so shadows bake with it. */
  ready: boolean;
  /** Mirror floor (desktop only; it costs an extra render pass). */
  reflective: boolean;
  /** Moving spot highlight (turn off for reduced motion). */
  animate: boolean;
  background: string;
}

export default function ShowroomStage({
  ready,
  reflective,
  animate,
  background,
}: ShowroomStageProps) {
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 9, 22]} />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 0]} scale={[12, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} position={[-6, 1.5, 0]} scale={[8, 1.4, 1]} target={[0, 0.5, 0]} />
        <Lightformer form="rect" intensity={1.6} position={[6, 1.5, 0]} scale={[8, 1.4, 1]} target={[0, 0.5, 0]} />
        <Lightformer form="rect" intensity={1.2} position={[0, 2, -6]} scale={[10, 1.2, 1]} target={[0, 0.5, 0]} />
        <Lightformer form="ring" intensity={0.8} position={[0, 3, 6]} scale={3} target={[0, 0.5, 0]} />
      </Environment>

      {animate && <LightSweep />}

      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <circleGeometry args={[14, 64]} />
        {reflective ? (
          <MeshReflectorMaterial
            blur={[300, 100]}
            resolution={512}
            mixBlur={1}
            mixStrength={40}
            mirror={0.5}
            roughness={1}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#0d0d10"
            metalness={0.5}
          />
        ) : (
          <meshStandardMaterial color="#0d0d10" roughness={0.9} />
        )}
      </mesh>

      {/* key remounts the baked shadow once the car has loaded */}
      <ContactShadows
        key={String(ready)}
        position={[0, 0.003, 0]}
        opacity={0.7}
        scale={12}
        blur={2.4}
        far={3}
        resolution={512}
        frames={1}
      />
    </>
  );
}
