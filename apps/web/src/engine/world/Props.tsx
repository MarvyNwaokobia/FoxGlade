"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, VILLAGE } from "./village";

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

/**
 * Set-dressing pushed up against the buildings.
 *
 * The hand-placed list above puts things in the open — in plazas and along the
 * middle of streets. What the town was missing is the other thing: the stuff
 * that lives against a wall. Every building was a clean box meeting clean
 * cobblestone at a hard line, and a wall with nothing leaning on it is the
 * clearest tell that a place was built rather than lived in.
 *
 * So each solid building gets a couple of things stacked against its faces,
 * placed deterministically off the building's index (same layout every run, no
 * popping, no randomness to re-tune). Doorways are left clear, and so are the
 * spawn, market and vault pads — you should never have to walk around a barrel
 * to reach a thing the game told you to go to.
 */
const KEEP_CLEAR: [number, number, number][] = [
  [VILLAGE.spawn.x, VILLAGE.spawn.z, 4],
  [VILLAGE.market.x, VILLAGE.market.z, 4],
  [VILLAGE.bank.x, VILLAGE.bank.z, 3.5],
];
const WALL_PROPS: PropKey[] = ["barrels", "crate", "barrel", "basket", "bucket", "pot", "bench"];

function wallProps(): [PropKey, number, number, number, number][] {
  const out: [PropKey, number, number, number, number][] = [];
  // A tiny deterministic hash, so the town dresses itself the same way each run.
  const rnd = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  BUILDINGS.forEach((b, i) => {
    if (b.h < 2) return; // cover crates dress themselves
    const faces: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    // Two faces per building, chosen by index — not all four, or the town turns
    // into a junkyard and the draw calls stop being free.
    const count = 1 + Math.floor(rnd(i * 3.3) * 2);
    for (let k = 0; k < count; k++) {
      const [nx, nz] = faces[Math.floor(rnd(i * 7.7 + k * 2.1) * 4)];
      // Slide along the face, staying away from the corners (and any doorway,
      // which is always centred).
      const along = (rnd(i * 13.1 + k * 5.3) - 0.5) * 1.3;
      const halfAlong = (nx === 0 ? b.w : b.d) / 2;
      const offset = 0.55 + rnd(i * 17.9 + k) * 0.35;
      const ax = nx === 0 ? b.x + along * halfAlong : b.x + nx * (b.w / 2 + offset);
      const az = nx === 0 ? b.z + nz * (b.d / 2 + offset) : b.z + along * halfAlong;
      // Skip anything that would crowd a doorway.
      if (b.door && Math.abs(along) < 0.45) continue;
      if (KEEP_CLEAR.some(([cx, cz, r]) => Math.hypot(ax - cx, az - cz) < r)) continue;
      if (Math.abs(ax) > VILLAGE.half - 1.5 || Math.abs(az) > VILLAGE.half - 1.5) continue;
      const prop = WALL_PROPS[Math.floor(rnd(i * 23.3 + k * 3.7) * WALL_PROPS.length)];
      // Face out from the wall, with a few degrees of slop so nothing is square.
      const rot = Math.atan2(nx, nz) + (rnd(i * 29.1 + k) - 0.5) * 0.6;
      out.push([prop, ax, az, rot, 0.9 + rnd(i * 31.7 + k) * 0.25]);
    }
  });
  return out;
}

/**
 * Every placement of ONE prop model, as instanced meshes.
 *
 * Dressing the building walls took the scene from ~100 draw calls to ~266,
 * because each prop was a fresh clone of a multi-mesh GLTF — around fifty props
 * costing well over a hundred calls between them. They're the same handful of
 * models repeated, which is exactly what instancing is for: one call per
 * sub-mesh per model however many are placed, so the whole scatter costs about
 * what two of the old props did.
 */
function InstancedProp({
  prop,
  placements,
}: {
  prop: PropKey;
  /** [x, z, rotationY, scale] */
  placements: [number, number, number, number][];
}) {
  const { scene } = useGLTF(MODELS[prop]);
  const group = useRef<THREE.Group>(null);

  // One InstancedMesh per source sub-mesh, each carrying that sub-mesh's own
  // transform within the model, so multi-part props stay assembled.
  const parts = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(scene);
    const lift = -box.min.y; // drop the base onto the ground
    const list: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      list.push({
        geometry: m.geometry,
        material: m.material as THREE.Material,
        local: m.matrixWorld.clone(),
      });
    });
    return { list, lift };
  }, [scene]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const world = new THREE.Matrix4();
    const inst = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    g.children.forEach((child, partIndex) => {
      const mesh = child as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const part = parts.list[partIndex];
      placements.forEach(([x, z, rot, sc], i) => {
        q.setFromEuler(e.set(0, rot, 0));
        world.compose(p.set(x, parts.lift * sc, z), q, s.set(sc, sc, sc));
        inst.multiplyMatrices(world, part.local);
        mesh.setMatrixAt(i, inst);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [parts, placements]);

  return (
    <group ref={group}>
      {parts.list.map((part, i) => (
        <instancedMesh
          key={i}
          args={[part.geometry, part.material, placements.length]}
          receiveShadow
          // Props stay out of the shadow pass — a big cost for very little read.
          castShadow={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** Scatters outdoor props through the village: the hand-placed set in the open
 *  spaces, plus a deterministic pass tucking things against the buildings. */
export function Props() {
  const byModel = useMemo(() => {
    const all: [PropKey, number, number, number, number][] = [
      ...PLACEMENTS.map(
        ([prop, x, z, rot, scale]) =>
          [prop, x, z, rot, scale ?? 1] as [PropKey, number, number, number, number]
      ),
      ...wallProps(),
    ];
    const grouped = new Map<PropKey, [number, number, number, number][]>();
    for (const [prop, x, z, rot, scale] of all) {
      const list = grouped.get(prop) ?? [];
      list.push([x, z, rot, scale]);
      grouped.set(prop, list);
    }
    return [...grouped.entries()];
  }, []);

  return (
    <>
      {byModel.map(([prop, placements]) => (
        <InstancedProp key={prop} prop={prop} placements={placements} />
      ))}
    </>
  );
}
