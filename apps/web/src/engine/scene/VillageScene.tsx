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
import { useGame } from "@/engine/store";

/**
 * Lighting rig + the village. Kept separate from the world geometry so the
 * lights/atmosphere can be tuned without touching the layout.
 */
export function VillageScene({
  bloom = true,
  shadowSize = 2048,
  degraded = false,
}: {
  bloom?: boolean;
  shadowSize?: number;
  degraded?: boolean;
}) {
  // Remount all NPCs on restart (revives blockers, distractors, thief).
  const roundNonce = useGame((s) => s.roundNonce);
  return (
    <>
      {/* Real CC0 daytime sky (partly cloudy) as the BACKGROUND — realistic
          clouds, no fake sun disc. environmentIntensity kept low so surfaces get
          a little sky fill but DON'T turn shiny (that was the old problem). */}
      <Environment
        files="/env/day_clouds_2k.hdr"
        background
        backgroundIntensity={1.0}
        environmentIntensity={0.3}
      />
      {/* Light daytime haze so far buildings melt into the horizon */}
      <fog attach="fog" args={["#c3ccd6", 55, 175]} />
      {/* Bright sky/ground fill so characters aren't murky in the shade */}
      <ambientLight intensity={0.45} />
      <hemisphereLight color="#cfe0f2" groundColor="#6a5b48" intensity={1.0} />
      {/* Daytime sun casting the shadows */}
      <directionalLight
        position={[38, 26, 14]}
        color="#fff4e0"
        intensity={2.4}
        castShadow={!degraded}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />
      <Village />
      <Interiors />
      {/* Set-dressing props are cut on struggling machines (Valor's approach). */}
      {!degraded && <Props />}
      <Atmosphere />
      <group key={roundNonce}>
        <Blockers />
        <Distractors />
        <Thieves />
      </group>
      <Projectiles />
      <Bombs />
      {/* Post-processing (bloom + vignette) is a heavy full-screen pass — gated
          by the quality setting (off on Low/Med, on for High). */}
      {bloom && <PostFX />}
    </>
  );
}
