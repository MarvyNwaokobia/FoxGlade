"use client";

// Side-effect import, first on purpose — see gltfLoader.ts. Every other
// import below can (and several do) call useGLTF.preload() at module scope,
// so the decoder path has to be set before any of those run.
import "@/engine/scene/gltfLoader";
import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader, Stats, PerformanceMonitor, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { ViewModel } from "@/engine/player/ViewModel";
import { gameMode } from "@/engine/config/mode";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { AudioDriver } from "@/engine/audio/AudioDriver";
import { audio } from "@/engine/audio/audio";
import { Hud } from "@/components/Hud";
import { Shop } from "@/components/Shop";
import { ArmorySelect } from "@/components/ArmorySelect";
import { Profile } from "@/components/Profile";
import { Bank } from "@/components/Bank";
import { HelpCenter } from "@/components/HelpCenter";
import { Terms } from "@/components/Terms";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { Pause } from "@/components/Pause";
import { Minimap } from "@/components/Minimap";
import { MobileControls } from "@/components/MobileControls";
import { MapScreen } from "@/components/MapScreen";
import { Tutorial } from "@/components/Tutorial";
import { TutorialBrief } from "@/components/TutorialBrief";
import { Onboarding } from "@/components/Onboarding";
import { loadOnboarding, writeOnboarding } from "@/engine/onboarding";
import { useWallet } from "@/engine/chain/wallet";
import { magicConfigured } from "@/engine/chain/magic";
import { pullOnboarding } from "@/engine/chain/onboardingSync";
import { WalletButton } from "@/components/WalletButton";
import { isTouchDevice } from "@/engine/input/touch";
import { PerfProbe } from "@/engine/scene/PerfProbe";
import { ShaderWarmup } from "@/engine/scene/ShaderWarmup";
import { perfOff } from "@/engine/scene/perf";
import { detectDeviceTier, qualityOverride } from "@/engine/scene/deviceTier";
import { QUALITY } from "@/engine/scene/qualityPresets";

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  // Detect touch after mount (avoids SSR mismatch). Drives on-screen controls.
  const [mobile, setMobile] = useState(false);
  // Last-resort safety: if a machine can't hold framerate even after AdaptiveDpr
  // drops resolution, latch "degraded" (shadows + bloom off) ON TOP OF whatever
  // tier was already picked below — this catches whatever the proactive
  // detection got wrong, it doesn't replace it.
  const [degraded, setDegraded] = useState(false);
  const [debugStats, setDebugStats] = useState(false);
  // Safe to read in the initializer (no SSR mismatch risk): ssr:false, same
  // reasoning as `onboarded` below. Computed once — a device doesn't change
  // GPU/memory/core-count mid-session, and re-detecting on every render would
  // be pure waste.
  const [tier] = useState(() => qualityOverride() ?? detectDeviceTier());
  const q = QUALITY[tier];
  useEffect(() => {
    setMobile(isTouchDevice());
    setDebugStats(new URLSearchParams(window.location.search).has("stats"));
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

  // Which game this canvas is running (set by the route before mount).
  const mode = gameMode();

  // Hero/egg pick, once ever, Foxglade only (Nighthaul's lore doesn't fit it).
  // Safe to read localStorage in the initializer: this component is mounted
  // with ssr:false (see app/page.tsx), so it never renders on the server.
  const [onboarded, setOnboarded] = useState(() => mode.id !== "foxglade" || loadOnboarding().hasOnboarded);

  // Background reconciliation, NOT a gate: an earlier version blocked the
  // wizard behind a silent wallet-session restore first, so a player who
  // *could* skip it (already onboarded elsewhere, same Magic wallet) would —
  // but Magic's iframe handshake measured 3-5s in practice, and EVERY
  // first-time player (no session to restore at all, the overwhelming
  // majority) sat through that same wait for nothing. Showing the wizard
  // immediately costs nothing for everyone else, and this still catches the
  // recoverable case within a few seconds for anyone slower than an instant
  // click through "BEGIN" — `onboarded` in the closure is the same guard
  // that blocks Onboarding's own onComplete from mattering twice.
  useEffect(() => {
    if (mode.id !== "foxglade" || onboarded || !magicConfigured()) return;
    let cancelled = false;
    (async () => {
      await useWallet.getState().restore();
      const address = useWallet.getState().address;
      const server = address ? await pullOnboarding(address) : null;
      if (cancelled || !server?.hasOnboarded) return;
      writeOnboarding({ hasOnboarded: true, heroId: "man", eggVariant: server.eggVariant, completedAt: server.completedAt });
      setOnboarded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.id, onboarded]);

  if (mode.id === "foxglade" && !onboarded) {
    return <Onboarding onComplete={() => setOnboarded(true)} />;
  }

  return (
    <>
      <Canvas
        shadows
        dpr={q.dpr}
        gl={{ antialias: q.antialias, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.82 }}
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
            bloom={q.bloom && !degraded && !perfOff("noBloom")}
            shadows={q.shadows && !degraded && !perfOff("noShadows")}
            shadowSize={q.shadowSize}
            dressing={q.dressing}
            degraded={degraded}
          />
          <PlayerController />
          {/* Must come AFTER PlayerController: both write runtime.muzzlePos, and
              in first person the visible barrel is the viewmodel's, not the
              hidden rig's. Sibling order is what puts its useFrame second. */}
          <ViewModel />
          {!perfOff("noFox") && mode.fox && <FoxCompanion />}
          {/* Link shaders while the map is up, not mid-firefight. */}
          <ShaderWarmup />
        </Suspense>
        {/* Reads game state → schedules audio cues (outside Suspense so it runs
            even while assets stream in). */}
        <AudioDriver />
        {/* Auto-scale render resolution to hold framerate: AdaptiveDpr lowers the
            pixel ratio under load. If a machine STILL can't cope after that,
            PerformanceMonitor.onDecline latches degraded mode (shadows + bloom off). */}
        <PerformanceMonitor onDecline={() => setDegraded(true)} />
        <AdaptiveDpr pixelated />
        {/* Perf readout (FPS/ms). Opt-in via ?stats — it was shipping on by
            default, a cyan dev graph pinned over the fox status in the corner of
            every screenshot and every player's first impression. */}
        {debugStats && <Stats />}
        <PerfProbe />
      </Canvas>
      <Hud />
      <WalletButton />
      <Tutorial />
      <Minimap />
      <Shop />
      <ArmorySelect />
      <Profile />
      <Bank />
      <HelpCenter />
      <Terms />
      <TutorialBrief />
      <HamburgerMenu />
      <Pause />
      {mobile && <MobileControls />}
      {/* Opening map + first-run teaching. Last in the tree so it sits above the
          HUD and the touch controls. */}
      <MapScreen />
      {/* DOM loading screen with a progress bar until assets are ready. */}
      <Loader
        containerStyles={{ background: "#1a140f" }}
        barStyles={{ background: "#f2c14e", height: 4 }}
        dataStyles={{ color: "#e8dcc6", fontSize: 13, fontFamily: "system-ui, sans-serif", letterSpacing: 1 }}
        dataInterpolation={(p) =>
          mode.firstPerson ? `Inserting… ${p.toFixed(0)}%` : `Entering the village… ${p.toFixed(0)}%`
        }
      />
    </>
  );
}
