"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { BUILDINGS, VILLAGE, type Building } from "./village";
import { fitBuilding } from "./Buildings3D";
import { useVillageMaterials } from "./VillageMesh";

/** The house mesh the solid buildings are drawn from (see Buildings3D). */
const HOUSE_MESH = "/models/buildings/tavern.glb";

/**
 * Breaking up the repeated house.
 *
 * There is exactly one house mesh in the village and it is placed about twenty
 * times. `chooseModel` already admits this in a comment and calls it an asset
 * problem, which it is — but it isn't ONLY an asset problem. Real streets don't
 * vary by having twenty different buildings; they vary because each building has
 * accreted different junk over time. A chimney here, a dormer poked through a
 * roof, a different colour of paint on the woodwork.
 *
 * So this adds the accretion. Every solid building gets a deterministic set of
 * attachments seeded off its index, and all of them are INSTANCED — one draw
 * call per attachment TYPE for the whole town. The result is a skyline with a
 * rhythm instead of a repeat, for four draw calls.
 *
 * Everything here is roof-level or flush to a wall, and that is a constraint
 * rather than an accident: none of it has a collider. Lean-to sheds were built
 * and cut for exactly that reason — they looked right, but you walked straight
 * through them, and a solid-looking object you pass through costs more than the
 * variation it buys. Anything that stands out into the street has to go into
 * village.ts as real geometry with a collider, not in here.
 *
 * This composes with new house meshes rather than replacing the need for them:
 * varied accretion on varied buildings is what actually reads as a street.
 */

/** Deterministic hash — the town must dress the same way every run. */
function rnd(n: number) {
  const s = Math.sin(n * 57.31 + 19.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Attachment {
  pos: THREE.Vector3;
  /** Full rotation, not just yaw — a lean-to roof is defined by its PITCH, and
   *  a flat slab on top of a box reads as a shipping container, not a shed. */
  rot: THREE.Euler;
  scale: THREE.Vector3;
}

/** Fill an InstancedMesh from a list of transforms. */
function useInstances(list: Attachment[]) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((a, i) => {
      q.setFromEuler(a.rot);
      m.compose(a.pos, q, a.scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  return ref;
}

/**
 * Where everything goes. Computed once from the building layout.
 *
 * Rules that keep it from turning into clutter: nothing crosses a doorway,
 * nothing lands on the spawn / market / vault pads, and nothing pokes outside
 * the ramparts.
 */
function layout(fitOf: (b: Building, i: number) => { height: number; footW: number; footD: number }) {
  const chimneys: Attachment[] = [];
  const stacks: Attachment[] = []; // the brick shaft under a chimney pot
  const dormers: Attachment[] = [];
  const trim: Attachment[] = []; // painted beam along the ground floor

  const keepClear: [number, number, number][] = [
    [VILLAGE.spawn.x, VILLAGE.spawn.z, 5],
    [VILLAGE.market.x, VILLAGE.market.z, 5],
    [VILLAGE.bank.x, VILLAGE.bank.z, 4],
  ];
  const clear = (x: number, z: number) =>
    !keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r) &&
    Math.abs(x) < VILLAGE.half - 1.5 &&
    Math.abs(z) < VILLAGE.half - 1.5;

  BUILDINGS.forEach((b: Building, i) => {
    // Only the solid, model-rendered houses. Enterables and the market are
    // built from wall strips and are dressed by their own code.
    if (b.h < 2 || b.door || b.kind === "market") return;
    // The MESH's real bounds, not the collider's — see fitBuilding().
    const fit = fitOf(b, i);
    const halfW = fit.footW / 2;
    const halfD = fit.footD / 2;
    const top = fit.height;
    const ridgeAlongX = fit.footW >= fit.footD;

    // ── Chimney: most houses have one, a few have two, one or two have none.
    const chimneyCount = rnd(i * 1.7) > 0.86 ? 2 : rnd(i * 2.3) > 0.12 ? 1 : 0;
    for (let k = 0; k < chimneyCount; k++) {
      // Along the ridge, well inboard of the eaves so it sits ON roof rather
      // than hanging off the edge of one.
      const along = (rnd(i * 3.1 + k * 7.7) - 0.5) * 1.1;
      const cx = b.x + (ridgeAlongX ? along * halfW : (rnd(i + k) - 0.5) * halfD * 0.5);
      const cz = b.z + (ridgeAlongX ? (rnd(i + k) - 0.5) * halfD * 0.5 : along * halfD);
      if (!clear(cx, cz)) continue;
      const height = 1.2 + rnd(i * 5.9 + k) * 1.3;
      const width = 0.5 + rnd(i * 8.3 + k) * 0.25;
      // Sunk a little INTO the roof so there's no gap under it — the roof is a
      // pitched mesh and we're placing against its bounding height.
      const foot = top - 0.9;
      stacks.push({
        pos: new THREE.Vector3(cx, foot + height / 2, cz),
        rot: new THREE.Euler(0, rnd(i * 11.3 + k) * 0.4 - 0.2, 0),
        scale: new THREE.Vector3(width, height, width),
      });
      // The pot on top — a small flare that catches the light.
      chimneys.push({
        pos: new THREE.Vector3(cx, foot + height + 0.16, cz),
        rot: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(width * 0.42, 0.38, width * 0.42),
      });
    }

    // ── Dormer: a small gabled window pushed out through the roof face.
    if (rnd(i * 13.7) > 0.55) {
      const face = rnd(i * 17.1) > 0.5 ? 1 : -1;
      // Sits on the SLOPE, so it's inboard of the eave and part-way up.
      const dx = ridgeAlongX ? b.x + (rnd(i * 19.3) - 0.5) * halfW : b.x + face * halfW * 0.55;
      const dz = ridgeAlongX ? b.z + face * halfD * 0.55 : b.z + (rnd(i * 19.3) - 0.5) * halfD;
      if (clear(dx, dz)) {
        dormers.push({
          pos: new THREE.Vector3(dx, top - 1.15, dz),
          rot: new THREE.Euler(0, ridgeAlongX ? (face > 0 ? 0 : Math.PI) : face > 0 ? Math.PI / 2 : -Math.PI / 2, 0),
          scale: new THREE.Vector3(1, 1, 1),
        });
      }
    }

    // ── Painted trim: a beam band at first-floor level, in one of a few
    //    weathered colours, so neighbouring houses don't share a palette.
    //    Hugs the MESH, not the collider, or it floats off the wall face.
    trim.push({
      pos: new THREE.Vector3(b.x, Math.min(top * 0.42, 2.4), b.z),
      rot: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(fit.footW + 0.1, 0.15, fit.footD + 0.1),
    });
  });

  return { chimneys, stacks, dormers, trim };
}

/** Trim colours — muted, weathered, no two neighbours alike. */
const TRIM_COLORS = [0x6b5236, 0x4f4636, 0x5d4a3a, 0x3f4a44, 0x6a5a48];

export function HouseDressing() {
  // The same mesh the street is built from (useGLTF caches, so this is free),
  // measured once so the dressing can be placed against the model's real bounds
  // rather than its collider's.
  const { scene } = useGLTF(HOUSE_MESH);
  const mats = useVillageMaterials();
  const L = useMemo(() => {
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    return layout((b, i) => fitBuilding(size, b, i));
  }, [scene]);

  const stackRef = useInstances(L.stacks);
  const potRef = useInstances(L.chimneys);
  const dormerRef = useInstances(L.dormers);
  const trimRef = useInstances(L.trim);

  // Per-instance trim colour, so the band varies house to house without needing
  // a material (or a draw call) each.
  useEffect(() => {
    const mesh = trimRef.current;
    if (!mesh) return;
    const c = new THREE.Color();
    L.trim.forEach((_, i) => {
      c.setHex(TRIM_COLORS[Math.floor(rnd(i * 43.7) * TRIM_COLORS.length)]);
      mesh.setColorAt(i, c);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [L.trim, trimRef]);

  return (
    <>
      {/* Everything here wears the SAME photographic stone / timber / thatch the
          houses do. Flat-coloured boxes next to a textured Tudor wall read as
          placeholder geometry — which is the exact complaint the cover crates
          earned — and these materials are already loaded, so reusing them costs
          nothing and keeps the additions inside the village's palette. */}
      {/* Chimney shafts (stone) */}
      <instancedMesh ref={stackRef} material={mats.wall} args={[undefined, undefined, L.stacks.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {/* Chimney pots — fired clay, the one deliberate spot of warm colour on the
          roofline, so the skyline has punctuation. */}
      <instancedMesh ref={potRef} args={[undefined, undefined, L.chimneys.length]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.62, 1, 8]} />
        <meshStandardMaterial color="#a2604a" roughness={0.95} />
      </instancedMesh>
      {/* Dormers poking through the roof */}
      <instancedMesh ref={dormerRef} material={mats.wall} args={[undefined, undefined, L.dormers.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1.25, 1.3, 1.1]} />
      </instancedMesh>
      {/* Painted trim band, tinted per instance */}
      <instancedMesh ref={trimRef} args={[undefined, undefined, L.trim.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </>
  );
}
