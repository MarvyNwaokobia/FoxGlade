"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture, Text } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, ENTERABLES, VILLAGE, wallSegments, doorOpening, WALL_T, type Building } from "./village";
import { HINTS } from "./hints";
import { THEME } from "./theme";
import { Buildings3D, BuildingModel, chooseModel, tintColor } from "./Buildings3D";
import { runtime } from "@/engine/runtime";
import { softShadowTexture } from "./softShadow";

const HALF = VILLAGE.half;
const WALL_H = 3;

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
function BuildingBlock({ b, mats }: { b: Building; mats: VillageMaterials }) {
  const isCrate = b.h < 2;
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
 * One hint beacon. All hints look identical (cyan pings) until the fox's sniff
 * reveals them — then the real one glows gold and decoys dim. The treasure gem
 * lives only under the real hint and appears when you reach it or it's revealed.
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
      grp.current.visible =
        !(!hint.real && runtime.hintSilenced[index]) &&
        !(hint.real && (runtime.hintStolen[index] || runtime.hintClaimed[index]));
    }
    const revealed = performance.now() < runtime.revealRealUntil;
    const c = revealed ? (hint.real ? HINT_REAL : HINT_FAKE) : HINT_DEFAULT;
    if (pad.current) {
      pad.current.color.set(c);
      pad.current.emissive.set(c);
    }
    if (pillar.current) {
      pillar.current.color.set(c);
      pillar.current.emissive.set(c);
    }
    if (gem.current) {
      const atThisReal = runtime.nearHintIsReal && runtime.nearHintIndex === index;
      gem.current.visible = hint.real && !runtime.hintClaimed[index] && (atThisReal || revealed);
      gem.current.rotation.y += dt * 1.2;
      gem.current.position.y = 1.6 + Math.sin(performance.now() / 600) * 0.15;
    }
  });

  return (
    <group ref={grp} position={[hint.pos.x, 0, hint.pos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3, 40]} />
        <meshStandardMaterial ref={pad} color={HINT_DEFAULT} emissive={HINT_DEFAULT} emissiveIntensity={0.6} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 24, 12]} />
        <meshStandardMaterial ref={pillar} color={HINT_DEFAULT} emissive={HINT_DEFAULT} emissiveIntensity={0.9} transparent opacity={0.4} />
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

/** Battlement merlons (the tooth-like blocks) along all four rampart tops. */
function battlements(mat: THREE.Material): React.ReactElement[] {
  const H = VILLAGE.half;
  const step = 3;
  const out: React.ReactElement[] = [];
  let k = 0;
  for (let p = -H + 1.5; p <= H - 1.5; p += step) {
    const spots: [number, number][] = [
      [p, -H],
      [p, H],
      [-H, p],
      [H, p],
    ];
    for (const [x, z] of spots) {
      out.push(
        <mesh key={k++} material={mat} position={[x, WALL_H + 0.35, z]} castShadow receiveShadow>
          <boxGeometry args={[1, 0.7, 1]} />
        </mesh>
      );
    }
  }
  return out;
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
      {battlements(mats.rampart)}
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
  return (
    <>
      {BUILDINGS.filter((b) => b.h >= 2).map((b, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.035, b.z]} renderOrder={1}>
          <planeGeometry args={[b.w + 0.7, b.d + 0.7]} />
          <meshBasicMaterial map={softShadowTexture()} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </>
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
 * Renders the walled village from the layout data: ground, perimeter walls,
 * buildings, zone beacons + labels, market stalls, and the treasure gem. The sky
 * + lighting come from a CC0 dusk HDRI (in VillageScene); surfaces wear real
 * CC0 PBR textures (stone / thatch / cobble / timber).
 */
export function Village() {
  const m = VILLAGE.market;
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
      <Buildings3D
        buildings={BUILDINGS.map((b, i) => ({ b, i })).filter(({ b }) => !b.door && b.h >= 2)}
      />
      {/* Enterable houses → realistic exterior with swap-on-enter interior */}
      {ENTERABLES.map((b, e) => (
        <EnterableHouse key={`e${e}`} b={b} eIndex={e} mats={mats} />
      ))}
      {/* Crates → small timber boxes */}
      {BUILDINGS.map((b, i) => (!b.door && b.h < 2 ? <BuildingBlock key={`c${i}`} b={b} mats={mats} /> : null))}

      {/* Market district — the merchant stand IS the marketplace (sign mounted on
          it, sits exactly on the shop trigger at VILLAGE.market), flanked by two
          small stalls so the plaza reads as a market square. */}
      <MarketStand position={[m.x, 0, m.z]} />
      <Stall position={[m.x - 4.5, 0, m.z + 2.5]} color="#c0553b" />
      <Stall position={[m.x + 4.5, 0, m.z - 1]} color="#c0a13b" />

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
