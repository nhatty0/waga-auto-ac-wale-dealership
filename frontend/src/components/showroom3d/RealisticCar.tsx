"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Loads a real car GLB, auto-orients / auto-scales / grounds it, and swaps its
 * materials for physically-based car materials (clearcoat paint, tinted glass,
 * chrome rims, rubber tyres, emissive lamps). Same approach as the three.js
 * `webgl_materials_car` example, but classification is by name regex so it
 * works with most GLBs, not just one model.
 */

export interface CarNameRules {
  paint: RegExp;
  glass: RegExp;
  chrome: RegExp;
  rubber: RegExp;
  headlight: RegExp;
  taillight: RegExp;
  trim: RegExp;
}

export const DEFAULT_RULES: CarNameRules = {
  paint: /body|paint|carpaint|exterior/i,
  glass: /glass|window|windshield|windscreen/i,
  chrome: /rim|alloy|chrome|wheel_?disc/i,
  rubber: /tire|tyre|rubber/i,
  headlight: /headl|head_?lamp|\bdrl\b/i,
  taillight: /taill|tail_?l|rear_?l|brake_?l/i,
  trim: /trim|detail|grille|grill|plastic|exhaust|brake|caliper|badge|mirror/i,
};

interface RealisticCarProps {
  url: string;
  paintColor: string;
  /** Local Draco decoder folder (copy three/examples/jsm/libs/draco/gltf to /public/draco). */
  dracoPath?: string;
  /** Car length in scene units after auto-scaling. */
  targetLength?: number;
  /** Extra Y rotation (radians) if the model's front faces the wrong way. */
  rotationY?: number;
  rules?: Partial<CarNameRules>;
  onLoaded?: () => void;
}

function createMaterials(initialColor: string) {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: initialColor,
      metalness: 0.7,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.1,
    }),
    // Cheap glass: no transmission pass (that doubles render cost on phones).
    glass: new THREE.MeshPhysicalMaterial({
      color: "#0b1118",
      metalness: 0.1,
      roughness: 0.04,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 1.6,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: "#d9dde2",
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.4,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#0c0c0d",
      metalness: 0,
      roughness: 0.85,
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: "#fff6e0",
      emissive: "#ffe8b0",
      emissiveIntensity: 1.1,
      roughness: 0.2,
    }),
    taillight: new THREE.MeshStandardMaterial({
      color: "#4a0508",
      emissive: "#d3141c",
      emissiveIntensity: 1.3,
      roughness: 0.3,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: "#121214",
      metalness: 0.25,
      roughness: 0.5,
    }),
  };
}

type Mats = ReturnType<typeof createMaterials>;

function pickMaterial(key: string, r: CarNameRules, m: Mats): THREE.Material | null {
  if (r.rubber.test(key)) return m.rubber;
  if (r.taillight.test(key)) return m.taillight;
  if (r.headlight.test(key)) return m.headlight;
  if (r.glass.test(key)) return m.glass;
  if (r.chrome.test(key)) return m.chrome;
  if (r.trim.test(key)) return m.trim;
  if (r.paint.test(key)) return m.paint;
  return null; // keep the model's own material (interior, etc.)
}

export default function RealisticCar({
  url,
  paintColor,
  dracoPath = "/draco/",
  targetLength = 4.2,
  rotationY = 0,
  rules,
  onLoaded,
}: RealisticCarProps) {
  const { scene } = useGLTF(url, dracoPath);
  const mats = useMemo(() => createMaterials(paintColor), []); // eslint-disable-line react-hooks/exhaustive-deps
  const target = useMemo(() => new THREE.Color(paintColor), [paintColor]);

  const car = useMemo(() => {
    const merged = { ...DEFAULT_RULES, ...rules };
    const root = scene.clone(true);

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (orig: THREE.Material) =>
        pickMaterial(`${orig.name} ${mesh.name}`, merged, mats) ?? orig;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(swap)
        : swap(mesh.material);
    });

    // Auto-orient: car length should run along Z.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.x > size.z * 1.05) {
      root.rotation.y = -Math.PI / 2;
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      box.getSize(size);
    }

    // Auto-scale, centre on X/Z, sit wheels on the floor (y = 0).
    const scale = targetLength / size.z;
    const center = box.getCenter(new THREE.Vector3());
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    const group = new THREE.Group();
    group.rotation.y = rotationY;
    group.add(root);
    return group;
  }, [scene, mats, rules, targetLength, rotationY]);

  useEffect(() => {
    onLoaded?.();
  }, [car, onLoaded]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats]
  );

  // Smooth paint change when a swatch is picked.
  useFrame((_, dt) => {
    mats.paint.color.lerp(target, 1 - Math.exp(-6 * dt));
  });

  return <primitive object={car} />;
}
