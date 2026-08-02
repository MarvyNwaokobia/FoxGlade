"use client";

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type Building } from "./village";
import { runtime } from "@/engine/runtime";

/**
 * Realistic building models (CC-BY) placed on the village layout. Each solid
 * building's box is replaced by a real house/tavern/hall model, scaled to its
 * footprint and dropped on the ground. Collision is unchanged (it still comes
 * from COLLIDERS in village.ts), so the model is purely visual.
 */
const MODELS = {
  tavern: "/models/buildings/tavern.glb",
  hall: "/models/buildings/stone_hall.glb",
} as const;
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

export type ModelKey = keyof typeof MODELS;

// Per-building colour tints so the one house model reads as many distinct houses
// (weathering: neutral, whitewashed cream, cool grey stone, sandy timber, mossy).
// Subtle multipliers — variation, not recolouring. Picked by the building's seed.
export const TINTS = [0xffffff, 0xe9ddc4, 0xc7cad2, 0xdcc9a6, 0xc2c8b2, 0xd6c4bd];

/** The weathering tint a building (by seed) is rendered with — so its doorway/trim
 *  can be tinted to MATCH the building instead of clashing. */
export function tintColor(seed: number): THREE.Color {
  return new THREE.Color(TINTS[seed % TINTS.length]);
}

/**
 * Which model a building uses: the tavern, for everything except the bank.
 *
 * I tried mixing `hall` in to break up the repetition and reverted it — the model
 * is a roofless stone shell with open window frames, so a street of them reads as
 * a ruin, not a town. The comment this replaced had already recorded that
 * decision ("retired as unrealistic here: stone_hall as a house") and I should
 * have trusted it rather than re-running the experiment.
 *
 * So the repetition stands, and it is an ASSET problem rather than a code one:
 * two or three more house meshes would fix in an afternoon what no amount of
 * tinting, rotating or rescaling can. What the code CAN do — vary proportion and
 * height per building so the skyline isn't flat — it now does below.
 */
export function chooseModel(_b: Building, _i: number): ModelKey {
  return "tavern";
}

/**
 * A realistic building model fitted to a building footprint and grounded.
 * `hideForShelterIndex` (optional): when the player is inside that enterable
 * house, this exterior hides so the furnished interior shows (swap-on-enter).
 */
export function BuildingModel({
  b,
  model,
  seed,
  hideForShelterIndex,
}: {
  b: Building;
  model: ModelKey;
  seed: number;
  hideForShelterIndex?: number;
}) {
  const { scene } = useGLTF(MODELS[model]);
  const grp = useRef<THREE.Group>(null);

  const { obj, rotY, scale } = useMemo(() => {
    const o = scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Pre-centre horizontally and drop the base onto y=0 (so group scale keeps it grounded).
    o.position.set(-center.x, -box.min.y, -center.z);
    const tint = new THREE.Color(TINTS[seed % TINTS.length]);
    o.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Own + tint the materials per instance so each building weathers uniquely
        // (clone(true) shares materials by reference otherwise).
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.color) sm.color.multiply(tint);
        });
      }
    });
    // Align the model's longer footprint axis with the building's longer axis.
    const modelLongX = size.x >= size.z;
    const buildLongX = b.w >= b.d;
    let ry = modelLongX === buildLongX ? 0 : Math.PI / 2;
    ry += (seed % 2) * Math.PI; // 180° flips for variety
    const footX = ry % Math.PI === 0 ? size.x : size.z;
    const footZ = ry % Math.PI === 0 ? size.z : size.x;
    // Fit the footprint PROPERLY. A single uniform scale (the old
    // `min(w/footX, d/footZ)`) fits the narrow axis and leaves the model rattling
    // around inside its own collider — which is why you could be blocked by
    // apparently open ground and walk through apparently solid gaps. Per-axis
    // scaling fixes that, clamped so nothing stretches more than 35% off-square
    // and turns to taffy. Height varies too, so the skyline isn't dead flat.
    const fx = b.w / footX;
    const fz = b.d / footZ;
    const base = Math.min(fx, fz);
    const cap = base * 1.35;
    const sy = base * (0.92 + ((seed * 37) % 5) * 0.11);
    const scl: [number, number, number] = [
      Math.min(fx, cap) * 1.02,
      sy,
      Math.min(fz, cap) * 1.02,
    ];
    return { obj: o, rotY: ry, scale: scl };
  }, [scene, b.w, b.d, seed]);

  // Swap-on-enter: hide this exterior while the player is inside this house.
  useFrame(() => {
    if (hideForShelterIndex === undefined || !grp.current) return;
    grp.current.visible = runtime.shelterIndex !== hideForShelterIndex;
  });

  return (
    <group ref={grp} position={[b.x, 0, b.z]} rotation={[0, rotY, 0]} scale={scale}>
      <primitive object={obj} />
    </group>
  );
}

/** Renders realistic models for the given solid buildings. */
export function Buildings3D({ buildings }: { buildings: { b: Building; i: number }[] }) {
  return (
    <>
      {buildings.map(({ b, i }) => (
        <BuildingModel key={i} b={b} model={chooseModel(b, i)} seed={i} />
      ))}
    </>
  );
}
