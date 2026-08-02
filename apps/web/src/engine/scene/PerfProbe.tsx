"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { thieves } from "@/engine/npc/thieves";
import { HINTS } from "@/engine/world/hints";

/**
 * Dev-only: publishes the renderer + scene on `window.__foxglade` so a headless
 * profiling run can read `renderer.info` (draw calls, triangles, programs) and
 * walk the scene graph. Renders nothing and is stripped in production.
 */
export function PerfProbe() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__foxglade = { gl, scene, camera, useGame, runtime, thieves, HINTS };
  }, [gl, scene, camera]);
  return null;
}
