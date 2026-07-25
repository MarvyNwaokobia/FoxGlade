"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, ENTERABLES, VILLAGE, wallSegments, doorOpening, WALL_T, type Building } from "./village";
import { HINTS } from "./hints";
import { THEME } from "./theme";
import { Buildings3D, BuildingModel, chooseModel } from "./Buildings3D";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";

const HALF = VILLAGE.half;
const WALL_H = 3;

/** A photographic (CC0 PBR) material shared across a surface type. */
export interface VillageMaterials {
  ground: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
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
  });

  return useMemo(() => {
    const cfg = (t: THREE.Texture, rx: number, ry: number, srgb = false) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const ground = new THREE.MeshStandardMaterial({
      map: cfg(tex.groundMap, 55, 55, true),
      normalMap: cfg(tex.groundNor, 55, 55),
      roughnessMap: cfg(tex.groundRough, 55, 55),
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
    return { ground, wall, roof, timber };
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

      {/* Enterable-door marker: a glowing torch-lit door FRAME (two posts + a
          lintel) + a brighter threshold pad, so shelters read clearly from
          across the map even though the exterior model is solid. */}
      <group position={[op.cx, 0, op.cz]} rotation={[0, doorYaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -0.5]}>
          <planeGeometry args={[op.width + 0.5, 2.0]} />
          <meshBasicMaterial color={DOOR_COLOR} transparent opacity={0.55} depthWrite={false} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (op.width / 2 + 0.16), 1.3, -0.08]}>
            <boxGeometry args={[0.13, 2.6, 0.13]} />
            <meshStandardMaterial color={DOOR_COLOR} emissive={DOOR_COLOR} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 2.6, -0.08]}>
          <boxGeometry args={[op.width + 0.45, 0.13, 0.13]} />
          <meshStandardMaterial color={DOOR_COLOR} emissive={DOOR_COLOR} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        {/* A glowing pennant above the frame — a cheap 3D "flag" (no DOM/Html) that
            catches the eye from across the map, marking this as enterable. */}
        <mesh position={[0, b.h * 0.82 + 0.6, -0.08]}>
          <boxGeometry args={[0.9, 0.5, 0.04]} />
          <meshStandardMaterial color={DOOR_COLOR} emissive={DOOR_COLOR} emissiveIntensity={1.1} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const DOOR_COLOR = "#ffb454"; // warm torch — distinct from cyan hints / gold treasure

/**
 * Floating billboard label marking a zone. `occlude` hides it behind buildings,
 * and it fades out as the player approaches — labels are for finding a zone from
 * a distance, not for standing on top of it (no more MARKET plastered on you).
 */
function ZoneLabel({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  const inner = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (!inner.current) return;
    const dx = position[0] - runtime.playerPos.x;
    const dz = position[2] - runtime.playerPos.z;
    const dist = Math.hypot(dx, dz);
    // Hidden within ~7m (you've arrived), full opacity beyond ~14m.
    inner.current.style.opacity = String(THREE.MathUtils.clamp((dist - 7) / 7, 0, 1));
  });
  return (
    <Html position={position} center distanceFactor={34} occlude style={{ pointerEvents: "none" }}>
      <div
        ref={inner}
        style={{
          padding: "2px 9px",
          borderRadius: 6,
          background: "rgba(11,13,16,0.6)",
          border: `1px solid ${color}`,
          color,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 1.5,
          whiteSpace: "nowrap",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/** Glowing ground pad + tall light beacon marking a zone. */
function Zone({ position, color, radius = 3 }: { position: [number, number, number]; color: string; radius?: number }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 24, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.4} />
      </mesh>
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
  const claimed = useGame((s) => s.treasureClaimed);

  useFrame((_, dt) => {
    // A decoy vanishes once its distractor is silenced; a real treasure
    // vanishes once a thief has made off with it.
    if (grp.current) {
      grp.current.visible =
        !(!hint.real && runtime.hintSilenced[index]) && !(hint.real && runtime.hintStolen[index]);
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
      gem.current.visible = hint.real && !claimed && (atThisReal || revealed);
      gem.current.rotation.y += dt * 1.2;
      gem.current.position.y = 1.6 + Math.sin(performance.now() / 600) * 0.15;
    }
  });

  if (hint.real && claimed) return null; // the real treasure is gone once claimed

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
      {/* Ground (extends well past the play area so its edge fades into fog) */}
      <mesh material={mats.ground} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[290, 290]} />
      </mesh>

      {/* Perimeter ramparts (stone) */}
      <Wall position={[0, WALL_H / 2, -HALF]} size={[HALF * 2, WALL_H, 0.6]} mat={mats.wall} />
      <Wall position={[0, WALL_H / 2, HALF]} size={[HALF * 2, WALL_H, 0.6]} mat={mats.wall} />
      <Wall position={[-HALF, WALL_H / 2, 0]} size={[0.6, WALL_H, HALF * 2]} mat={mats.wall} />
      <Wall position={[HALF, WALL_H / 2, 0]} size={[0.6, WALL_H, HALF * 2]} mat={mats.wall} />

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

      {/* Market district */}
      <Zone position={[m.x, 0, m.z]} color="#4e93f2" radius={4} />
      <ZoneLabel position={[m.x, 5.5, m.z]} text="Market" color="#8fc0ff" />
      <Stall position={[m.x - 3, 0, m.z - 1]} color="#c0553b" />
      <Stall position={[m.x + 3, 0, m.z + 1]} color="#3b7cc0" />
      <Stall position={[m.x, 0, m.z + 3]} color="#c0a13b" />

      {/* Bank — the enterable house on the plaza. The real vault chest + shelves
          are furnished in <Interiors>; here we keep the glowing deposit pad and
          the label. Walk in (world pauses), stand on the pad, E deposits loot. */}
      <ZoneLabel position={[-26, 7.5, -3]} text="Bank" color="#ffd873" />
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
