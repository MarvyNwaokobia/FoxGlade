"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader, Stats, PerformanceMonitor, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { AudioDriver } from "@/engine/audio/AudioDriver";
import { audio } from "@/engine/audio/audio";
import { Hud } from "@/components/Hud";
import { Shop } from "@/components/Shop";
import { MobileControls } from "@/components/MobileControls";
import { isTouchDevice } from "@/engine/input/touch";

// Locked to HIGH — graphics quality is core to the game (Marvy's call). The
// render-resolution ceiling stays capped (dpr 2 on fullscreen retina is ~27M px
// and tanks any GPU); AdaptiveDpr + PerformanceMonitor still auto-protect a weak
// device invisibly, and degraded mode is the last-resort safety net.
const HIGH = { dpr: 1.35, bloom: true, shadow: 1024 };

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  // Detect touch after mount (avoids SSR mismatch). Drives on-screen controls.
  const [mobile, setMobile] = useState(false);
  // Last-resort safety: if a machine can't hold framerate even after AdaptiveDpr
  // drops resolution, latch "degraded" (shadows + bloom off). Capable machines
  // never trip it and keep the full HIGH look.
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    setMobile(isTouchDevice());
  }, []);

  // Browsers hold the AudioContext suspended until a user gesture — resume it
  // (and start the ambient beds) on the first click / key / touch.
  useEffect(() => {
    const wake = () => audio.unlock();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  const q = HIGH;

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
            shadows={!degraded}
            shadowSize={q.shadow}
            degraded={degraded}
          />
          <PlayerController />
          <FoxCompanion />
        </Suspense>
        {/* Reads game state → schedules audio cues (outside Suspense so it runs
            even while assets stream in). */}
        <AudioDriver />
        {/* Auto-scale render resolution to hold framerate: AdaptiveDpr lowers the
            pixel ratio under load. If a machine STILL can't cope after that,
            PerformanceMonitor.onDecline latches degraded mode (shadows + bloom off). */}
        <PerformanceMonitor onDecline={() => setDegraded(true)} />
        <AdaptiveDpr pixelated />
        {/* Perf readout (FPS/ms) — temporary, to gauge game vs hardware. */}
        <Stats />
      </Canvas>
      <Hud />
      <Shop />
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
