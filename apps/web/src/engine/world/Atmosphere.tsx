"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { THEME } from "./theme";

const EMBER_COUNT = 260;
const AREA = 72; // spread across the play area
const RISE = 0.35; // m/s drift upward

/**
 * Slow-drifting embers / dust motes catching the light — cheap atmosphere.
 * A single additive Points cloud; particles rise, sway, and wrap around.
 */
function Embers() {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(EMBER_COUNT * 3);
    const speeds = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * AREA;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * AREA;
      speeds[i] = 0.5 + Math.random();
    }
    return { positions, speeds };
  }, []);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < EMBER_COUNT; i++) {
      arr[i * 3 + 1] += RISE * speeds[i] * dt;
      arr[i * 3] += Math.sin(t * 0.3 + i) * 0.06 * dt; // gentle sway
      if (arr[i * 3 + 1] > 15) arr[i * 3 + 1] = 0; // wrap to the ground
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={THEME.lantern}
        size={0.12}
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/** A warm hanging lantern: glowing bulb + a pool of light (blooms in PostFX). */
function Lantern({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial
          color={THEME.lantern}
          emissive={THEME.lantern}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      <pointLight intensity={6} distance={11} decay={2} color={THEME.lantern} />
    </group>
  );
}

const LANTERNS: [number, number, number][] = [
  [-20, 2.6, 4], // market plaza
  [-24, 2.6, 9],
  [0, 2.6, 24], // gate approach
  [4, 2.6, 8], // main street
  [-6, 2.6, 2], // central crossroads
  [20, 2.6, -6], // east courtyard
  [-10, 2.6, -20], // deep-north approach
  [8, 2.6, -26],
];

/** Mood layer: embers + warm lantern pools of light through the streets. */
export function Atmosphere() {
  return (
    <>
      <Embers />
      {LANTERNS.map((p, i) => (
        <Lantern key={i} position={p} />
      ))}
    </>
  );
}
