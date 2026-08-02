"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";

/**
 * Village life: a hammer somewhere, a dog, a murmur of conversation you can't
 * quite place.
 *
 * The town looked inhabited and sounded abandoned — the only things you ever
 * heard were gunshots and your own footsteps, which is why it read as a set
 * rather than a place. These are positional and sparse: each cue fires from a
 * real spot in the world, attenuated by distance, so walking around changes what
 * you can hear. That does more for "somewhere people live" than another building
 * model would.
 */

/** [x, z, cue, minGap, maxGap] — spots that sound like they're being worked. */
const SOURCES: [number, number, string, number, number][] = [
  [-19, 9, "chatter", 9, 18], // marketplace
  [-22, 6, "hammer", 11, 22], // market smith
  [-7, 20, "dogBark", 14, 30], // gate cottages
  [9, 25, "hammer", 13, 26], // south workshop
  [-26, -3, "chatter", 15, 30], // bank plaza
  [17, 15, "dogBark", 18, 38], // east lane
  [3, -7, "hammer", 16, 32], // central yard
];

/** How far a village cue carries. */
const NEAR = 7;
const FAR = 46;

export function VillageAmbience() {
  const clocks = useRef<number[]>(SOURCES.map(() => 2 + Math.random() * 12));

  useEffect(() => {
    // Nudge the first round of cues apart so they don't all land together.
    clocks.current = SOURCES.map((s, i) => 3 + i * 1.7 + Math.random() * 6);
  }, []);

  useFrame((_, rawDt) => {
    // Ambience holds while the world does — a paused street shouldn't keep
    // hammering, and the shop overlay shouldn't have a dog barking over it.
    if (runtime.paused || useGame.getState().roundState !== "playing") return;
    const dt = Math.min(rawDt, 1 / 30);
    for (let i = 0; i < SOURCES.length; i++) {
      clocks.current[i] -= dt;
      if (clocks.current[i] > 0) continue;
      const [x, z, cue, lo, hi] = SOURCES[i];
      clocks.current[i] = lo + Math.random() * (hi - lo);
      // Skip anything too far to be heard — no point scheduling silence.
      if (Math.hypot(x - runtime.playerPos.x, z - runtime.playerPos.z) > FAR) continue;
      audio.playAt(cue, x, z, NEAR, FAR, 0.55);
    }
  });

  return null;
}
