"use client";

import { Distractor } from "./Distractor";
import { HINTS } from "@/engine/world/hints";
import { useGame } from "@/engine/store";
import { CHAPTERS } from "@/engine/config/day";

/**
 * The village's talkers.
 *
 * There used to be exactly one per decoy hint, every one of them lying — so once
 * you'd been burned twice the correct play was to ignore all dialogue forever,
 * and the deduction layer evaporated. Now they're posted around the map
 * independently of the hints, and roughly a THIRD of them are honest, which is
 * what forces you to actually weigh what you're told instead of applying a rule.
 *
 * (The fox is the tiebreaker: it can't lie, so a villager who contradicts it is
 * exposed. That's the knot Phase 6's guardian pulls tight.)
 */
const POSTS: { at: [number, number, number]; truthful: boolean }[] = [
  { at: [-4.5, 0, 16], truthful: true }, // near the gate road — an honest first contact
  { at: [8, 0, 3], truthful: false }, // main street
  { at: [-14, 0, -6], truthful: false }, // west approach
  { at: [18, 0, -4], truthful: true }, // east courtyard
  { at: [-2, 0, -14], truthful: false }, // deep-north approach
  { at: [12, 0, -22], truthful: false }, // north-east
];

export function Distractors() {
  const chapter = useGame((s) => s.chapter);
  // Liars don't show up until the chapter that introduces deception. Early on
  // every villager you meet is honest — you learn that people here are worth
  // listening to, and only THEN does the game start lying to you. Introducing
  // both at once just teaches "ignore everyone", which is what the old build did.
  const liarsOut = CHAPTERS[chapter]?.liars ?? true;
  const active = POSTS.filter((p) => p.truthful || liarsOut);
  return (
    <>
      {active.map((p, i) => (
        <Distractor
          key={i}
          position={p.at}
          // Silencing one still removes a decoy ping; map each villager onto a
          // hint slot so that behaviour is unchanged.
          hintIndex={i % HINTS.length}
          truthful={p.truthful}
        />
      ))}
    </>
  );
}
