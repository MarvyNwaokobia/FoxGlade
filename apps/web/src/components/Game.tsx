"use client";

import { Canvas } from "@react-three/fiber";
import { PlayerController } from "@/engine/player/PlayerController";
import { FoxCompanion } from "@/engine/fox/FoxCompanion";
import { GrayboxScene } from "@/engine/scene/GrayboxScene";
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
          gl.setClearColor("#0b0d10");
          scene.fog = null;
        }}
      >
        <GrayboxScene />
        <PlayerController />
        <FoxCompanion />
      </Canvas>
      <Hud />
    </>
  );
}
