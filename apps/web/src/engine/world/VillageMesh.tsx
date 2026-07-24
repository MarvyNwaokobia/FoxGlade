"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, VILLAGE, wallSegments, doorOpening, WALL_T, type Building } from "./village";
import { HINTS } from "./hints";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";

const HALF = VILLAGE.half;
const WALL_H = 3;

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#4a525b" roughness={0.95} />
    </mesh>
  );
}

/**
 * A building block. Solid ones render as one box with a roof cap; enterable
 * ones (with a door) render their wall strips — the same boxes the collision
 * and LOS systems use — plus the roof, so you can walk in through the gap.
 */
function BuildingBlock({ b, i }: { b: Building; i: number }) {
  const wall = i % 2 === 0 ? "#7c828b" : "#6e767f";
  const isCrate = b.h < 2;
  if (b.door) {
    const op = doorOpening(b)!;
    const doorYaw = Math.atan2(op.nx, op.nz); // group's local +Z points out the door
    return (
      <group>
        {wallSegments(b).map((s, j) => (
          <mesh
            key={j}
            position={[(s.minX + s.maxX) / 2, b.h / 2, (s.minZ + s.maxZ) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s.maxX - s.minX, b.h, s.maxZ - s.minZ]} />
            <meshStandardMaterial color={wall} roughness={0.85} />
          </mesh>
        ))}
        {/* Roof cap (slight overhang; the LOS roof slab matches the footprint) */}
        <mesh position={[b.x, b.h + 0.2, b.z]} castShadow>
          <boxGeometry args={[b.w + 0.5, 0.4, b.d + 0.5]} />
          <meshStandardMaterial color="#3f464e" roughness={0.8} />
        </mesh>
        {/* Doorway markers: warm frame posts, glowing threshold, light spilling
            out — so the opening reads from down the street, not just up close. */}
        <group position={[op.cx, 0, op.cz]} rotation={[0, doorYaw, 0]}>
          <mesh position={[-(op.width / 2 + 0.12), b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
            <meshStandardMaterial color="#c9974e" roughness={0.7} />
          </mesh>
          <mesh position={[op.width / 2 + 0.12, b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
            <meshStandardMaterial color="#c9974e" roughness={0.7} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <planeGeometry args={[op.width + 0.5, 2.6]} />
            <meshStandardMaterial
              color="#ffc96b"
              emissive="#ffc96b"
              emissiveIntensity={0.4}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
          <pointLight position={[0, 2.4, -1.8]} intensity={6} distance={10} color="#ffd9a0" />
        </group>
      </group>
    );
  }
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={isCrate ? "#8a6a44" : wall} roughness={0.85} />
      </mesh>
      {!isCrate && (
        <mesh position={[0, b.h + 0.25, 0]} castShadow>
          <boxGeometry args={[b.w + 0.5, 0.5, b.d + 0.5]} />
          <meshStandardMaterial color="#3f464e" roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

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
    // A decoy vanishes once its distractor is silenced.
    if (grp.current) grp.current.visible = !(!hint.real && runtime.hintSilenced[index]);
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
 * Renders the walled village from the layout data: ground, grid, perimeter
 * walls, buildings, zone beacons + labels, market stalls, and the treasure gem.
 * Gray-box materials on purpose — this is the M1 space, not the final art.
 */
export function Village() {
  const m = VILLAGE.market;
  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2, HALF * 2]} />
        <meshStandardMaterial color="#5b6068" roughness={0.95} />
      </mesh>
      <Grid
        args={[HALF * 2, HALF * 2]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#4a505a"
        sectionSize={12}
        sectionThickness={1.2}
        sectionColor="#6b7580"
        fadeDistance={110}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
        position={[0, 0.01, 0]}
      />

      {/* Perimeter walls */}
      <Wall position={[0, WALL_H / 2, -HALF]} size={[HALF * 2, WALL_H, 0.6]} />
      <Wall position={[0, WALL_H / 2, HALF]} size={[HALF * 2, WALL_H, 0.6]} />
      <Wall position={[-HALF, WALL_H / 2, 0]} size={[0.6, WALL_H, HALF * 2]} />
      <Wall position={[HALF, WALL_H / 2, 0]} size={[0.6, WALL_H, HALF * 2]} />

      {/* Buildings */}
      {BUILDINGS.map((b, i) => (
        <BuildingBlock key={i} b={b} i={i} />
      ))}

      {/* Market district */}
      <Zone position={[m.x, 0, m.z]} color="#4e93f2" radius={4} />
      <ZoneLabel position={[m.x, 5.5, m.z]} text="Market" color="#8fc0ff" />
      <Stall position={[m.x - 3, 0, m.z - 1]} color="#c0553b" />
      <Stall position={[m.x + 3, 0, m.z + 1]} color="#3b7cc0" />
      <Stall position={[m.x, 0, m.z + 3]} color="#c0a13b" />

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
