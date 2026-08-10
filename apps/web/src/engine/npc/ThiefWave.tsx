"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Thief } from "./Thief";
import { THIEF } from "@/engine/config/round";
import { useGame } from "@/engine/store";
import { CHAPTERS } from "@/engine/config/day";
import { runtime } from "@/engine/runtime";
import { thieves } from "./thieves";

/**
 * The thieves that contest the treasure with you.
 *
 * These used to be handed hardcoded waypoint lists ending at the old fixed hint
 * coordinates — which Phase 5's reseeding board silently invalidated, so they'd
 * been racing to empty ground. They now only need to be told WHERE THEY COME IN;
 * each one finds the real treasure and routes to it on its own.
 *
 * Entries are spread around the wall so the threat doesn't always arrive from
 * the same direction, and each gets a different stagger — the first blip on your
 * compass is the alarm, and the later ones are the punishment for dawdling.
 *
 * ROLLING SPAWNS. This component used to render exactly three <Thief> elements,
 * once, and that was the whole race: they mounted when Dusk began, launched
 * inside fifteen seconds, and once each had died or escaped it unmounted itself
 * and nothing ever replaced it. Twenty seconds into Dusk the contest was over
 * and the rest of the run — including all of Night — was uncontested. Each
 * thief now carries a unique id, and a new one is dispatched on a timer for as
 * long as the chapter says the race is on.
 */
const ENTRIES: [number, number][] = [
  [33, 30], // south-east, by the gate road
  [-33, 26], // south-west corner
  [-13, -34], // over the north wall, behind you
  [34, -6], // east lane
];

interface Runner {
  id: number;
  entry: [number, number];
  delay: number;
}

export function Thieves() {
  const chapter = useGame((s) => s.chapter);
  const roundNonce = useGame((s) => s.roundNonce);
  const racing = !!CHAPTERS[chapter]?.thieves;
  const night = chapter >= CHAPTERS.length - 1;

  const [runners, setRunners] = useState<Runner[]>([]);
  const nextId = useRef(0);
  const clock = useRef(0);

  // A new run wipes the field.
  useEffect(() => {
    setRunners([]);
    nextId.current = 0;
    clock.current = 0;
  }, [roundNonce]);

  // The opening wave arrives on THIEF.starts, exactly as before — the staggered
  // first three are what teach you to read the compass blips.
  useEffect(() => {
    if (!racing) return;
    setRunners((cur) => {
      if (cur.length > 0 || nextId.current > 0) return cur;
      return THIEF.starts.map((delay, i) => {
        const id = nextId.current++;
        return { id, entry: ENTRIES[i % ENTRIES.length], delay };
      });
    });
  }, [racing]);

  useFrame((_, rawDt) => {
    if (!racing || runtime.paused) return;
    if (useGame.getState().roundState !== "playing") return;
    // Only count down while the village is under-manned; a full field shouldn't
    // bank up a queue of reinforcements to dump the moment you clear it.
    if (thieves.size >= THIEF.maxLive) {
      clock.current = 0;
      return;
    }
    clock.current += Math.min(rawDt, 1 / 30);
    const gap = night ? THIEF.respawnDelayNight : THIEF.respawnDelay;
    if (clock.current < gap) return;
    clock.current = 0;
    const id = nextId.current++;
    setRunners((cur) => [
      // Drop the ones that have finished so the list can't grow without bound
      // over a long run; a Thief unmounts itself out of `thieves` when it goes.
      ...cur.slice(-8),
      { id, entry: ENTRIES[id % ENTRIES.length], delay: 0 },
    ]);
  });

  if (!racing) return null;
  return (
    <>
      {runners.map((r) => (
        <Thief key={r.id} entry={r.entry} startDelay={r.delay} />
      ))}
    </>
  );
}
