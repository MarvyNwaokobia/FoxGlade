"use client";

import { Thief } from "./Thief";
import { THIEF } from "@/engine/config/round";

/**
 * Three thieves with staggered starts (THIEF.starts in config/round.ts), each
 * racing ONE specific treasure through the organic layout: one runs the east
 * wall for the shallow common treasure, two converge on the deep rare nook
 * from the west wall and up the centre. Waypoints thread the streets.
 */
const EAST_TO_COMMON: [number, number, number][] = [
  [33, 0, 30],
  [33, 0, -2],
  [29, 0, -9],
  [23, 0, -11.5],
  [21.5, 0, -15],
];
const WEST_TO_RARE: [number, number, number][] = [
  [-33, 0, 28],
  [-33, 0, -10],
  [-28, 0, -20],
  [-27, 0, -33],
  [-14, 0, -34],
  [-9, 0, -31],
];
const CENTER_TO_RARE: [number, number, number][] = [
  [2, 0, 32],
  [2, 0, 16],
  [2, 0, 7],
  [0, 0, -3],
  [-3, 0, -12],
  [-6, 0, -22],
  [-9, 0, -31],
];

const RUNS: { path: [number, number, number][]; targetHint: number }[] = [
  { path: EAST_TO_COMMON, targetHint: 1 },
  { path: WEST_TO_RARE, targetHint: 0 },
  { path: CENTER_TO_RARE, targetHint: 0 },
];

export function Thieves() {
  return (
    <>
      {THIEF.starts.map((start, i) => {
        const run = RUNS[i % RUNS.length];
        return <Thief key={i} path={run.path} targetHint={run.targetHint} startDelay={start} />;
      })}
    </>
  );
}
