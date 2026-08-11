"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { skyAt } from "@/engine/config/day";
import { runtime } from "@/engine/runtime";
import { VILLAGE } from "./village";

/**
 * What you can see past the walls.
 *
 * Standing on the ramparts, the world used to end in a flat beige band: the
 * grass plane running to a hard edge against the sky, with nothing on it. A
 * treasure-hunt game needs the opposite — there should always be something out
 * there you can see and can't reach, because that's what makes the walls feel
 * like walls instead of the edge of the level.
 *
 * All of it is procedural and instanced: a ring of low hills, two bands of
 * conifer impostors, and one distant tower to the north to give the horizon a
 * reading you can orient by. Four draw calls for the whole skyline.
 */

const H = VILLAGE.half;

/** Deterministic hash so the horizon is the same every run. */
function rnd(n: number) {
  const s = Math.sin(n * 91.3 + 47.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Rolling hills, well outside the walls and below the eye line from the street. */
function Hills({ color }: { color: THREE.Color }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number, number, number][] = []; // x, z, radius, height
    const rings = [
      { r: 88, n: 22, h: 9, spread: 16 },
      { r: 132, n: 26, h: 15, spread: 24 },
    ];
    let i = 0;
    for (const ring of rings) {
      for (let k = 0; k < ring.n; k++) {
        const a = (k / ring.n) * Math.PI * 2 + rnd(i++) * 0.16;
        const dist = ring.r + (rnd(i++) - 0.5) * ring.spread;
        out.push([
          Math.sin(a) * dist,
          Math.cos(a) * dist,
          16 + rnd(i++) * 16,
          ring.h * (0.6 + rnd(i++) * 0.8),
        ]);
      }
    }
    return out;
  }, []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    spots.forEach(([x, z, r, h], i) => {
      // Sunk well below ground so only the crown shows — a hill, not a dome.
      m.compose(p.set(x, -r * 0.55, z), q, s.set(r, h, r));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color={color} roughness={1} flatShading fog={false} />
    </instancedMesh>
  );
}

/**
 * A treeline, as cones. Impostor cards would be cheaper still, but they need a
 * texture and they twist when you walk the perimeter; a squat cone reads as a
 * conifer from 60 m and never breaks.
 */
function Treeline({ color }: { color: THREE.Color }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number, number][] = []; // x, z, scale
    let i = 1000;
    for (let k = 0; k < 150; k++) {
      const a = (k / 150) * Math.PI * 2 + rnd(i++) * 0.3;
      // Two loose belts just outside the walls, with gaps so it isn't a fence.
      const dist = (rnd(i++) > 0.45 ? 52 : 70) + (rnd(i++) - 0.5) * 18;
      const x = Math.sin(a) * dist;
      const z = Math.cos(a) * dist;
      if (Math.abs(x) < H + 6 && Math.abs(z) < H + 6) continue; // never inside the town
      out.push([x, z, 0.75 + rnd(i++) * 0.7]);
    }
    return out;
  }, []);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    spots.forEach(([x, z, sc], i) => {
      if (crowns.current) {
        m.compose(p.set(x, 4.2 * sc, z), q, s.set(2.1 * sc, 6.4 * sc, 2.1 * sc));
        crowns.current.setMatrixAt(i, m);
      }
      if (trunks.current) {
        m.compose(p.set(x, 0.75 * sc, z), q, s.set(0.28 * sc, 1.5 * sc, 0.28 * sc));
        trunks.current.setMatrixAt(i, m);
      }
    });
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true;
      crowns.current.computeBoundingSphere();
    }
    if (trunks.current) {
      trunks.current.instanceMatrix.needsUpdate = true;
      trunks.current.computeBoundingSphere();
    }
  }, [spots]);

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1.25, 1, 5]} />
        <meshStandardMaterial color="#3b2d21" roughness={1} fog={false} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial color={color} roughness={1} flatShading fog={false} />
      </instancedMesh>
    </>
  );
}

/**
 * One thing on the skyline worth looking at: a ruined watchtower on a rise to
 * the north. It is unreachable on purpose — it exists to be the fixed point you
 * navigate by, and the promise that the village is part of somewhere larger.
 */
function Watchtower({ color }: { color: THREE.Color }) {
  return (
    <group position={[-22, 0, -138]}>
      {/* The rise it stands on. Small and sunk deep: a broad pale dome at this
          distance reads as a bug in the sky, not as ground. */}
      <mesh position={[0, -13, 0]}>
        <sphereGeometry args={[17, 14, 9]} />
        <meshStandardMaterial color={color} roughness={1} flatShading fog={false} />
      </mesh>
      {/* Slim and tall — the silhouette is the whole point of it. */}
      <mesh position={[0, 17, 0]} castShadow={false}>
        <cylinderGeometry args={[2.6, 3.8, 34, 9]} />
        <meshStandardMaterial color="#4a463d" roughness={1} flatShading fog={false} />
      </mesh>
      {/* Broken crown — a ruin reads far better at distance than a neat cap. */}
      <mesh position={[1.6, 34.5, -0.6]} rotation={[0.12, 0.4, 0.16]}>
        <cylinderGeometry args={[2.5, 2.8, 6, 9, 1, true]} />
        <meshStandardMaterial color="#4a463d" roughness={1} side={THREE.DoubleSide} flatShading fog={false} />
      </mesh>
    </group>
  );
}

export function Horizon() {
  // The whole skyline is lit by the day cycle like everything else, but it also
  // needs to drift toward the fog colour as the light goes — distant geometry
  // that stays crisp while the town falls into dusk reads as a painted backdrop.
  const hill = useRef(new THREE.Color("#6f7a58"));
  const tree = useRef(new THREE.Color("#3f5138"));
  const hillBase = useMemo(() => new THREE.Color("#6f7a58"), []);
  const treeBase = useMemo(() => new THREE.Color("#3f5138"), []);
  const fog = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const s = skyAt(runtime.dayProgress);
    fog.set(s.fog);
    // Aerial perspective, done here rather than by the scene fog.
    //
    // The skyline sits at 90–140 m and the fog's far plane is 165 m at dawn and
    // only 78 m at night — so scene fog rendered the whole horizon as a flat
    // wash of pure fog colour, and the tower came out as a beige slab floating
    // over the rooftops. These materials opt out of fog (`fog={false}`) and tint
    // themselves instead, which keeps the silhouette readable at every hour
    // while still sinking it into the haze as the light goes.
    const haze = 0.3 + s.nightMix * 0.3;
    hill.current.copy(hillBase).lerp(fog, haze);
    tree.current.copy(treeBase).lerp(fog, haze * 0.8);
  });

  return (
    <group>
      <Hills color={hill.current} />
      {/* Treeline is OFF for now: flat-shaded solid-green cones read fine at the
          distance this was designed for, but the treeline's inner ring sits close
          enough to the walls that it lands right behind the realistic buildings in
          frame — a cartoon shape beside a photoreal one, which is the exact clash
          Marvy has rejected environment passes over before. Poly Haven's real tree
          scans are 60–400MB (too heavy for web) — this stays off until a
          lighter-weight real tree asset exists (see [[foxglade-art-assets]]). */}
      <Watchtower color={hill.current} />
    </group>
  );
}
