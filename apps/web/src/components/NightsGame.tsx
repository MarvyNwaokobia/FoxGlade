"use client";

import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { NightsScene } from "@/engine/nights/NightsScene";
import { NightsHud } from "@/components/NightsHud";
import { newRun } from "@/engine/nights/run";

/**
 * Foxglade Nights. Hold the village green until dawn.
 *
 * The run state is a plain mutable object rather than store state on purpose:
 * it is written every frame, and nothing that changes 60 times a second belongs
 * anywhere React will notice. The HUD polls it on its own rAF.
 */
export default function NightsGame() {
  const [run, setRun] = useState(newRun);
  const retry = useCallback(() => setRun(newRun()), []);

  return (
    <>
      <Canvas
        key={run.t === 0 ? "run" : "run"}
        camera={{ fov: 40, near: 0.1, far: 220, position: [0, 19, 14] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        dpr={[0.8, 1.5]}
        onCreated={({ gl, scene }) => {
          gl.setClearColor("#05070c");
          // Distance falls off to black, so the arena has no visible edge and
          // the dark reads as endless rather than as a floor that stops.
          scene.fog = new THREE.Fog("#070a11", 26, 72);
        }}
      >
        <NightsScene run={run} />
      </Canvas>
      <NightsHud run={run} onRetry={retry} />
    </>
  );
}
