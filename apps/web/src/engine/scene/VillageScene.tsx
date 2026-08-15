"use client";

import { Village } from "@/engine/world/VillageMesh";
import { Blockers } from "@/engine/npc/Blockers";
import { Distractors } from "@/engine/npc/Distractors";
import { Thieves } from "@/engine/npc/ThiefWave";
import { Merchant } from "@/engine/npc/Merchant";
import { Guardian } from "@/engine/npc/Guardian";
import { VillageAmbience } from "@/engine/audio/VillageAmbience";
import { Projectiles } from "@/engine/combat/ProjectileLayer";
import { ShotFX } from "@/engine/combat/ShotFxLayer";
import { DecalFX } from "@/engine/combat/DecalFxLayer";
import { BloodFX } from "@/engine/combat/BloodFxLayer";
import { BloodStainFX } from "@/engine/combat/BloodStainFxLayer";
import { DustFX } from "@/engine/combat/DustFxLayer";
import { Bombs } from "@/engine/combat/BombLayer";
import { Interiors } from "@/engine/world/Interiors";
import { Props } from "@/engine/world/Props";
import { Atmosphere } from "@/engine/world/Atmosphere";
import { PostFX } from "@/engine/scene/PostFX";
import { useGame } from "@/engine/store";
import { Daylight } from "@/engine/world/Daylight";
import { SkyDome } from "@/engine/world/SkyDome";
import { Horizon } from "@/engine/world/Horizon";
import { HouseDressing } from "@/engine/world/HouseDressing";
import { perfOff } from "@/engine/scene/perf";

/**
 * Lighting rig + the village. Kept separate from the world geometry so the
 * lights/atmosphere can be tuned without touching the layout.
 */
export function VillageScene({
  bloom = true,
  shadowSize = 2048,
  shadows = true,
  dressing = true,
  degraded = false,
}: {
  bloom?: boolean;
  shadowSize?: number;
  shadows?: boolean;
  /** Horizon/HouseDressing/Props — purely decorative, gated as one group by
   *  the device quality tier (see qualityPresets.ts). Separate from
   *  `degraded`, which additionally cuts Props reactively on ANY tier if a
   *  machine is struggling in the moment. */
  dressing?: boolean;
  degraded?: boolean;
}) {
  // Remount all NPCs on restart (revives blockers, distractors, thief).
  const roundNonce = useGame((s) => s.roundNonce);
  return (
    <>
      {/* The visible sky AND the scene's image-based lighting both come from
          here — <SkyDome> cross-fades a real day, dusk and night sky (so
          nightfall actually reads overhead) and builds scene.environment
          itself off the same loaded day HDRI, rather than a second
          <Environment> re-fetching and re-decoding the same file. */}
      <SkyDome />
      {/* Sun, sky, fog and ambient — all driven by the day clock (Daylight). */}
      <Daylight shadows={shadows && !degraded} shadowSize={shadowSize} />
      <Village />
      {/* Chimneys, dormers, lean-tos and painted trim, so twenty copies of one
          house mesh stop reading as twenty copies of one house mesh. Instanced. */}
      {dressing && !perfOff("noProps") && <HouseDressing />}
      {/* Hills, treeline and a ruined tower past the walls — so the world doesn't
          stop at a flat band of grass. Instanced; four draw calls all in. */}
      {dressing && !perfOff("noProps") && <Horizon />}
      <Interiors />
      {/* Set-dressing props are cut on struggling machines (Valor's approach),
          or outright on a low quality tier. */}
      {dressing && !degraded && !perfOff("noProps") && <Props />}
      <Atmosphere />
      {!perfOff("noNpc") && (
        <group key={roundNonce}>
          <Blockers />
          <Distractors />
          <Thieves />
        </group>
      )}
      {/* The trader lives outside the round group — he isn't part of a wave and
          shouldn't respawn when the round restarts. */}
      {!perfOff("noNpc") && <Merchant />}
      {/* One trusted voice per chapter. Outside the round group: it manages its
          own lifecycle off the chapter, not off NPC respawns. */}
      {!perfOff("noNpc") && <Guardian />}
      <VillageAmbience />
      <Projectiles />
      <ShotFX />
      <DecalFX />
      <BloodFX />
      <BloodStainFX />
      <DustFX />
      <Bombs />
      {/* Post-processing (bloom + vignette) is a heavy full-screen pass — gated
          by the quality setting (off on Low/Med, on for High). */}
      {bloom && <PostFX />}
    </>
  );
}
