"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader } from "@react-three/drei";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { Hud } from "@/components/Hud";

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  return (
    <>
      <Canvas
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.82 }}
        camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 8] }}
        onCreated={({ gl }) => {
          gl.setClearColor("#c8895a"); // dusk fallback until the HDRI sky loads
        }}
      >
        {/* Hold the whole scene (and the player/fox) until every asset — HDRI,
            building models, props, textures — has loaded, so nothing renders
            black-and-unlit during the download. */}
        <Suspense fallback={null}>
          <VillageScene />
          <PlayerController />
          <FoxCompanion />
        </Suspense>
      </Canvas>
      <Hud />
      {/* DOM loading screen with a progress bar until assets are ready. */}
      <Loader
        containerStyles={{ background: "#1a140f" }}
        barStyles={{ background: "#f2c14e", height: 4 }}
        dataStyles={{ color: "#e8dcc6", fontSize: 13, fontFamily: "system-ui, sans-serif", letterSpacing: 1 }}
        dataInterpolation={(p) => `Entering the village… ${p.toFixed(0)}%`}
      />
    </>
  );
}
