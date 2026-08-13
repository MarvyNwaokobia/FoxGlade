"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PlayerRig, type PlayerRigState } from "@/engine/character/PlayerRig";

// The main village Canvas (Game.tsx) pairs ACES tonemapping with a low
// exposure (0.82) because a full HDRI sky is doing most of the fill light
// for its dusk mood. This Canvas has no sky and no HDRI — just two direct
// lights — so the same exposure reads as a near-black silhouette. Same
// tonemapping (materials are authored for it), pushed exposure instead of
// dusk-dim.
const TONE_MAPPING = THREE.ACESFilmicToneMapping;
const EXPOSURE = 1.5;

/**
 * A small standalone turntable for the onboarding hero step — the real
 * PlayerRig (same model, same rig, same idle animation you see in the
 * village), not a separate portrait asset. Reusing it here is what makes
 * "this is your hero" true rather than illustrative: click Begin and it's
 * the same body standing in the gate a moment later.
 *
 * State is a fixed, at-rest snapshot — nothing here is driven by input or
 * `runtime`, so this is safe to mount completely on its own (see the note
 * in engine/onboarding.ts about not wiring this screen up yet).
 */
const IDLE_STATE: PlayerRigState = {
  position: new THREE.Vector3(0, 0, 0),
  rotation: 0,
  aimPitch: 0,
  velocity: new THREE.Vector3(0, 0, 0),
  moving: false,
  running: false,
  crouching: false,
  grounded: true,
  dead: false,
  fireAt: -Infinity,
  aimYaw: 0,
  hitAt: -Infinity,
  hitSerious: false,
  hitHeavy: false,
  hitDir: "front",
  reloading: false,
  throwAt: -Infinity,
  dodgeAt: -Infinity,
  grabAt: -Infinity,
  resting: false,
  visible: true,
  opacity: 1,
};

function Turntable() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.45;
  });
  // Own copy of the state object so nothing else can mutate it out from
  // under this render, and so a future caller passing e.g. a different
  // hero id can't leak state between instances.
  const state = useMemo(() => ({ ...IDLE_STATE, position: new THREE.Vector3(), velocity: new THREE.Vector3() }), []);
  return (
    <group ref={group} position={[0, -1.05, 0]}>
      <PlayerRig state={state} model="man" />
    </group>
  );
}

export function HeroShowcase() {
  return (
    <Canvas
      camera={{ position: [0, 0.35, 2.5], fov: 32, near: 0.1, far: 20 }}
      gl={{ antialias: true, alpha: true, toneMapping: TONE_MAPPING, toneMappingExposure: EXPOSURE }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[2.4, 3.2, 1.8]} intensity={2.6} color="#ffe3b0" />
      <directionalLight position={[-2, 1.2, -1.5]} intensity={1.1} color="#8fb0d9" />
      <directionalLight position={[0, 1.4, -2.6]} intensity={0.9} color="#fff2d8" />
      <Turntable />
    </Canvas>
  );
}
