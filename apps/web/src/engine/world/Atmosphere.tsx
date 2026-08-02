"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { THEME } from "./theme";
import { skyAt } from "@/engine/config/day";
import { runtime } from "@/engine/runtime";

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

/**
 * A warm hanging lantern. It now BRIGHTENS as the day ends — barely lit at noon,
 * carrying the street at night. These were static decoration when the scene was
 * permanently midday; with the day clock running they're the reason night is
 * playable at all, and the reason it looks like somewhere.
 */
function Lantern({ position }: { position: [number, number, number] }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const mix = skyAt(runtime.dayProgress).lanternMix;
    if (mat.current) mat.current.emissiveIntensity = 0.35 + mix * 2.6;
    // The point light only switches on once it would actually be visible — eight
    // forward-rendered lights at noon cost frames and light nothing.
    if (light.current) {
      light.current.visible = mix > 0.25;
      light.current.intensity = mix * 7;
    }
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial
          ref={mat}
          color={THEME.lantern}
          emissive={THEME.lantern}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={light} color={THEME.lantern} distance={13} intensity={0} visible={false} />
      {/* No real point light — 8 of these in forward rendering murdered the frame
          rate, and in daytime they do nothing. The day→night pass re-adds a few
          cheap lights (or a single baked scheme) at dusk. */}
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

/** Mood layer: warm lantern bulbs through the streets. (Embers read as odd
 *  daytime "stars", so they're off until the day→night pass brings dusk back.) */
export function Atmosphere() {
  return (
    <>
      {LANTERNS.map((p, i) => (
        <Lantern key={i} position={p} />
      ))}
    </>
  );
}
