"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Outdoor set-dressing (CC0 Poly Haven): barrels, crates, benches, baskets, pots
 * scattered through the streets and market plaza so the town feels lived-in.
 * Purely visual (no collision yet). Positions are a hand-placed first pass —
 * easy to nudge in PLACEMENTS.
 */
const MODELS = {
  barrels: "/models/props/wooden_barrels_01/wooden_barrels_01_1k.gltf",
  crate: "/models/props/wooden_crate_01/wooden_crate_01_1k.gltf",
  bench: "/models/props/painted_wooden_bench/painted_wooden_bench_1k.gltf",
  bucket: "/models/props/wooden_bucket_01/wooden_bucket_01_1k.gltf",
  barrel: "/models/barrel_03/barrel_03_1k.gltf",
  basket: "/models/wicker_basket_01/wicker_basket_01_1k.gltf",
  pot: "/models/ceramic_pot/ceramic_pot_1k.gltf",
  table: "/models/WoodenTable_01/WoodenTable_01_1k.gltf",
} as const;
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

type PropKey = keyof typeof MODELS;

/** [model, x, z, rotationY, scale?] — hand-placed in open street/plaza areas. */
const PLACEMENTS: [PropKey, number, number, number, number?][] = [
  // Market plaza cluster (around -22,5)
  ["table", -19, 4, 0.2],
  ["barrels", -20.5, 6.5, 0.3],
  ["crate", -18.5, 6.8, 0.8],
  ["basket", -21, 7.6, 0],
  ["pot", -23, 6, 0],
  ["bench", -17.5, 3, 1.5],
  ["barrel", -24, 8.5, 0],
  // Spawn / gate area (around 0,28)
  ["bench", -2.5, 27, 0.1],
  ["barrels", 3.5, 27, 0],
  ["bucket", 2, 25.5, 0],
  ["crate", -4, 25, 0.5],
  // Main street heading north
  ["crate", 1.5, 20, 0.3],
  ["barrel", -1.5, 14.5, 0],
  ["basket", 5.5, 9.5, 0],
  ["pot", -9, 15, 0],
  // East courtyard (around 20,-8)
  ["barrels", 20, 2, 0.5],
  ["crate", 24.5, -11, 0.2],
  ["bucket", 13.5, -13.5, 0],
  ["pot", 16.5, -19, 0],
  // Deep north approach
  ["barrel", -8, -22, 0],
  ["crate", -16, -15, 0.6],
  ["basket", 6, -30, 0],
];

function PropModel({ prop, x, z, rot, scale }: { prop: PropKey; x: number; z: number; rot: number; scale: number }) {
  const { scene } = useGLTF(MODELS[prop]);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    // Drop the base onto the ground.
    const box = new THREE.Box3().setFromObject(c);
    c.position.y = -box.min.y;
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]} scale={scale}>
      <primitive object={obj} />
    </group>
  );
}

/** Scatters outdoor props through the village. */
export function Props() {
  return (
    <>
      {PLACEMENTS.map(([prop, x, z, rot, scale], i) => (
        <PropModel key={i} prop={prop} x={x} z={z} rot={rot} scale={scale ?? 1} />
      ))}
    </>
  );
}
