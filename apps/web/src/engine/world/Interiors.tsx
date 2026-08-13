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

/**
 * The bed — built from primitives, not a downloaded model. There's no free bed
 * asset in the project's CC0 set, and this is the one piece of furniture that
 * has to read unmistakably as "bed" the instant you open your eyes each
 * morning, so it gets a real frame + mattress + pillow + blanket rather than
 * another borrowed prop standing in for it.
 *
 * Local space: head (pillow end) at -Z, foot at +Z, centred on X.
 */
function Bed({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const L = 2.0; // frame length (head to foot)
  const W = 1.1; // frame width
  const frameH = 0.32;
  const mattressH = 0.16;
  const headboardH = 0.78;

  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: THEME.wallTimber, roughness: 0.85 }),
    []
  );
  const mattressMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e4d8bd", roughness: 0.95 }),
    []
  );
  const pillowMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f3ecdc", roughness: 0.95 }),
    []
  );
  const blanketMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#7a3630", roughness: 0.9 }),
    []
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Headboard */}
      <mesh material={frameMat} position={[0, headboardH / 2, -L / 2 + 0.04]} receiveShadow>
        <boxGeometry args={[W, headboardH, 0.08]} />
      </mesh>
      {/* Frame / base */}
      <mesh material={frameMat} position={[0, frameH / 2, 0]} receiveShadow>
        <boxGeometry args={[W, frameH, L]} />
      </mesh>
      {/* Mattress */}
      <mesh material={mattressMat} position={[0, frameH + mattressH / 2, 0]} receiveShadow>
        <boxGeometry args={[W - 0.1, mattressH, L - 0.1]} />
      </mesh>
      {/* Pillow, at the headboard end */}
      <mesh material={pillowMat} position={[0, frameH + mattressH + 0.06, -L / 2 + 0.32]} receiveShadow>
        <boxGeometry args={[W * 0.55, 0.12, 0.34]} />
      </mesh>
      {/* Blanket, folded over the foot half */}
      <mesh material={blanketMat} position={[0, frameH + mattressH + 0.03, L * 0.16]} receiveShadow>
        <boxGeometry args={[W - 0.06, 0.06, L * 0.58]} />
      </mesh>
    </group>
  );
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
 * Furnish one of the two enterable, walk-in-and-look-around interiors: HOME
 * (bed, chest, table) or the bank (vault: chest, shelf, strongboxes). The
 * market is the only other enterable space and furnishes itself (stalls in
 * VillageMesh) — no room to dress here. A warm point light + a timber floor
 * make the room read as a real interior rather than the inside of a stone box.
 *
 * Home is the only furnished house on purpose. Every day now starts and ends
 * in this room, so it has to be recognisable the moment you open your eyes —
 * and a village of identical walk-in houses would dilute that, not sell it.
 */
function Interior({ b, r, floorMat, index }: { b: Building; r: Rect; floorMat: THREE.Material; index: number }) {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const floorW = r.maxX - r.minX;
  const floorD = r.maxZ - r.minZ;
  const bank = isBank(r);

  // Only render (and light) this interior while the player is inside it — outside,
  // its furniture + fill light are pure waste. Invisible groups are culled and
  // their lights skipped.
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
          {/* Your room. The door is the +X wall, so the whole layout keeps the
              lane in front of it clear: nothing sits where nx > 0.4 and the z
              offset is small. Waking up and walking straight out has to be
              unobstructed, and the first pass had a chair and a shelf standing
              in the doorway you were being told to walk through.

              The bed is against the far wall, furthest from the street, with
              the chest at the foot of it. */}
          <Bed position={at(r, -0.85, -0.45)} rotation={Math.PI / 2} />
          <Prop model="chest" position={at(r, -0.85, 0.6)} rotation={Math.PI / 2} scale={0.85} />
          <Prop model="table" position={at(r, 0.15, -0.85)} />
          <Prop model="chair" position={at(r, 0.15, -0.4)} rotation={Math.PI} />
          <Prop model="shelf" position={at(r, -0.25, 0.95)} rotation={Math.PI} />
          <Prop model="lantern" position={at(r, -0.9, 0.95)} />
          <Prop model="basket" position={at(r, 0.6, 0.9)} />
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
      {ENTERABLES.map((b, i) =>
        // The open-air market furnishes itself (stalls in VillageMesh) — no house
        // interior (table/chairs/floor) for it.
        b.kind === "market" ? null : (
          <Interior key={i} b={b} r={INTERIORS[i]} floorMat={mats.timber} index={i} />
        )
      )}
    </>
  );
}
