"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGame } from "@/engine/store";

/**
 * Compiles shaders BEFORE they're needed, instead of mid-firefight.
 *
 * A Chrome trace of ~18s of live combat put the cause of the hitching beyond
 * doubt, and it wasn't the game logic:
 *
 *   FireAnimationFrame   1936 events   5320ms total  →  2.75ms/frame average
 *   GC                   1699 events    272ms total  (~1.5% of wall time)
 *   GetProgramiv          149 events    185ms total, MAX 99ms   ← the hitch
 *
 * `GetProgramiv` is the driver being asked whether a shader program finished
 * linking, and it is SYNCHRONOUS — the CPU stops dead until the GPU answers. A
 * single one measured 99ms, which is six dropped frames from one call. Three.js
 * compiles a program the first time each unique material/light/geometry
 * combination is rendered, so these land exactly when something new walks
 * on-screen: a blocker waking up, a thief entering, the guardian appearing.
 * Which is precisely when you least want the game to stop.
 *
 * `renderer.compile()` walks the scene and links everything up front. Running it
 * while the map is open moves the whole stall into a moment that is already a
 * pause, and re-running it on each chapter change catches the NPCs that only
 * mount later (blockers at Morning, thieves at Dusk).
 */
export function ShaderWarmup() {
  const { gl, scene, camera } = useThree();
  const chapter = useGame((s) => s.chapter);
  const pending = useRef(true);
  const settle = useRef(0);

  useEffect(() => {
    // New chapter → new NPCs mounted → new programs to link. Warm again.
    pending.current = true;
    settle.current = 0;
  }, [chapter]);

  useFrame(() => {
    if (!pending.current) return;
    // Give the newly-mounted objects a frame or two to land in the graph;
    // compiling an incomplete scene just means compiling again later.
    settle.current++;
    if (settle.current < 3) return;
    pending.current = false;
    try {
      gl.compile(scene, camera);
    } catch {
      // Warmup is an optimisation, never a correctness requirement — if a driver
      // refuses, the game still runs, it just hitches the way it used to.
    }
  });

  return null;
}
