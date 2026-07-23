"use client";

import { Grid } from "@react-three/drei";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";

const EXT = FEEL.arenaHalfExtent;

/** A landmark block you can navigate toward. */
function Marker({
  position,
  color,
  label,
  height = 2,
}: {
  position: [number, number, number];
  color: string;
  label?: string;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[1.6, height, 1.6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A perimeter wall segment so the play area's bounds are felt, not invisible. */
function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#2b3138" roughness={0.9} />
    </mesh>
  );
}

/**
 * Gray-box village stand-in: ground + grid, perimeter walls, a scatter of
 * obstacle blocks for spatial reference, and two landmark markers (the treasure
 * zone and a marketplace spot) so movement has something to aim at. This is the
 * M1 village in placeholder form.
 */
export function GrayboxScene() {
  const t = runtime.treasurePos;
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 30, 10]} intensity={1.1} castShadow />
      <hemisphereLight args={["#9fb8cc", "#20262c", 0.6]} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[EXT * 2, EXT * 2]} />
        <meshStandardMaterial color="#171b1f" roughness={1} />
      </mesh>
      <Grid
        args={[EXT * 2, EXT * 2]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#2e3640"
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor="#3d4854"
        fadeDistance={90}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
        position={[0, 0.01, 0]}
      />

      {/* Perimeter walls */}
      <Wall position={[0, 1, -EXT]} size={[EXT * 2, 2, 0.5]} />
      <Wall position={[0, 1, EXT]} size={[EXT * 2, 2, 0.5]} />
      <Wall position={[-EXT, 1, 0]} size={[0.5, 2, EXT * 2]} />
      <Wall position={[EXT, 1, 0]} size={[0.5, 2, EXT * 2]} />

      {/* Obstacle scatter for spatial reference */}
      <Marker position={[-8, 0, -6]} color="#3a4048" height={2.5} />
      <Marker position={[6, 0, -14]} color="#3a4048" height={1.5} />
      <Marker position={[-16, 0, 8]} color="#3a4048" height={3} />
      <Marker position={[12, 0, 4]} color="#3a4048" height={2} />
      <Marker position={[0, 0, -20]} color="#3a4048" height={1.8} />

      {/* Landmarks */}
      <Marker position={[t.x, 0, t.z]} color="#f2c14e" height={2.4} label="treasure" />
      <Marker position={[-22, 0, -18]} color="#4e93f2" height={2.2} label="market" />
    </>
  );
}
