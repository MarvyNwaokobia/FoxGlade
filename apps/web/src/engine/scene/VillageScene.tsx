"use client";

import { Village } from "@/engine/world/VillageMesh";
import { Blockers } from "@/engine/npc/Blockers";

/**
 * Lighting rig + the village. Kept separate from the world geometry so the
 * lights/atmosphere can be tuned without touching the layout.
 */
export function VillageScene() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#c4d6e6", "#3a3e42", 0.85]} />
      <directionalLight
        position={[30, 45, 20]}
        intensity={1.45}
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
      <Blockers />
    </>
  );
}
