"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { type Building } from "./village";

/**
 * Realistic building models (CC-BY) placed on the village layout. Each solid
 * building's box is replaced by a real house/tavern/hall model, scaled to its
 * footprint and dropped on the ground. Collision is unchanged (it still comes
 * from COLLIDERS in village.ts), so the model is purely visual.
 */
const MODELS = {
  house: "/models/buildings/house_timber.glb",
  tavern: "/models/buildings/tavern.glb",
  hall: "/models/buildings/stone_hall.glb",
} as const;
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

type ModelKey = keyof typeof MODELS;

/** Pick a model for a solid building by its size, varied by index. */
export function chooseModel(b: Building, i: number): ModelKey {
  const big = Math.max(b.w, b.d);
  if (big >= 10) return "hall";
  if (big >= 8) return i % 2 === 0 ? "tavern" : "hall";
  return i % 3 === 0 ? "tavern" : "house";
}

function BuildingModel({ b, model, seed }: { b: Building; model: ModelKey; seed: number }) {
  const { scene } = useGLTF(MODELS[model]);

  const { obj, rotY, scale } = useMemo(() => {
    const o = scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Pre-centre horizontally and drop the base onto y=0 (so group scale keeps it grounded).
    o.position.set(-center.x, -box.min.y, -center.z);
    o.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });
    // Align the model's longer footprint axis with the building's longer axis.
    const modelLongX = size.x >= size.z;
    const buildLongX = b.w >= b.d;
    let ry = modelLongX === buildLongX ? 0 : Math.PI / 2;
    ry += (seed % 2) * Math.PI; // 180° flips for variety
    // Footprint after alignment rotation → uniform scale to fit b.w × b.d.
    const footX = ry % Math.PI === 0 ? size.x : size.z;
    const footZ = ry % Math.PI === 0 ? size.z : size.x;
    const s = Math.min(b.w / footX, b.d / footZ) * 1.04;
    return { obj: o, rotY: ry, scale: s };
  }, [scene, b.w, b.d, seed]);

  return (
    <group position={[b.x, 0, b.z]} rotation={[0, rotY, 0]} scale={scale}>
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
