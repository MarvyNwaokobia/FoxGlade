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
import { RotateDevicePrompt } from "@/components/RotateDevicePrompt";
import { MapScreen } from "@/components/MapScreen";
import { Tutorial } from "@/components/Tutorial";
import { TutorialBrief } from "@/components/TutorialBrief";
import { Onboarding } from "@/components/Onboarding";
import { ConnectGate } from "@/components/ConnectGate";
import { loadOnboarding } from "@/engine/onboarding";
import { useWallet } from "@/engine/chain/wallet";
import { reconcileAccount } from "@/engine/chain/accountSync";
import { isTouchDevice } from "@/engine/input/touch";
import { PerfProbe } from "@/engine/scene/PerfProbe";
import { ShaderWarmup } from "@/engine/scene/ShaderWarmup";
import { perfOff } from "@/engine/scene/perf";
import { detectDeviceTier, qualityOverride } from "@/engine/scene/deviceTier";
import { QUALITY } from "@/engine/scene/qualityPresets";

// TEMP (Marvy, 2026-08-16): the mandatory connect gate off so the onboarding
// wizard can be tested on its own, without a wallet — flip back to true to
// restore the wallet-first flow. Onboarding itself is back to its normal,
// always-on behavior (see `onboarded` below).
const CONNECT_GATE_ENABLED = false;

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

  // Connecting is mandatory for Foxglade, ahead of onboarding itself (Marvy's
  // call, 2026-08-16) — every player has a wallet address from minute one,
  // not just optionally somewhere alongside the wizard. `restoring` covers
  // the one moment that would otherwise flash ConnectGate's form at a
  // returning player with a live session: true until the initial silent
  // restore() below — an already-authorized injected wallet, or a live Magic
  // session — has had its one chance to resolve, false forever after.
  const [restoring, setRestoring] = useState(true);
  const address = useWallet((s) => s.address);

  useEffect(() => {
    if (mode.id !== "foxglade") {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    // Bounded, not just awaited: this screen is a mandatory blocker now, and
    // restore()'s Magic leg is a real network round trip — a stalled or slow
    // connection must never leave a player stuck on "checking" forever. If it
    // lands late, `address` still updates reactively and carries them past
    // the gate on its own; this timeout only controls how long the form's
    // own buttons stay hidden behind the checking state.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    Promise.race([useWallet.getState().restore(), timeout]).finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.id]);

  // Reconcile local state against the server the moment an address is known
  // — from the silent restore() above, or from ConnectGate's email/wallet
  // buttons. Two directions (accountSync.ts): a fresh device adopts the
  // server's onboarding pick and progress; a device that already has a local
  // pick or save (anyone who played before this gate existed, connecting for
  // the first time) pushes it up, since neither was ever guaranteed to have
  // reached the server before now.
  useEffect(() => {
    if (mode.id !== "foxglade" || !address) return;
    let cancelled = false;
    reconcileAccount(address).then(() => {
      if (!cancelled) setOnboarded((prev) => prev || loadOnboarding().hasOnboarded);
    });
    return () => {
      cancelled = true;
    };
  }, [mode.id, address]);

  if (CONNECT_GATE_ENABLED && mode.id === "foxglade" && (restoring || !address)) {
    return <ConnectGate checking={restoring} />;
  }

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
      {/* Blocks play on a touch device held in portrait — zIndex 200, above
          everything else including the map. */}
      {mobile && <RotateDevicePrompt />}
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
