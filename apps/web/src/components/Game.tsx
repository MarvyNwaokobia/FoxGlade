"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader, Stats, PerformanceMonitor, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { Hud } from "@/components/Hud";
import { MobileControls } from "@/components/MobileControls";
import { isTouchDevice } from "@/engine/input/touch";

// Quality presets. `dpr` is the render-resolution CEILING — capped low because
// dpr 2 on a fullscreen retina display is ~4× the pixels (27M/frame) and tanks
// any GPU. PerformanceMonitor + AdaptiveDpr drop it further automatically under
// load, so the framerate self-corrects per device.
type Quality = "low" | "med" | "high";
const QUALITY: Record<Quality, { dpr: number; bloom: boolean; shadow: number }> = {
  low: { dpr: 0.7, bloom: false, shadow: 1024 },
  med: { dpr: 1, bloom: false, shadow: 1024 },
  high: { dpr: 1.35, bloom: true, shadow: 1024 },
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
  // Valor-style escape hatch: if the machine can't hold framerate even after
  // AdaptiveDpr drops the resolution, latch "degraded" — kills shadows + the
  // heavy post pass so weak laptops/phones stay playable. Capable machines never
  // trip it and keep the full look.
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    const touch = isTouchDevice();
    setMobile(touch);
    setQuality("med"); // start safe everywhere; bump to High if it holds
  }, []);
  const q = QUALITY[quality];

  return (
    <>
      <Canvas
        shadows
        dpr={[0.6, q.dpr]}
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
          <VillageScene
            bloom={q.bloom && !degraded}
            shadows={quality === "high" && !degraded}
            shadowSize={q.shadow}
            degraded={degraded}
          />
          <PlayerController />
          <FoxCompanion />
        </Suspense>
        {/* Auto-scale render resolution to hold framerate: AdaptiveDpr lowers the
            pixel ratio under load. If a machine STILL can't cope after that,
            PerformanceMonitor.onDecline latches degraded mode (shadows + bloom off). */}
        <PerformanceMonitor onDecline={() => setDegraded(true)} />
        <AdaptiveDpr pixelated />
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
