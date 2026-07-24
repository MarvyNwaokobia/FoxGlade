"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader, Stats } from "@react-three/drei";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { Hud } from "@/components/Hud";
import { MobileControls } from "@/components/MobileControls";
import { isTouchDevice } from "@/engine/input/touch";

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  // Detect touch after mount (avoids SSR mismatch). Drives on-screen controls
  // and mobile perf cuts (pixel ratio, post-processing, shadow resolution).
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(isTouchDevice()), []);

  return (
    <>
      <Canvas
        shadows
        dpr={mobile ? 1 : [1, 2]} // phones render at 2–3× native px otherwise — huge cost
        gl={{ antialias: !mobile, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.82 }}
        camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 8] }}
        onCreated={({ gl }) => {
          gl.setClearColor("#c8895a"); // dusk fallback until the HDRI sky loads
        }}
      >
        {/* Hold the whole scene (and the player/fox) until every asset — HDRI,
            building models, props, textures — has loaded, so nothing renders
            black-and-unlit during the download. */}
        <Suspense fallback={null}>
          <VillageScene mobile={mobile} />
          <PlayerController />
          <FoxCompanion />
        </Suspense>
        {/* Perf readout (FPS/ms) — temporary, to gauge game vs hardware. */}
        <Stats />
      </Canvas>
      <Hud />
      {mobile && <MobileControls />}
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
