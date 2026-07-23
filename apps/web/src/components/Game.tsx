"use client";

import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { VillageScene } from "@/engine/scene/VillageScene";
import { Hud } from "@/components/Hud";

/**
 * Top-level game mount: the R3F canvas plus the DOM HUD overlay. Client-only
 * (imported with ssr:false from app/page.tsx).
 */
export default function Game() {
  return (
    <>
      <Canvas
        shadows
        gl={{ antialias: true }}
        camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 8] }}
        onCreated={({ scene, gl }) => {
          gl.setClearColor("#39434f"); // dusk sky, so the world isn't in a void
          scene.fog = new THREE.Fog("#39434f", 55, 150); // soft distance fade
        }}
      >
        <VillageScene />
        <PlayerController />
        <FoxCompanion />
      </Canvas>
      <Hud />
    </>
  );
}
