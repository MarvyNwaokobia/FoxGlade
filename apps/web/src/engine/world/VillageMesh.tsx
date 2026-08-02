"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture, useGLTF, Text } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, ENTERABLES, VILLAGE, wallSegments, doorOpening, WALL_T, type Building } from "./village";
import { HINTS } from "./hints";
import { THEME } from "./theme";
import { Buildings3D, BuildingModel, chooseModel, tintColor } from "./Buildings3D";
import { runtime } from "@/engine/runtime";
import { softShadowTexture } from "./softShadow";
import { perfOff } from "@/engine/scene/perf";

const HALF = VILLAGE.half;
const WALL_H = 3;

/** The CC0 crate the chest-high cover blocks are built from. */
const CRATE_MODEL = "/models/props/wooden_crate_01/wooden_crate_01_1k.gltf";
useGLTF.preload(CRATE_MODEL);

/** A photographic (CC0 PBR) material shared across a surface type. */
export interface VillageMaterials {
  ground: THREE.MeshStandardMaterial; // cobblestone — the walled town floor
  grass: THREE.MeshStandardMaterial; // natural grass — the landscape outside the walls
  wall: THREE.MeshStandardMaterial; // building walls (small, dense tiling)
  rampart: THREE.MeshStandardMaterial; // perimeter ramparts (same stone, tiled for 72 m)
  roof: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
}

/**
 * Load the CC0 Poly Haven texture sets (diffuse + normal + roughness) once and
 * build the shared materials. Real photographic stone/thatch/cobble/timber —
 * the realism the concept renders were aiming for, all free.
 */
export function useVillageMaterials(): VillageMaterials {
  const tex = useTexture({
    groundMap: "/textures/cobblestone_05_diff.jpg",
    groundNor: "/textures/cobblestone_05_nor_gl.jpg",
    groundRough: "/textures/cobblestone_05_rough.jpg",
    wallMap: "/textures/medieval_wall_01_diff.jpg",
    wallNor: "/textures/medieval_wall_01_nor_gl.jpg",
    wallRough: "/textures/medieval_wall_01_rough.jpg",
    roofMap: "/textures/thatch_roof_angled_diff.jpg",
    roofNor: "/textures/thatch_roof_angled_nor_gl.jpg",
    roofRough: "/textures/thatch_roof_angled_rough.jpg",
    timberMap: "/textures/brown_planks_05_diff.jpg",
    timberNor: "/textures/brown_planks_05_nor_gl.jpg",
    timberRough: "/textures/brown_planks_05_rough.jpg",
    grassMap: "/textures/grass_aerial_diff.jpg",
    grassNor: "/textures/grass_aerial_nor_gl.jpg",
    grassRough: "/textures/grass_aerial_rough.jpg",
  });

  return useMemo(() => {
    const cfg = (t: THREE.Texture, rx: number, ry: number, srgb = false) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    // Cobblestone now floors only the walled town (~80 m), so fewer repeats keep
    // the tile size the same as before.
    const ground = new THREE.MeshStandardMaterial({
      map: cfg(tex.groundMap, 16, 16, true),
      normalMap: cfg(tex.groundNor, 16, 16),
      roughnessMap: cfg(tex.groundRough, 16, 16),
      roughness: 1,
    });
    const grass = new THREE.MeshStandardMaterial({
      map: cfg(tex.grassMap, 42, 42, true),
      normalMap: cfg(tex.grassNor, 42, 42),
      roughnessMap: cfg(tex.grassRough, 42, 42),
      roughness: 1,
    });
    const wall = new THREE.MeshStandardMaterial({
      map: cfg(tex.wallMap, 3, 2, true),
      normalMap: cfg(tex.wallNor, 3, 2),
      roughnessMap: cfg(tex.wallRough, 3, 2),
      roughness: 1,
    });
    const roof = new THREE.MeshStandardMaterial({
      map: cfg(tex.roofMap, 4, 4, true),
      normalMap: cfg(tex.roofNor, 4, 4),
      roughnessMap: cfg(tex.roofRough, 4, 4),
      roughness: 1,
    });
    const timber = new THREE.MeshStandardMaterial({
      map: cfg(tex.timberMap, 1, 2, true),
      normalMap: cfg(tex.timberNor, 1, 2),
      roughnessMap: cfg(tex.timberRough, 1, 2),
      roughness: 1,
    });
    // Perimeter ramparts: same medieval stone, but the texture is cloned and tiled
    // for the long 72 m walls (the building-wall repeat stretched it flat/smooth).
    const rampMap = cfg(tex.wallMap.clone(), 24, 2, true);
    const rampNor = cfg(tex.wallNor.clone(), 24, 2);
    const rampRough = cfg(tex.wallRough.clone(), 24, 2);
    rampMap.needsUpdate = rampNor.needsUpdate = rampRough.needsUpdate = true;
    const rampart = new THREE.MeshStandardMaterial({
      map: rampMap,
      normalMap: rampNor,
      roughnessMap: rampRough,
      roughness: 1,
    });

    return { ground, grass, wall, rampart, roof, timber };
  }, [tex]);
}

/**
 * A gabled roof over a building footprint: a triangular prism whose ridge runs
 * along the building's longer axis, with a small overhang. Reads as a house
 * rather than a capped box.
 */
function GableRoof({ b, mat }: { b: Building; mat: THREE.Material }) {
  const overhang = 0.5;
  const pitch = Math.min(2.2, 0.5 + Math.max(b.w, b.d) * 0.14);
  const ridgeAlongX = b.w >= b.d;
  const spanBase = (ridgeAlongX ? b.d : b.w) + overhang; // triangle base
  const ridgeLen = (ridgeAlongX ? b.w : b.d) + overhang; // extrude length

  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-spanBase / 2, 0);
    shape.lineTo(spanBase / 2, 0);
    shape.lineTo(0, pitch);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: ridgeLen, bevelEnabled: false });
    g.translate(0, 0, -ridgeLen / 2); // centre the extrusion
    g.rotateY(ridgeAlongX ? Math.PI / 2 : 0); // ridge along the long axis
    return g;
  }, [spanBase, ridgeLen, pitch, ridgeAlongX]);

  return <mesh geometry={geo} material={mat} position={[b.x, b.h, b.z]} castShadow receiveShadow />;
}

function Wall({ position, size, mat }: { position: [number, number, number]; size: [number, number, number]; mat: THREE.Material }) {
  return (
    <mesh position={position} material={mat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/**
 * A building block. Solid ones render as a stone box with a gabled roof;
 * enterable ones render their wall strips — the same boxes the collision and
 * LOS systems use — plus the roof, so you can walk in through the gap.
 */
/**
 * A block of chest-high cover, as a stack of real crates.
 *
 * These were a single `boxGeometry` wearing the plank texture at its building
 * repeat — one 2 m board stretched across the whole face, which under a bright
 * sky rendered as a flat near-white slab. Walking up to one filled a third of
 * the screen with what looked like untextured placeholder geometry. Same
 * footprint, same collision, but built from the CC0 crate model at its own
 * scale, so the planks read as planks and the stack reads as cargo.
 */
function CoverStack({ b }: { b: Building }) {
  const { scene } = useGLTF(CRATE_MODEL);
  const crates = useMemo(() => {
    const src = new THREE.Box3().setFromObject(scene);
    const size = src.getSize(new THREE.Vector3());
    const centre = src.getCenter(new THREE.Vector3());
    // Two crates side by side, one on top, jostled — cargo nobody stacked neatly.
    const layout: [number, number, number, number][] = [
      [-b.w * 0.22, 0, -b.d * 0.18, 0.18],
      [b.w * 0.24, 0, b.d * 0.2, -0.32],
      [b.w * 0.02, b.h * 0.5, -b.d * 0.02, 0.62],
    ];
    // Each crate is half the block's height so a stack of two fills it.
    const s = (b.h * 0.52) / Math.max(size.y, 0.001);
    return layout.map(([dx, dy, dz, ry]) => {
      const o = scene.clone(true);
      o.position.set(-centre.x, -src.min.y, -centre.z);
      o.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return { obj: o, dx, dy, dz, ry, s };
    });
  }, [scene, b.w, b.d, b.h]);

  return (
    <group position={[b.x, 0, b.z]}>
      {crates.map((c, i) => (
        <group key={i} position={[c.dx, c.dy, c.dz]} rotation={[0, c.ry, 0]} scale={c.s}>
          <primitive object={c.obj} />
        </group>
      ))}
    </group>
  );
}

function BuildingBlock({ b, mats }: { b: Building; mats: VillageMaterials }) {
  const isCrate = b.h < 2;
  if (isCrate) return <CoverStack b={b} />;
  if (b.door) {
    const op = doorOpening(b)!;
    const doorYaw = Math.atan2(op.nx, op.nz); // group's local +Z points out the door
    return (
      <group>
        {wallSegments(b).map((s, j) => (
          <mesh
            key={j}
            material={mats.wall}
            position={[(s.minX + s.maxX) / 2, b.h / 2, (s.minZ + s.maxZ) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s.maxX - s.minX, b.h, s.maxZ - s.minZ]} />
          </mesh>
        ))}
        <GableRoof b={b} mat={mats.roof} />
        {/* Doorway markers: timber frame posts, glowing threshold, light spilling
            out — so the opening reads from down the street, not just up close. */}
        <group position={[op.cx, 0, op.cz]} rotation={[0, doorYaw, 0]}>
          <mesh material={mats.timber} position={[-(op.width / 2 + 0.12), b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
          </mesh>
          <mesh material={mats.timber} position={[op.width / 2 + 0.12, b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <planeGeometry args={[op.width + 0.5, 2.6]} />
            <meshStandardMaterial
              color={THEME.lantern}
              emissive={THEME.lantern}
              emissiveIntensity={0.4}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        </group>
        {/* A hung lantern beside the door, so lit windows read at dusk */}
        <mesh position={[op.cx + op.nx * 0.3 - op.nz * (op.width / 2 + 0.4), 2.1, op.cz + op.nz * 0.3 + op.nx * (op.width / 2 + 0.4)]}>
          <boxGeometry args={[0.18, 0.26, 0.18]} />
          <meshStandardMaterial color={THEME.lantern} emissive={THEME.lantern} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh material={isCrate ? mats.timber : mats.wall} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
      </mesh>
      {!isCrate && <GableRoof b={b} mat={mats.roof} />}
    </group>
  );
}

/**
 * An enterable house (§14.2), realistic exterior + swap-on-enter (Marvy's call):
 * outside you see a realistic CC-BY building model; when you cross the doorway
 * (shelterIndex === this house) the exterior hides and the furnished stone
 * interior shows, keeping the seamless walk-in + world-pause. Collision comes
 * from the wall strips in COLLIDERS, so entry works regardless of the model.
 */
function EnterableHouse({ b, eIndex, mats }: { b: Building; eIndex: number; mats: VillageMaterials }) {
  const op = doorOpening(b)!;
  const doorYaw = Math.atan2(op.nx, op.nz);
  const interior = useRef<THREE.Group>(null);
  useFrame(() => {
    if (interior.current) interior.current.visible = runtime.shelterIndex === eIndex;
  });

  // The bank house uses the grand stone hall; others pick by size.
  const bank =
    VILLAGE.bank.x >= b.x - b.w / 2 &&
    VILLAGE.bank.x <= b.x + b.w / 2 &&
    VILLAGE.bank.z >= b.z - b.d / 2 &&
    VILLAGE.bank.z <= b.z + b.d / 2;
  const model = bank ? "hall" : chooseModel(b, eIndex);

  // The doorway timber is tinted to MATCH this building's weathering (the same tint
  // the model is rendered with), so the door belongs to the building rather than
  // clashing with it.
  const doorMat = useMemo(() => {
    const m = (mats.timber as THREE.MeshStandardMaterial).clone();
    m.color.multiply(tintColor(eIndex + 3));
    return m;
  }, [mats.timber, eIndex]);

  return (
    <group>
      {/* Realistic exterior (hidden while you're inside) */}
      <BuildingModel b={b} model={model} seed={eIndex + 3} hideForShelterIndex={eIndex} />

      {/* Furnished stone interior walls + roof (shown only while inside) */}
      <group ref={interior} visible={false}>
        {wallSegments(b).map((s, j) => (
          <mesh
            key={j}
            material={mats.wall}
            position={[(s.minX + s.maxX) / 2, b.h / 2, (s.minZ + s.maxZ) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s.maxX - s.minX, b.h, s.maxZ - s.minZ]} />
          </mesh>
        ))}
        <GableRoof b={b} mat={mats.roof} />
      </group>

      {/* Enterable doorway (real, not a glowing box): a timber frame + an ajar
          plank door + warm light spilling out, plus a hung lantern so the entrance
          is still findable from across the map. */}
      <group position={[op.cx, 0, op.cz]} rotation={[0, doorYaw, 0]}>
        {/* Timber frame — posts + lintel (real wood) */}
        {[-1, 1].map((s) => (
          <mesh key={s} material={doorMat} position={[s * (op.width / 2 + 0.14), 1.35, -0.05]} castShadow receiveShadow>
            <boxGeometry args={[0.22, 2.8, 0.32]} />
          </mesh>
        ))}
        <mesh material={doorMat} position={[0, 2.78, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[op.width + 0.5, 0.26, 0.32]} />
        </mesh>
        {/* A plank door standing ajar in the opening */}
        <mesh material={doorMat} position={[op.width * 0.18, 1.25, -0.18]} rotation={[0, 0.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[op.width * 0.82, 2.45, 0.09]} />
        </mesh>
        {/* Warm light spilling from the doorway onto the threshold */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, -0.45]} renderOrder={1}>
          <planeGeometry args={[op.width + 0.2, 1.7]} />
          <meshBasicMaterial color="#ffcf8a" transparent opacity={0.3} depthWrite={false} />
        </mesh>
        {/* Hung lantern beside the door — a warm glow that reads real AND findable */}
        <group position={[op.width / 2 + 0.34, 2.1, -0.02]}>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[0.05, 0.22, 0.05]} />
            <meshStandardMaterial color="#2e2519" roughness={1} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.17, 0.24, 0.17]} />
            <meshStandardMaterial color={THEME.lantern} emissive={THEME.lantern} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * A real 3D wooden STOREFRONT sign — a carved board with raised text, fixed to the
 * building/plaza and facing a set direction. Unlike the old Html billboard it does
 * NOT reorient to the camera, so it stays put on the building instead of floating
 * around the scene. `post` adds a freestanding signpost (for the open market).
 */
function Signboard({
  position,
  rotation = 0,
  text,
  accent,
  post = false,
}: {
  position: [number, number, number];
  rotation?: number;
  text: string;
  accent: string;
  post?: boolean;
}) {
  const w = text.length * 0.36 + 0.6;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {post && (
        <mesh position={[0, -position[1] / 2 + 0.05, -0.04]} castShadow>
          <boxGeometry args={[0.16, position[1], 0.16]} />
          <meshStandardMaterial color="#4a3826" roughness={1} />
        </mesh>
      )}
      {/* Carved board */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, 0.72, 0.08]} />
        <meshStandardMaterial color="#5a3d22" roughness={0.9} />
      </mesh>
      {/* Colour accent strip (bank gold / market blue) */}
      <mesh position={[0, -0.32, 0.045]}>
        <boxGeometry args={[w, 0.07, 0.02]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} toneMapped={false} />
      </mesh>
      <Text position={[0, 0.02, 0.055]} fontSize={0.42} letterSpacing={0.06} color="#ffe6bf" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#241608">
        {text}
      </Text>
    </group>
  );
}

const HINT_DEFAULT = "#8fd0e0"; // pale cyan — an unresolved "ping"
const HINT_REAL = "#f2c14e"; // gold — revealed real
const HINT_FAKE = "#7a4a4a"; // dim — revealed decoy

/**
 * One hint beacon: a candidate spot, indistinguishable from every other.
 *
 * Two things changed here. The pings no longer recolour to reveal the real one —
 * that was the old "sniff", and the fox physically running to the treasure
 * replaced it (Phase 3). And the marker is now a WAIST-HIGH glow rather than a
 * 24-metre pillar through the skybox: with the board reseeding each chapter, a
 * beacon visible from anywhere in the village meant you could see every
 * candidate from the spawn gate and simply walk to one. There was nothing to
 * find. Now you have to get close enough to spot it, or follow the fox.
 */
function HintBeacon({ index }: { index: number }) {
  const hint = HINTS[index];
  const grp = useRef<THREE.Group>(null);
  const pad = useRef<THREE.MeshStandardMaterial>(null);
  const pillar = useRef<THREE.MeshStandardMaterial>(null);
  const gem = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    // A decoy vanishes once its distractor is silenced; a real treasure vanishes
    // once a thief steals it OR the player has claimed (picked up) it.
    if (grp.current) {
      grp.current.position.set(hint.pos.x, 0, hint.pos.z); // the board reseeds
      grp.current.visible =
        !(!hint.real && runtime.hintSilenced[index]) &&
        !(hint.real && (runtime.hintStolen[index] || runtime.hintClaimed[index]));
    }
    // Every candidate looks the same, always — the fox is the only tell.
    if (pad.current) {
      pad.current.color.set(HINT_DEFAULT);
      pad.current.emissive.set(HINT_DEFAULT);
    }
    if (pillar.current) {
      pillar.current.color.set(HINT_DEFAULT);
      pillar.current.emissive.set(HINT_DEFAULT);
    }
    if (gem.current) {
      const atThisReal = runtime.nearHintIsReal && runtime.nearHintIndex === index;
      gem.current.visible = hint.real && !runtime.hintClaimed[index] && atThisReal;
      gem.current.rotation.y += dt * 1.2;
      gem.current.position.y = 1.6 + Math.sin(performance.now() / 600) * 0.15;
    }
  });

  return (
    <group ref={grp}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3, 40]} />
        <meshStandardMaterial ref={pad} color={HINT_DEFAULT} emissive={HINT_DEFAULT} emissiveIntensity={0.6} transparent opacity={0.5} />
      </mesh>
      {/* Waist-high, not a searchlight — it should read from down the street, not
          from the far wall of the village. */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 2.2, 10]} />
        <meshStandardMaterial ref={pillar} color={HINT_DEFAULT} emissive={HINT_DEFAULT} emissiveIntensity={0.9} transparent opacity={0.45} />
      </mesh>
      {hint.real && (
        <group ref={gem} position={[0, 1.6, 0]}>
          <mesh castShadow>
            <octahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#ffd873" emissive="#f2b01e" emissiveIntensity={0.7} metalness={0.4} roughness={0.25} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Hints() {
  return (
    <>
      {HINTS.map((_, i) => (
        <HintBeacon key={i} index={i} />
      ))}
    </>
  );
}

/**
 * Battlement merlons (the tooth-like blocks) along all four rampart tops, as ONE
 * instanced mesh.
 *
 * These were ~92 individual meshes — a fifth of the scene's entire draw-call
 * budget spent on identical decorative blocks that never move. Profiling put the
 * baseline at 454 calls, and this was the single biggest avoidable chunk.
 */
function Battlements({ mat }: { mat: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const H = VILLAGE.half;
    const out: [number, number][] = [];
    for (let p = -H + 1.5; p <= H - 1.5; p += 3) {
      out.push([p, -H], [p, H], [-H, p], [H, p]);
    }
    return out;
  }, []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, WALL_H + 0.35, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, spots.length]}
      material={mat}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 0.7, 1]} />
    </instancedMesh>
  );
}

/**
 * The walled perimeter as proper castle ramparts: four tiled-stone walls, a run of
 * battlement merlons along the tops, and a fortified tower at each corner. Purely
 * visual — collision/LOS still come from the perimeter boxes in village.ts.
 */
function Ramparts({ mats }: { mats: VillageMaterials }) {
  const H = VILLAGE.half;
  const T = 0.9;
  const corners: [number, number][] = [
    [-H, -H],
    [H, -H],
    [-H, H],
    [H, H],
  ];
  return (
    <>
      <Wall position={[0, WALL_H / 2, -H]} size={[H * 2, WALL_H, T]} mat={mats.rampart} />
      <Wall position={[0, WALL_H / 2, H]} size={[H * 2, WALL_H, T]} mat={mats.rampart} />
      <Wall position={[-H, WALL_H / 2, 0]} size={[T, WALL_H, H * 2]} mat={mats.rampart} />
      <Wall position={[H, WALL_H / 2, 0]} size={[T, WALL_H, H * 2]} mat={mats.rampart} />
      <Battlements mat={mats.rampart} />
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={mats.rampart} position={[0, 2.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.2, 5.2, 3.2]} />
          </mesh>
          <mesh position={[0, 6.15, 0]} castShadow>
            <coneGeometry args={[2.7, 2, 6]} />
            <meshStandardMaterial color="#463d33" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * A soft contact-shadow / ambient-occlusion pool under each building — grounds it
 * and, crucially, shows its FOOTPRINT (where the collision actually is), so you can
 * tell where a building stops instead of walking into an invisible wall. Sun-angle
 * independent, unlike the cast shadow.
 */
function BuildingShadows() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => BUILDINGS.filter((b) => b.h >= 2), []);

  // One instanced quad per building instead of ~20 separate transparent meshes.
  // Transparent draws are the expensive kind (no early-Z, strict sort order), so
  // collapsing them was worth more than the raw call count suggests.
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    list.forEach((b, i) => {
      // Unit plane scaled per building — one shared geometry for all of them.
      m.compose(p.set(b.x, 0.035, b.z), q, s.set(b.w + 0.7, b.d + 0.7, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={softShadowTexture()} transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

/** A small market stall (base + coloured awning) to make the plaza read as a place. */
function Stall({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.6, 1, 1.2]} />
        <meshStandardMaterial color="#6b5a44" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[2, 0.15, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * The MARKETPLACE stall — a proper merchant stand you walk up to (front faces
 * south / +Z, the way you approach from spawn). A counter with goods, a striped
 * canopy, a back shelf, and the MARKET sign mounted on the front so the whole
 * thing reads at a glance as "this is the market" (the bank is a building, so the
 * market needed a landmark of its own). Purely visual — the shop opens on E.
 */
function MarketStand({ position }: { position: [number, number, number] }) {
  const wood = "#6b4f32";
  const woodDark = "#4a3826";
  const posts: [number, number][] = [
    [-1.65, -0.7],
    [1.65, -0.7],
    [-1.65, 0.75],
    [1.65, 0.75],
  ];
  const goods: [number, string][] = [
    [-1.2, "#7a9a3b"],
    [-0.4, "#b8632f"],
    [0.4, "#8a5a3a"],
    [1.2, "#9a7b4a"],
  ];
  return (
    <group position={position}>
      {/* Counter + overhanging top */}
      <mesh position={[0, 0.45, 0.7]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.9, 0.8]} />
        <meshStandardMaterial color={wood} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.93, 0.72]} castShadow>
        <boxGeometry args={[3.7, 0.1, 1.05]} />
        <meshStandardMaterial color={woodDark} roughness={0.85} />
      </mesh>
      {/* Corner posts */}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.2, z]} castShadow>
          <boxGeometry args={[0.12, 2.4, 0.12]} />
          <meshStandardMaterial color={woodDark} roughness={0.9} />
        </mesh>
      ))}
      {/* Back shelf wall */}
      <mesh position={[0, 1.0, -0.72]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.9, 0.14]} />
        <meshStandardMaterial color={wood} roughness={0.9} />
      </mesh>
      {/* Striped canvas canopy, sloped toward the front */}
      <group position={[0, 2.5, 0.02]} rotation={[-0.32, 0, 0]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[-1.5 + i * 0.6, 0, 0]} castShadow>
            <boxGeometry args={[0.6, 0.08, 2.0]} />
            <meshStandardMaterial color={i % 2 ? "#b8432f" : "#e8dcc6"} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Goods laid out on the counter */}
      {goods.map(([x, c], i) => (
        <mesh key={i} position={[x, 1.06, 0.7]} castShadow>
          <boxGeometry args={[0.5, 0.3, 0.5]} />
          <meshStandardMaterial color={c} roughness={0.85} />
        </mesh>
      ))}
      {/* MARKET sign on the front, facing the approach */}
      <Signboard position={[0, 2.06, 0.98]} rotation={0} text="MARKET" accent="#4e93f2" />
    </group>
  );
}

/**
 * The open-air MARKETPLACE — a big walled square (from the building's wall
 * segments, so the walls are the same impenetrable colliders movement uses),
 * open to the sky, with a wide gate, stalls + goods inside, and the MARKET sign
 * over the gate. Stepping through the gate puts you inside → sheltered → a
 * no-combat safe zone (you can't shoot, the world holds).
 */
function MarketBuilding({ b, mats }: { b: Building; mats: VillageMaterials }) {
  const segs = useMemo(() => wallSegments(b), [b]);
  const door = doorOpening(b);
  const cx = b.x;
  const cz = b.z;
  const gateW = b.door?.width ?? 4;
  const alongX = !door || door.nx === 0; // gap runs along X (N/S gate) vs Z (E/W)
  const post = (x: number, z: number, key: number) => (
    <mesh key={key} position={[x, b.h / 2, z]} castShadow>
      <boxGeometry args={[0.4, b.h + 0.5, 0.4]} />
      <meshStandardMaterial color="#4a3826" roughness={0.95} />
    </mesh>
  );
  return (
    <group>
      {/* Impenetrable stone walls (no roof — open to the sky) */}
      {segs.map((s, i) => (
        <mesh
          key={i}
          material={mats.wall}
          position={[(s.minX + s.maxX) / 2, b.h / 2, (s.minZ + s.maxZ) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[s.maxX - s.minX, b.h, s.maxZ - s.minZ]} />
        </mesh>
      ))}
      {/* Timber coping capping the wall tops (a tidy finished edge) */}
      {segs.map((s, i) => (
        <mesh key={`c${i}`} position={[(s.minX + s.maxX) / 2, b.h + 0.06, (s.minZ + s.maxZ) / 2]} castShadow>
          <boxGeometry args={[s.maxX - s.minX + 0.15, 0.12, s.maxZ - s.minZ + 0.15]} />
          <meshStandardMaterial color="#5a4632" roughness={0.9} />
        </mesh>
      ))}

      {/* Gate: two posts flanking the opening + a lintel beam + the MARKET sign */}
      {door && (
        <group>
          {alongX ? (
            <>
              {post(cx - gateW / 2, door.cz, 0)}
              {post(cx + gateW / 2, door.cz, 1)}
              <mesh position={[cx, b.h + 0.1, door.cz]} castShadow>
                <boxGeometry args={[gateW + 0.6, 0.35, 0.5]} />
                <meshStandardMaterial color="#4a3826" roughness={0.92} />
              </mesh>
            </>
          ) : (
            <>
              {post(door.cx, cz - gateW / 2, 0)}
              {post(door.cx, cz + gateW / 2, 1)}
              <mesh position={[door.cx, b.h + 0.1, cz]} castShadow>
                <boxGeometry args={[0.5, 0.35, gateW + 0.6]} />
                <meshStandardMaterial color="#4a3826" roughness={0.92} />
              </mesh>
            </>
          )}
          <Signboard
            position={[door.cx + door.nx * 0.35, b.h + 0.55, door.cz + door.nz * 0.35]}
            rotation={Math.atan2(door.nx, door.nz)}
            text="MARKET"
            accent="#4e93f2"
          />
        </group>
      )}

      {/* Stalls + goods inside — a little bazaar. The main stand sits near the back
          wall, on the shop trigger (VILLAGE.market), facing the gate. */}
      <MarketStand position={[cx, 0, b.z - b.d / 2 + WALL_T + 1.7]} />
      <Stall position={[cx - 4.6, 0, cz + 1.5]} color="#c0553b" />
      <Stall position={[cx + 4.6, 0, cz + 0.5]} color="#c0a13b" />
      <Stall position={[cx - 4.4, 0, cz - 2.2]} color="#3b7cc0" />
    </group>
  );
}

/**
 * Renders the walled village from the layout data: ground, perimeter walls,
 * buildings, zone beacons + labels, market stalls, and the treasure gem. The sky
 * + lighting come from a CC0 dusk HDRI (in VillageScene); surfaces wear real
 * CC0 PBR textures (stone / thatch / cobble / timber).
 */
export function Village() {
  const mats = useVillageMaterials();
  return (
    <>
      {/* Natural grass landscape stretching to the horizon (the town sits IN a
          world now, instead of cobblestone paved to infinity). */}
      <mesh material={mats.grass} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[290, 290]} />
      </mesh>
      {/* Cobblestone floor of the walled town only (a touch past the ramparts) */}
      <mesh material={mats.ground} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
      </mesh>
      {/* Soft contact shadows under buildings — grounds them + shows their footprint */}
      <BuildingShadows />

      {/* Perimeter castle ramparts (tiled stone + battlements + corner towers) */}
      <Ramparts mats={mats} />

      {/* Solid buildings → realistic CC-BY models */}
      {!perfOff("noBuildings") && (
        <Buildings3D
          buildings={BUILDINGS.map((b, i) => ({ b, i })).filter(({ b }) => !b.door && b.h >= 2)}
        />
      )}
      {/* Enterable buildings: the open-air MARKET enclosure renders specially; the
          rest are houses with a swap-on-enter interior. */}
      {ENTERABLES.map((b, e) =>
        b.kind === "market" ? (
          <MarketBuilding key={`e${e}`} b={b} mats={mats} />
        ) : (
          <EnterableHouse key={`e${e}`} b={b} eIndex={e} mats={mats} />
        )
      )}
      {/* Crates → small timber boxes */}
      {BUILDINGS.map((b, i) => (!b.door && b.h < 2 ? <BuildingBlock key={`c${i}`} b={b} mats={mats} /> : null))}

      {/* Bank — the enterable house on the plaza. The real vault chest + shelves
          are furnished in <Interiors>; here we keep the glowing deposit pad and
          the label. Walk in (world pauses), stand on the pad, E deposits loot. */}
      <Signboard position={[-26, 3.3, 0.9]} rotation={0} text="BANK" accent="#ffd873" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VILLAGE.bank.x, 0.04, VILLAGE.bank.z]}>
        <ringGeometry args={[1.1, 1.5, 32]} />
        <meshStandardMaterial color="#ffd873" emissive="#ffd873" emissiveIntensity={0.5} transparent opacity={0.6} />
      </mesh>

      {/* Treasure hints — several candidate pings, only one real (no label: the
          whole point is you don't know which). The fox's sniff reveals it. */}
      <Hints />

      {/* Spawn pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VILLAGE.spawn.x, 0.02, VILLAGE.spawn.z]}>
        <ringGeometry args={[2.2, 2.6, 40]} />
        <meshStandardMaterial color="#7a8794" emissive="#7a8794" emissiveIntensity={0.3} transparent opacity={0.7} />
      </mesh>
    </>
  );
}
