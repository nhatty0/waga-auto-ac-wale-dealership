"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface ProceduralCarModelProps {
  bodyColor: string;
  isHovered?: boolean;
}

export default function ProceduralCarModel({
  bodyColor,
}: ProceduralCarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const targetColor = useMemo(() => new THREE.Color(bodyColor), [bodyColor]);

  // Smooth color lerp when user changes swatch
  useFrame((_, delta) => {
    if (bodyMaterialRef.current) {
      bodyMaterialRef.current.color.lerp(targetColor, Math.min(delta * 5, 1));
    }
  });

  // Materials with Automotive PBR Specifications
  const glassMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#0d1117"),
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.9,
        ior: 1.52,
        transparent: true,
        opacity: 0.85,
        envMapIntensity: 1.5,
      }),
    []
  );

  const chromeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#e2e8f0"),
        metalness: 0.95,
        roughness: 0.12,
        envMapIntensity: 1.8,
      }),
    []
  );

  const darkTrimMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#09090b"),
        metalness: 0.6,
        roughness: 0.45,
      }),
    []
  );

  const tireMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#18181b"),
        roughness: 0.85,
        metalness: 0.08,
      }),
    []
  );

  const headlightMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#ffffff"),
        emissive: new THREE.Color("#e0f2fe"),
        emissiveIntensity: 2.2,
        roughness: 0.1,
        metalness: 0.2,
      }),
    []
  );

  const taillightMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#ef4444"),
        emissive: new THREE.Color("#dc2626"),
        emissiveIntensity: 2.8,
        roughness: 0.2,
      }),
    []
  );

  const brakeCaliperMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#f59e0b"),
        metalness: 0.7,
        roughness: 0.25,
      }),
    []
  );

  return (
    <group ref={groupRef} position={[0, 0, 0]} dispose={null}>
      {/* ========================================================
          1. MAIN CAR BODY (Lower chassis & Sculpted panels)
         ======================================================== */}
      {/* Lower Main Hull */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.45, 4.4]} />
        <meshPhysicalMaterial
          ref={bodyMaterialRef}
          color={bodyColor}
          metalness={0.85}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          envMapIntensity={1.4}
        />
      </mesh>

      {/* Aerodynamic Front Hood Slope */}
      <mesh
        position={[0, 0.62, 1.3]}
        rotation={[-0.12, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1.86, 0.22, 1.7]} />
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={0.85}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* Aerodynamic Rear Deck / Trunk Slope */}
      <mesh
        position={[0, 0.64, -1.45]}
        rotation={[0.1, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1.86, 0.22, 1.4]} />
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={0.85}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* ========================================================
          2. CABIN GREENHOUSE & GLASS
         ======================================================== */}
      {/* Cabin Roof Frame */}
      <mesh position={[0, 0.95, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 0.45, 2.1]} />
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={0.85}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* Windshield (Front Rake) */}
      <mesh
        position={[0, 0.92, 0.92]}
        rotation={[-0.52, 0, 0]}
        castShadow
      >
        <planeGeometry args={[1.5, 0.95]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* Rear Window (Fastback Slant) */}
      <mesh
        position={[0, 0.92, -1.12]}
        rotation={[0.48, 0, 0]}
        castShadow
      >
        <planeGeometry args={[1.5, 0.88]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* Left Side Windows */}
      <mesh
        position={[0.79, 0.94, -0.08]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[1.9, 0.4]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* Right Side Windows */}
      <mesh
        position={[-0.79, 0.94, -0.08]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[1.9, 0.4]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* Roof Panoramic Dark Panel */}
      <mesh position={[0, 1.18, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 1.8]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* ========================================================
          3. FRONT FASCIA, GRILLE & LIGHTING
         ======================================================== */}
      {/* Hexagonal Front Radiator Grille */}
      <mesh position={[0, 0.42, 2.21]}>
        <boxGeometry args={[1.2, 0.28, 0.05]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* Front Chrome Emblem / Horizontal Bar */}
      <mesh position={[0, 0.45, 2.24]}>
        <boxGeometry args={[0.35, 0.06, 0.02]} />
        <primitive object={chromeMaterial} attach="material" />
      </mesh>

      {/* Front Left LED Headlight Assembly */}
      <mesh position={[0.72, 0.54, 2.16]} rotation={[0, 0.18, 0]}>
        <boxGeometry args={[0.38, 0.11, 0.1]} />
        <primitive object={headlightMaterial} attach="material" />
      </mesh>

      {/* Front Right LED Headlight Assembly */}
      <mesh position={[-0.72, 0.54, 2.16]} rotation={[0, -0.18, 0]}>
        <boxGeometry args={[0.38, 0.11, 0.1]} />
        <primitive object={headlightMaterial} attach="material" />
      </mesh>

      {/* Front Lower Splitter / Aero Lip */}
      <mesh position={[0, 0.22, 2.15]}>
        <boxGeometry args={[1.84, 0.06, 0.25]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* ========================================================
          4. REAR FASCIA & FULL-WIDTH LED TAILLIGHT
         ======================================================== */}
      {/* Full-Width Continuous Rear Lightbar */}
      <mesh position={[0, 0.62, -2.21]}>
        <boxGeometry args={[1.74, 0.08, 0.04]} />
        <primitive object={taillightMaterial} attach="material" />
      </mesh>

      {/* Rear Lower Diffuser */}
      <mesh position={[0, 0.26, -2.18]}>
        <boxGeometry args={[1.7, 0.16, 0.15]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* Dual Exhaust Tips (Left & Right) */}
      <mesh position={[0.55, 0.22, -2.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
        <primitive object={chromeMaterial} attach="material" />
      </mesh>
      <mesh position={[-0.55, 0.22, -2.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
        <primitive object={chromeMaterial} attach="material" />
      </mesh>

      {/* Rear Lip Spoiler */}
      <mesh position={[0, 0.76, -2.15]}>
        <boxGeometry args={[1.68, 0.04, 0.18]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* Ethiopian Plate Bracket */}
      <mesh position={[0, 0.44, -2.22]}>
        <boxGeometry args={[0.48, 0.14, 0.02]} />
        <primitive object={chromeMaterial} attach="material" />
      </mesh>

      {/* ========================================================
          5. SIDE MIRRORS & DOOR SILLS
         ======================================================== */}
      {/* Left Mirror */}
      <mesh position={[0.96, 0.88, 0.72]}>
        <boxGeometry args={[0.18, 0.09, 0.14]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>
      {/* Right Mirror */}
      <mesh position={[-0.96, 0.88, 0.72]}>
        <boxGeometry args={[0.18, 0.09, 0.14]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* Left Side Sill Aero Skirt */}
      <mesh position={[0.94, 0.24, 0]}>
        <boxGeometry args={[0.06, 0.08, 2.7]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>
      {/* Right Side Sill Aero Skirt */}
      <mesh position={[-0.94, 0.24, 0]}>
        <boxGeometry args={[0.06, 0.08, 2.7]} />
        <primitive object={darkTrimMaterial} attach="material" />
      </mesh>

      {/* ========================================================
          6. FOUR ALLOY WHEELS WITH BRAKE DISCS & CALIPERS
         ======================================================== */}
      {/* Wheel Positions: [Front-Right, Front-Left, Rear-Right, Rear-Left] */}
      {[
        { pos: [-0.96, 0.36, 1.45] as const, isLeft: false },
        { pos: [0.96, 0.36, 1.45] as const, isLeft: true },
        { pos: [-0.96, 0.36, -1.45] as const, isLeft: false },
        { pos: [0.96, 0.36, -1.45] as const, isLeft: true },
      ].map((w, index) => (
        <group key={index} position={w.pos}>
          {/* Rubber Tire */}
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.26, 32]} />
            <primitive object={tireMaterial} attach="material" />
          </mesh>

          {/* Alloy Rim Inner Disk */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.28, 24]} />
            <primitive object={chromeMaterial} attach="material" />
          </mesh>

          {/* Multi-Spoke Styling (4 Star Spokes) */}
          {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((rot, sIdx) => (
            <mesh
              key={sIdx}
              position={[w.isLeft ? 0.13 : -0.13, 0, 0]}
              rotation={[rot, 0, 0]}
            >
              <boxGeometry args={[0.02, 0.44, 0.04]} />
              <primitive object={chromeMaterial} attach="material" />
            </mesh>
          ))}

          {/* Ventilated Brake Disc */}
          <mesh rotation={[0, 0, Math.PI / 2]} position={[w.isLeft ? -0.05 : 0.05, 0, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.03, 24]} />
            <primitive object={chromeMaterial} attach="material" />
          </mesh>

          {/* High-Performance Brake Caliper */}
          <mesh position={[w.isLeft ? -0.05 : 0.05, 0.16, 0]}>
            <boxGeometry args={[0.06, 0.1, 0.12]} />
            <primitive object={brakeCaliperMaterial} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
