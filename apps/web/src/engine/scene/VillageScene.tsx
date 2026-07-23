"use client";

import { Village } from "@/engine/world/VillageMesh";

/**
 * Lighting rig + the village. Kept separate from the world geometry so the
 * lights/atmosphere can be tuned without touching the layout.
 */
export function VillageScene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#9fb8cc", "#181c20", 0.55]} />
      <directionalLight
        position={[30, 45, 20]}
        intensity={1.15}
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
    </>
  );
}
