"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Horde } from "./horde";
import { HordeMesh } from "./HordeMesh";

/**
 * Throwaway harness for the one question that decides whether Nights is
 * buildable at all: can this machine simulate and draw a crowd of this size at
 * frame rate, in a browser?
 *
 * Nothing here is game code. A point orbits the arena, the horde walks at it,
 * and the frame time is published where a headless run can read it.
 */
function Rig({ horde, count }: { horde: Horde; count: number }) {
  const t = useRef(0);
  const frames = useRef(0);
  const last = useRef(performance.now());

  // Fill to the requested size once.
  useMemo(() => {
    horde.clear();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 26;
      horde.spawn(Math.cos(a) * r, Math.sin(a) * r, 3);
    }
  }, [horde, count]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    t.current += dt;
    // A target that keeps moving, so the crowd never settles into a stable pile.
    const tx = Math.cos(t.current * 0.35) * 16;
    const tz = Math.sin(t.current * 0.5) * 16;
    horde.step(dt, tx, tz);

    frames.current++;
    const now = performance.now();
    if (now - last.current >= 1000) {
      const fps = (frames.current * 1000) / (now - last.current);
      const w = window as unknown as Record<string, unknown>;
      const log = (w.__spike as { fps: number[] } | undefined) ?? { fps: [] };
      log.fps.push(fps);
      w.__spike = log;
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

export function NightsSpike({ count = 300 }: { count?: number }) {
  const horde = useMemo(() => new Horde({ max: Math.max(count, 400) }), [count]);
  return (
    <Canvas
      camera={{ fov: 55, position: [0, 26, 30], near: 0.1, far: 200 }}
      gl={{ antialias: true }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor("#0a0c12");
        camera.lookAt(0, 0, 0);
      }}
      dpr={[1, 1.35]}
    >
      <hemisphereLight intensity={0.5} groundColor="#0a0c12" />
      <directionalLight position={[10, 20, 10]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[90, 90]} />
        <meshLambertMaterial color="#171b24" />
      </mesh>
      <HordeMesh horde={horde} />
      <Rig horde={horde} count={count} />
    </Canvas>
  );
}
