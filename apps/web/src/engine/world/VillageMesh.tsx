"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { BUILDINGS, VILLAGE, wallSegments, doorOpening, WALL_T, type Building } from "./village";
import { HINTS } from "./hints";
import { THEME } from "./theme";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";

const HALF = VILLAGE.half;
const WALL_H = 3;

/** Deterministic per-building pick from a palette (stable across renders). */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

/**
 * A gabled roof over a building footprint: a triangular prism whose ridge runs
 * along the building's longer axis, with a small overhang. Reads as a house
 * rather than a capped box.
 */
function GableRoof({ b, seed }: { b: Building; seed: number }) {
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

  return (
    <mesh geometry={geo} position={[b.x, b.h, b.z]} castShadow receiveShadow>
      <meshStandardMaterial color={pick(THEME.roof, seed)} roughness={0.9} />
    </mesh>
  );
}

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={THEME.rampart} roughness={0.95} />
    </mesh>
  );
}

/**
 * A building block. Solid ones render as a stone box with a gabled roof;
 * enterable ones render their wall strips — the same boxes the collision and
 * LOS systems use — plus the roof, so you can walk in through the gap.
 */
function BuildingBlock({ b, i }: { b: Building; i: number }) {
  const wall = pick(THEME.wallStone, i * 7 + 3);
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
            <meshStandardMaterial color={wall} roughness={0.9} />
          </mesh>
        ))}
        <GableRoof b={b} seed={i * 7 + 3} />
        {/* Doorway markers: warm frame posts, glowing threshold, light spilling
            out — so the opening reads from down the street, not just up close. */}
        <group position={[op.cx, 0, op.cz]} rotation={[0, doorYaw, 0]}>
          <mesh position={[-(op.width / 2 + 0.12), b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
            <meshStandardMaterial color={THEME.wallTimber} roughness={0.7} />
          </mesh>
          <mesh position={[op.width / 2 + 0.12, b.h / 2, 0]} castShadow>
            <boxGeometry args={[0.24, b.h, WALL_T + 0.16]} />
            <meshStandardMaterial color={THEME.wallTimber} roughness={0.7} />
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
          <pointLight position={[0, 2.4, -1.8]} intensity={6} distance={10} color={THEME.lantern} />
        </group>
        {/* A hung lantern beside the door, so lit windows read at night */}
        <mesh position={[op.cx + op.nx * 0.3 - op.nz * (op.width / 2 + 0.4), 2.1, op.cz + op.nz * 0.3 + op.nx * (op.width / 2 + 0.4)]}>
          <boxGeometry args={[0.18, 0.26, 0.18]} />
          <meshStandardMaterial color={THEME.lantern} emissive={THEME.lantern} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={isCrate ? THEME.wallTimber : wall} roughness={0.9} />
      </mesh>
      {!isCrate && <GableRoof b={b} seed={i * 7 + 3} />}
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
 * Gradient sky dome (dusk) enclosing the play area. A big inside-out sphere with
 * a two-colour vertical gradient — cheap, no texture download.
 */
function SkyDome() {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(THEME.skyTop) },
        horizon: { value: new THREE.Color(THEME.skyHorizon) },
      },
      vertexShader: `
        varying vec3 vP;
        void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 horizon;
        void main() {
          float h = clamp((normalize(vP).y + 0.1) / 0.7, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizon, top, h), 1.0);
        }
      `,
    });
  }, []);
  return (
    <mesh material={mat} scale={[300, 300, 300]}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

/** Procedural ground texture (dirt + road specks) baked to a canvas — free. */
function useGroundTexture() {
  return useMemo(() => {
    const s = 512;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = THEME.groundBase;
    ctx.fillRect(0, 0, s, s);
    // Mottle with dirt + darker specks for a worn-earth read.
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = Math.random() * 3 + 0.5;
      ctx.fillStyle = Math.random() < 0.5 ? THEME.groundDirt : THEME.groundSpeck;
      ctx.globalAlpha = 0.15 + Math.random() * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    tex.anisotropy = 4;
    return tex;
  }, []);
}

/**
 * Renders the walled village from the layout data: sky, ground, perimeter
 * walls, buildings, zone beacons + labels, market stalls, and the treasure gem.
 * Materials are procedural "dusk" theme dressing over the gray-box layout.
 */
export function Village() {
  const m = VILLAGE.market;
  const ground = useGroundTexture();
  return (
    <>
      <SkyDome />

      {/* Ground (extends well past the play area so its edge fades into fog) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[290, 290]} />
        <meshStandardMaterial map={ground} color="#ffffff" roughness={1} />
      </mesh>

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

      {/* Bank — the enterable house on the plaza; vault pad + chest inside.
          Walk in (world pauses), stand on the pad, E deposits carried loot. */}
      <ZoneLabel position={[-26, 7.5, -3]} text="Bank" color="#ffd873" />
      <group position={[VILLAGE.bank.x, 0, VILLAGE.bank.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <circleGeometry args={[1.5, 32]} />
          <meshStandardMaterial
            color="#ffd873"
            emissive="#ffd873"
            emissiveIntensity={0.45}
            transparent
            opacity={0.5}
          />
        </mesh>
        <mesh position={[0, 0.55, -0.9]} castShadow>
          <boxGeometry args={[1.4, 1.1, 0.9]} />
          <meshStandardMaterial color="#3a4048" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.55, -0.44]}>
          <boxGeometry args={[0.5, 0.5, 0.03]} />
          <meshStandardMaterial color="#ffd873" emissive="#ffd873" emissiveIntensity={0.4} metalness={0.6} />
        </mesh>
      </group>

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
