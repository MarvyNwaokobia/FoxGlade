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
  // The BANK. `hall` was a roofless stone shell with open window frames — as a
  // vault it read as a ruin you happened to be able to bank in, which is the
  // opposite of what a strongroom should look like. This is a substantial,
  // roofed, realistic house: it stands out from the tavern-lined streets by
  // being visibly a better building, which is exactly the right signal for the
  // one place in the village where money is kept.
  bank: "/models/buildings/house_timber.glb",
} as const;
// Preload only what the STREET needs. `bank` is a 15MB asset used by exactly one
// building, and `hall` is unused on the street too — preloading either would put
// them on the critical path of every single load, on mobile connections, for a
// single mesh apiece. They are fetched by the component that actually wants them.
useGLTF.preload(MODELS.tavern);

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
 * House meshes the street may draw from, chosen by the building's seed.
 *
 * Add entries here and the town varies immediately — that is the whole reason
 * this is a list rather than a constant. Good CC0 sources that match the Tudor
 * look already in the village: KayKit's Medieval Builder Pack and Quaternius's
 * Fantasy Town, both public domain, no attribution, no cost. Drop a .glb into
 * public/models/buildings/, add it to MODELS, add its key here.
 *
 * `hall` is deliberately NOT in this list: it's a roofless stone shell with open
 * window frames, so a street of them reads as a ruin rather than a town. That
 * was tried, reverted, and is recorded here so it doesn't get re-tried a third
 * time. The bank still uses it directly, where a grand stone hall is right.
 */
const HOUSE_MESHES: ModelKey[] = ["tavern"];

/**
 * Which model a building uses.
 *
 * With one entry in HOUSE_MESHES this still returns the tavern every time, and
 * the repetition is still visible — it is genuinely an ASSET problem, and two or
 * three more meshes fix in an afternoon what no amount of tinting can. What the
 * code can do it now does: proportion and height vary per building (below), and
 * chimneys, dormers, lean-tos and painted trim vary the outline
 * (see world/HouseDressing.tsx). Those compose with new meshes rather than
 * substituting for them.
 */
export function chooseModel(_b: Building, i: number): ModelKey {
  return HOUSE_MESHES[i % HOUSE_MESHES.length];
}

export interface BuildingFit {
  rotY: number;
  scale: [number, number, number];
  /** Height of the model as actually RENDERED, in metres. */
  height: number;
  /** Footprint of the model as actually rendered (may be smaller than b.w/b.d). */
  footW: number;
  footD: number;
}

/**
 * How a house mesh is fitted onto a building's footprint.
 *
 * Exported because anything that ATTACHES to a house — chimneys, dormers,
 * lean-tos, painted trim — has to agree with this exactly. The dressing was
 * first written against the collision box (`b.h`, `b.w`, `b.d`) and the result
 * was chimneys hanging in mid-air and sheds standing in the middle of the
 * street, because the collider is not the same size as the mesh drawn inside it.
 * One function, one answer, both callers.
 */
export function fitBuilding(size: THREE.Vector3, b: Building, seed: number): BuildingFit {
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
  const sx = Math.min(fx, cap) * 1.02;
  const sz = Math.min(fz, cap) * 1.02;
  return {
    rotY: ry,
    scale: [sx, sy, sz],
    height: size.y * sy,
    // Back into world-space footprint: the rotation only ever swaps the axes.
    footW: (ry % Math.PI === 0 ? size.x * sx : size.z * sz),
    footD: (ry % Math.PI === 0 ? size.z * sz : size.x * sx),
  };
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
    const fitted = fitBuilding(size, b, seed);
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
    return { obj: o, rotY: fitted.rotY, scale: fitted.scale };
  }, [scene, b, seed]);

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
