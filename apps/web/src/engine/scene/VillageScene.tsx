"use client";

import { Village } from "@/engine/world/VillageMesh";
import { Blockers } from "@/engine/npc/Blockers";
import { Distractors } from "@/engine/npc/Distractors";
import { Thieves } from "@/engine/npc/ThiefWave";
import { Projectiles } from "@/engine/combat/ProjectileLayer";
import { Bombs } from "@/engine/combat/BombLayer";
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
      {/* Dusk atmosphere: warm haze that fades the far buildings into the ridge */}
      <fog attach="fog" args={[THEME.fog, THEME.fogNear, THEME.fogFar]} />
      <ambientLight color={THEME.ambientColor} intensity={THEME.ambientIntensity} />
      <hemisphereLight args={[THEME.hemiSky, THEME.hemiGround, THEME.hemiIntensity]} />
      {/* Low, warm sun raking across the village (long dusk shadows) */}
      <directionalLight
        position={[38, 22, 14]}
        color={THEME.sunColor}
        intensity={THEME.sunIntensity}
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
      <group key={roundNonce}>
        <Blockers />
        <Distractors />
        <Thieves />
      </group>
      <Projectiles />
      <Bombs />
    </>
  );
}
