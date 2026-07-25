"use client";

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ENTERABLES, INTERIORS, VILLAGE, type Building } from "./village";
import { THEME } from "./theme";
import { useVillageMaterials } from "./VillageMesh";
import { runtime } from "@/engine/runtime";

/** CC0 Poly Haven glTF props (real-world scale, in metres). */
const MODELS = {
  chest: "/models/treasure_chest/treasure_chest_1k.gltf",
  table: "/models/WoodenTable_01/WoodenTable_01_1k.gltf",
  chair: "/models/WoodenChair_01/WoodenChair_01_1k.gltf",
  barrel: "/models/barrel_03/barrel_03_1k.gltf",
  basket: "/models/wicker_basket_01/wicker_basket_01_1k.gltf",
  lantern: "/models/Lantern_01/Lantern_01_1k.gltf",
  shelf: "/models/Shelf_01/Shelf_01_1k.gltf",
  pot: "/models/ceramic_pot/ceramic_pot_1k.gltf",
} as const;
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

type ModelKey = keyof typeof MODELS;

/** One placed prop: a shadow-casting clone of a loaded glTF scene. */
function Prop({
  model,
  position,
  rotation = 0,
  scale = 1,
}: {
  model: ModelKey;
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}) {
  const { scene } = useGLTF(MODELS[model]);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={obj} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Map a normalized offset (-1..1) inside a rect to a world position (with margin). */
function at(r: Rect, nx: number, nz: number, y = 0): [number, number, number] {
  const m = 0.7;
  const x = THREE.MathUtils.lerp(r.minX + m, r.maxX - m, (nx + 1) / 2);
  const z = THREE.MathUtils.lerp(r.minZ + m, r.maxZ - m, (nz + 1) / 2);
  return [x, y, z];
}

function isBank(r: Rect) {
  return VILLAGE.bank.x >= r.minX && VILLAGE.bank.x <= r.maxX && VILLAGE.bank.z >= r.minZ && VILLAGE.bank.z <= r.maxZ;
}

/**
 * Furnish one enterable house. The bank interior becomes a vault (chest, shelf,
 * strongboxes); other houses get a lived-in mix (table, chairs, barrels, pots).
 * A warm point light + a timber floor make the room read as a real interior
 * rather than the inside of a stone box.
 */
function Interior({ b, r, floorMat, index }: { b: Building; r: Rect; floorMat: THREE.Material; index: number }) {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const floorW = r.maxX - r.minX;
  const floorD = r.maxZ - r.minZ;
  const bank = isBank(r);

  // Only render (and light) this interior while the player is inside it — outside,
  // its furniture + fill light are pure waste (5 houses × furniture + a point
  // light each). Invisible groups are culled and their lights skipped.
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    if (grp.current) grp.current.visible = runtime.shelterIndex === index;
  });

  return (
    <group ref={grp} visible={false}>
      {/* Timber floor just above the ground plane */}
      <mesh material={floorMat} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.02, cz]} receiveShadow>
        <planeGeometry args={[floorW, floorD]} />
      </mesh>

      {/* Warm interior fill light near the ceiling (no shadow — cheap, and the
          key light already casts the room's shadows) */}
      <pointLight position={[cx, b.h - 0.6, cz]} intensity={9} distance={16} color={THEME.lantern} />

      {bank ? (
        <>
          {/* Vault: the loot chest on the pad, strongboxes, a ledger shelf */}
          <Prop model="chest" position={[VILLAGE.bank.x, 0, VILLAGE.bank.z]} rotation={Math.PI} scale={1.1} />
          <Prop model="chest" position={at(r, -0.75, -0.8)} rotation={0.4} scale={0.9} />
          <Prop model="shelf" position={at(r, 0.8, -0.85)} rotation={-Math.PI / 2} />
          <Prop model="pot" position={at(r, 0.85, 0.7)} scale={1.1} />
          <Prop model="lantern" position={at(r, -0.85, 0.8)} />
        </>
      ) : (
        <>
          <Prop model="table" position={[cx, 0, cz]} rotation={floorW >= floorD ? 0 : Math.PI / 2} />
          <Prop model="chair" position={at(r, -0.35, -0.5)} rotation={0.2} />
          <Prop model="chair" position={at(r, 0.35, 0.5)} rotation={Math.PI + 0.2} />
          <Prop model="barrel" position={at(r, 0.85, -0.85)} />
          <Prop model="barrel" position={at(r, 0.7, -0.85)} scale={0.95} />
          <Prop model="basket" position={at(r, -0.85, 0.85)} />
          <Prop model="pot" position={at(r, -0.85, -0.85)} />
          <Prop model="lantern" position={at(r, 0.85, 0.85)} />
        </>
      )}
    </group>
  );
}

/** Furnishes every enterable house interior with real 3D props. */
export function Interiors() {
  const mats = useVillageMaterials();
  return (
    <>
      {ENTERABLES.map((b, i) => (
        <Interior key={i} b={b} r={INTERIORS[i]} floorMat={mats.timber} index={i} />
      ))}
    </>
  );
}
