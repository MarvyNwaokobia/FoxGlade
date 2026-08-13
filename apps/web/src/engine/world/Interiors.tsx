"use client";

import { useMemo, useRef } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
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
 * Rebuilt 2026-08-13 (Marvy's call — the old version read as "boxed and
 * placed there"): turned corner posts with finials instead of a flat-topped
 * rectangle, a footboard to match the headboard, an actual wood-grain texture
 * on the frame (the same CC0 planks material the floor already wears, at
 * furniture rather than room scale — see `bedFrameMaterial` in `Interiors()`)
 * instead of a flat solid colour, a two-layer mattress so the top edge reads
 * as puffed, a pillow built from a squashed sphere instead of a box, and a
 * blanket with a rolled fold at its top edge instead of a flat slab.
 *
 * Local space: head (pillow end) at -Z, foot at +Z, centred on X.
 */
function Bed({
  position,
  rotation = 0,
  frameMat,
}: {
  position: [number, number, number];
  rotation?: number;
  frameMat: THREE.Material;
}) {
  const L = 2.0; // frame length (head to foot)
  const W = 1.1; // frame width
  const frameH = 0.32;
  const mattressH = 0.16;
  const headboardH = 0.78;
  const footboardH = 0.4;
  const postR = 0.055;

  const mattressMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e4d8bd", roughness: 0.95 }),
    []
  );
  const mattressCapMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ece2c9", roughness: 0.92 }),
    []
  );
  const pillowMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f6f0e0", roughness: 0.9 }),
    []
  );
  const blanketMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#7a3630", roughness: 0.88 }),
    []
  );

  const postX = W / 2 - postR - 0.02;
  const headZ = -L / 2 + postR + 0.02;
  const footZ = L / 2 - postR - 0.02;
  const postHeadH = headboardH + 0.1;
  const postFootH = footboardH + 0.08;

  // Everything soft (pillow, blanket) stacks on top of the mattress's puffed
  // cap layer, not the frame — named once so the stack can't drift out of
  // alignment as pieces get tuned.
  const mattressSurfaceY = frameH + mattressH + 0.05;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Corner posts, capped with a turned finial — the single biggest tell
          that this is furniture and not a stack of boxes: real bed frames
          aren't flat-topped rectangles. */}
      {(
        [
          [-postX, headZ, postHeadH],
          [postX, headZ, postHeadH],
          [-postX, footZ, postFootH],
          [postX, footZ, postFootH],
        ] as [number, number, number][]
      ).map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={frameMat} position={[0, h / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[postR, postR * 1.15, h, 10]} />
          </mesh>
          <mesh material={frameMat} position={[0, h + postR, 0]} castShadow>
            <sphereGeometry args={[postR * 1.2, 10, 8]} />
          </mesh>
        </group>
      ))}
      {/* Headboard, set between the head posts */}
      <mesh material={frameMat} position={[0, headboardH / 2, -L / 2 + 0.04]} castShadow receiveShadow>
        <boxGeometry args={[W - postR * 2, headboardH, 0.07]} />
      </mesh>
      {/* Footboard, set between the foot posts */}
      <mesh material={frameMat} position={[0, footboardH / 2, L / 2 - 0.04]} castShadow receiveShadow>
        <boxGeometry args={[W - postR * 2, footboardH, 0.06]} />
      </mesh>
      {/* Frame / base */}
      <mesh material={frameMat} position={[0, frameH / 2, 0]} receiveShadow>
        <boxGeometry args={[W, frameH, L]} />
      </mesh>
      {/* Mattress: a firm base layer plus a slightly narrower cap layer, so the
          top edge steps in instead of reading as one flat slab. */}
      <mesh material={mattressMat} position={[0, frameH + mattressH / 2, 0]} receiveShadow>
        <boxGeometry args={[W - 0.1, mattressH, L - 0.1]} />
      </mesh>
      <mesh material={mattressCapMat} position={[0, frameH + mattressH + 0.025, 0]} receiveShadow>
        <boxGeometry args={[W - 0.18, 0.05, L - 0.18]} />
      </mesh>
      {/* Pillow — a squashed sphere reads as soft on sight; a box never did. */}
      <mesh
        material={pillowMat}
        position={[0, mattressSurfaceY + 0.11, -L / 2 + 0.34]}
        scale={[W * 0.42, 0.11, 0.22]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      {/* Blanket, folded over the foot half, with a rolled top edge — the
          detail that reads as fabric someone laid down, not a slab. */}
      <mesh
        material={blanketMat}
        position={[0, mattressSurfaceY + 0.0275, L * 0.08]}
        receiveShadow
      >
        <boxGeometry args={[W - 0.06, 0.055, L * 0.5]} />
      </mesh>
      <mesh
        material={blanketMat}
        position={[0, mattressSurfaceY + 0.055, L * 0.08 - L * 0.25]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.055, 0.055, W - 0.06, 12]} />
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
function Interior({
  b,
  r,
  floorMat,
  bedMat,
  index,
}: {
  b: Building;
  r: Rect;
  floorMat: THREE.Material;
  bedMat: THREE.Material;
  index: number;
}) {
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
          <Bed position={at(r, -0.85, -0.45)} rotation={Math.PI / 2} frameMat={bedMat} />
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

/**
 * Wood-grain material for the bed frame, at FURNITURE scale.
 *
 * `mats.timber` (the same CC0 planks texture) already exists and dresses the
 * interior floor, but its repeat is tuned for a whole room — reusing that
 * exact material instance on a small bed would smear a room-scale tiling
 * across a half-metre headboard. Cloning the textures (not the shared
 * `mats.timber` instance itself) and re-tiling them small is what keeps this
 * independent of the floor's tiling instead of fighting over one shared
 * texture's `.repeat`.
 */
function useBedFrameMaterial(): THREE.MeshStandardMaterial {
  const diff = useTexture("/textures/brown_planks_05_diff.jpg");
  const nor = useTexture("/textures/brown_planks_05_nor_gl.jpg");
  const rough = useTexture("/textures/brown_planks_05_rough.jpg");
  return useMemo(() => {
    const map = diff.clone();
    const normalMap = nor.clone();
    const roughnessMap = rough.clone();
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1.4, 1.4);
      t.needsUpdate = true;
    }
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1 });
  }, [diff, nor, rough]);
}

/** Furnishes every enterable house interior with real 3D props. */
export function Interiors() {
  const mats = useVillageMaterials();
  const bedMat = useBedFrameMaterial();
  return (
    <>
      {ENTERABLES.map((b, i) =>
        // The open-air market furnishes itself (stalls in VillageMesh) — no house
        // interior (table/chairs/floor) for it.
        b.kind === "market" ? null : (
          <Interior key={i} b={b} r={INTERIORS[i]} floorMat={mats.timber} bedMat={bedMat} index={i} />
        )
      )}
    </>
  );
}
