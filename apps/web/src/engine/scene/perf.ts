/**
 * Dev-only performance instrumentation.
 *
 * Frame rate was swinging between ~20 and ~52 with no obvious cause, which is the
 * signature of something hitching rather than a uniformly heavy scene. Guessing at
 * that is how you spend a day optimising the wrong thing, so this exists to make
 * the cost of each subsystem measurable: `?perf=noBloom,noShadows` etc. disables
 * one piece at a time so a headless run can A/B them and read the difference.
 *
 * Everything here compiles out to a no-op in production.
 */

export type PerfFlag =
  | "noBloom" // skip the post-processing pass (bloom + vignette)
  | "noShadows" // directional light stops casting
  | "noProps" // skip outdoor set-dressing props
  | "noNpc" // skip blockers / distractors / thieves
  | "noFox" // skip the fox companion
  | "noBuildings"; // skip the realistic building models

const FLAGS: Set<string> = (() => {
  if (process.env.NODE_ENV === "production" || typeof location === "undefined") return new Set();
  const raw = new URLSearchParams(location.search).get("perf");
  return new Set(raw ? raw.split(",").map((s) => s.trim()) : []);
})();

export function perfOff(flag: PerfFlag): boolean {
  return FLAGS.has(flag);
}

/** True when any perf flag is active — handy for labelling a capture. */
export function perfActive(): boolean {
  return FLAGS.size > 0;
}
