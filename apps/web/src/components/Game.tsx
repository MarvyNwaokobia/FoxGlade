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

// Quality presets — the perf/looks tradeoff, tunable live so it can be dialled
// per-device. `dpr` (render resolution) and `bloom` update live; `shadow` map
// size is read at mount. Mobile defaults to Med, desktop to High.
type Quality = "low" | "med" | "high";
const QUALITY: Record<Quality, { dpr: number; bloom: boolean; shadow: number }> = {
  low: { dpr: 1, bloom: false, shadow: 1024 },
  med: { dpr: 1.5, bloom: false, shadow: 1024 },
  high: { dpr: 2, bloom: true, shadow: 2048 },
};
const NEXT: Record<Quality, Quality> = { low: "med", med: "high", high: "low" };

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  // Detect touch after mount (avoids SSR mismatch). Drives on-screen controls.
  const [mobile, setMobile] = useState(false);
  const [quality, setQuality] = useState<Quality>("high");
  useEffect(() => {
    const touch = isTouchDevice();
    setMobile(touch);
    setQuality(touch ? "med" : "high");
  }, []);
  const q = QUALITY[quality];

  return (
    <>
      <Canvas
        shadows
        dpr={q.dpr}
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
          <VillageScene bloom={q.bloom} shadowSize={q.shadow} />
          <PlayerController />
          <FoxCompanion />
        </Suspense>
        {/* Perf readout (FPS/ms) — temporary, to gauge game vs hardware. */}
        <Stats />
      </Canvas>
      <Hud />
      {mobile && <MobileControls />}
      {/* Quality switch — dial the perf/looks balance per device. */}
      <button
        onClick={() => setQuality((c) => NEXT[c])}
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          right: "calc(env(safe-area-inset-right, 0px) + 8px)",
          zIndex: 50,
          padding: "8px 12px",
          borderRadius: 999,
          border: "1.5px solid rgba(255,255,255,0.35)",
          background: "rgba(20,20,24,0.5)",
          color: "#fff",
          font: "600 12px system-ui, sans-serif",
          letterSpacing: 1,
          touchAction: "none",
        }}
      >
        Quality: {quality.toUpperCase()}
      </button>
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
