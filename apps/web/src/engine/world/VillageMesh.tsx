"use client";

import { Grid } from "@react-three/drei";
import { BUILDINGS, VILLAGE } from "./village";

const HALF = VILLAGE.half;
const WALL_H = 3;

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#2b3138" roughness={0.95} />
    </mesh>
  );
}

/** A flat glowing pad + a tall light beacon so a zone reads from across the map. */
function Zone({
  position,
  color,
  radius = 3,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 24, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/**
 * Renders the walled village from the layout data: ground, a subtle grid,
 * perimeter walls, building blocks, and the spawn / treasure / market zones.
 * Gray-box materials on purpose — this is the M1 space, not the final art.
 */
export function Village() {
  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2, HALF * 2]} />
        <meshStandardMaterial color="#15181c" roughness={1} />
      </mesh>
      <Grid
        args={[HALF * 2, HALF * 2]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#252c33"
        sectionSize={12}
        sectionThickness={1}
        sectionColor="#333c45"
        fadeDistance={95}
        fadeStrength={1.2}
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
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#39424c" : "#333b44"} roughness={0.9} />
        </mesh>
      ))}

      {/* Zones */}
      <Zone position={[VILLAGE.treasure.x, 0, VILLAGE.treasure.z]} color="#f2c14e" radius={3.2} />
      <Zone position={[VILLAGE.market.x, 0, VILLAGE.market.z]} color="#4e93f2" radius={3.5} />
      {/* Spawn pad (dim, no beacon) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VILLAGE.spawn.x, 0.02, VILLAGE.spawn.z]}>
        <ringGeometry args={[2.2, 2.6, 40]} />
        <meshStandardMaterial color="#5a6672" emissive="#5a6672" emissiveIntensity={0.3} transparent opacity={0.6} />
      </mesh>
    </>
  );
}
