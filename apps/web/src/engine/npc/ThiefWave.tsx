"use client";

import { Thief } from "./Thief";
import { THIEF } from "@/engine/config/round";

/**
 * Three thieves racing the real treasure from different directions, with
 * staggered starts (THIEF.starts in config/round.ts) so pressure escalates
 * across the round rather than deciding it in the opening seconds.
 * Paths thread the open streets to the treasure at (0, -28).
 */
const EAST: [number, number, number][] = [
  [5, 0, 30],
  [5, 0, 16],
  [5, 0, 4],
  [0, 0, -10],
  [0, 0, -22],
  [0, 0, -28],
];
const WEST: [number, number, number][] = [
  [-22, 0, 28],
  [-22, 0, 8],
  [-14, 0, -2],
  [-6, 0, -14],
  [0, 0, -22],
  [0, 0, -28],
];
const CENTER: [number, number, number][] = [
  [-2, 0, 31],
  [-4, 0, 12],
  [-4, 0, 0],
  [0, 0, -12],
  [0, 0, -22],
  [0, 0, -28],
];

export function Thieves() {
  const paths = [EAST, WEST, CENTER];
  return (
    <>
      {THIEF.starts.map((start, i) => (
        <Thief key={i} path={paths[i % paths.length]} startDelay={start} />
      ))}
    </>
  );
}
