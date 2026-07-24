"use client";

import { Village } from "@/engine/world/VillageMesh";
import { Blockers } from "@/engine/npc/Blockers";
import { Distractors } from "@/engine/npc/Distractors";
import { Thieves } from "@/engine/npc/ThiefWave";
import { Environment } from "@react-three/drei";
import { Projectiles } from "@/engine/combat/ProjectileLayer";
import { Bombs } from "@/engine/combat/BombLayer";
import { Interiors } from "@/engine/world/Interiors";
import { Props } from "@/engine/world/Props";
import { Atmosphere } from "@/engine/world/Atmosphere";
import { PostFX } from "@/engine/scene/PostFX";
import { THEME } from "@/engine/world/theme";
import { useGame } from "@/engine/store";

/**
 * Lighting rig + the village. Kept separate from the world geometry so the
 * lights/atmosphere can be tuned without touching the layout.
 */
export function VillageScene() {
  // Remount all NPCs on restart (revives blockers, distractors, thief).
  const roundNonce = useGame((s) => s.roundNonce);
  return (
    <>
      {/* Real dusk sky + image-based lighting from a CC0 HDRI (Poly Haven).
          `background` shows the photographic sky; it also lights every surface. */}
      <Environment files="/env/dusk_2k.hdr" background backgroundBlurriness={0} environmentIntensity={1.0} />
      {/* Warm haze so far buildings melt into the horizon, matching the sky */}
      <fog attach="fog" args={[THEME.fog, THEME.fogNear, THEME.fogFar]} />
      {/* A low warm key light for the crisp shadows the HDRI alone can't cast */}
      <directionalLight
        position={[38, 20, 14]}
        color={THEME.sunColor}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
      />
      <Village />
      <Interiors />
      <Props />
      <Atmosphere />
      <group key={roundNonce}>
        <Blockers />
        <Distractors />
        <Thieves />
      </group>
      <Projectiles />
      <Bombs />
      <PostFX />
    </>
  );
}
