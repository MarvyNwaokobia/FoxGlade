import * as THREE from "three";

/**
 * What the fox remembers — the part of it that isn't a number on the HUD.
 *
 * Growth used to buy exactly one thing: `sniffCooldownMult`, 1.0 down to 0.5. So
 * the companion the entire game is pitched on was, mechanically, a cooldown timer
 * with fur. Nothing it did could disappoint you, so nothing it did could matter
 * to you either, and the raise-it loop was a progress bar wearing an animal.
 *
 * The fix isn't more art. It's that a young fox is WRONG sometimes, and that it
 * gets less wrong in places it has been before. Both halves are needed:
 *
 *  - Fallibility makes its judgement a thing you weigh. A kit that points you
 *    confidently at a decoy costs you a chapter, and the day you stop
 *    double-checking it is the day it earned that.
 *  - Memory makes the improvement FELT and specific rather than a stat line. It
 *    isn't "12% better", it's "it's been to that nook before, it knows".
 *
 * The memory persists across runs, because a companion that forgets you every
 * session isn't one.
 */

const KEY = "foxglade.fox.memory.v1";
/** Two nooks within this many metres count as the same place. */
const SAME_SPOT = 4;
/** Danger the fox has genuinely forgotten (ms). It holds a grudge for a while. */
const DANGER_TTL = 20 * 60 * 1000;

export interface Remembered {
  x: number;
  z: number;
  /** How many times it has been here. Repetition is what makes it certain. */
  count: number;
}

export interface DangerMark {
  x: number;
  z: number;
  /** Date.now the player went down here. */
  at: number;
}

interface Memory {
  /** Treasure nooks the fox has personally stood on. */
  spots: Remembered[];
  /** Places it watched you go down. */
  danger: DangerMark[];
}

const memory: Memory = { spots: [], danger: [] };
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Memory>;
    if (Array.isArray(parsed.spots)) memory.spots = parsed.spots.filter((s) => typeof s?.x === "number");
    if (Array.isArray(parsed.danger)) memory.danger = parsed.danger.filter((d) => typeof d?.x === "number");
  } catch {
    // A corrupt or unavailable store is not worth a crash — it just means a fox
    // that hasn't learned anything yet.
  }
}

function save(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private mode, quota — same deal. */
  }
}

function near(a: { x: number; z: number }, x: number, z: number): boolean {
  return Math.hypot(a.x - x, a.z - z) <= SAME_SPOT;
}

/** The fox stood on a real treasure here. */
export function rememberSpot(x: number, z: number): void {
  load();
  const hit = memory.spots.find((s) => near(s, x, z));
  if (hit) hit.count++;
  else memory.spots.push({ x, z, count: 1 });
  save();
}

/** How well it knows a nook: 0 = never been, rising with visits, capped at 1. */
export function spotFamiliarity(x: number, z: number): number {
  load();
  const hit = memory.spots.find((s) => near(s, x, z));
  if (!hit) return 0;
  return Math.min(1, hit.count / 3);
}

/** The player went down here. The fox saw it. */
export function rememberDanger(x: number, z: number): void {
  load();
  const now = Date.now();
  const hit = memory.danger.find((d) => near(d, x, z));
  if (hit) hit.at = now;
  else memory.danger.push({ x, z, at: now });
  // Only the recent ones are worth carrying.
  memory.danger = memory.danger.filter((d) => now - d.at < DANGER_TTL).slice(-12);
  save();
}

/** Is this somewhere the fox watched you go down recently? */
export function isDangerous(x: number, z: number): boolean {
  load();
  const now = Date.now();
  return memory.danger.some((d) => now - d.at < DANGER_TTL && near(d, x, z));
}

/** Everything it knows (for tests and the map screen). */
export function foxMemorySnapshot(): Memory {
  load();
  return { spots: [...memory.spots], danger: [...memory.danger] };
}

/** Wipe it — a fresh fox. */
export function forgetEverything(): void {
  loaded = true;
  memory.spots = [];
  memory.danger = [];
  save();
}

/**
 * Does the fox read the board correctly this time?
 *
 * `misread` is the growth stage's base error rate; familiarity with the nook it
 * would be pointing at cuts that error. A Prime fox is never wrong; a kit is
 * wrong nearly half the time until it has learned the village.
 */
export function scoutIsCorrect(misread: number, familiarity: number, roll = Math.random()): boolean {
  const chance = misread * (1 - 0.7 * familiarity);
  return roll >= chance;
}

/** Pick a decoy slot for a misread, given which slots are still live. */
export function pickWrongSlot(candidates: number[], roll = Math.random()): number | null {
  if (!candidates.length) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
}

/** Nearest remembered danger within `range` of a point, or null. */
export function nearestDanger(pos: THREE.Vector3, range: number): DangerMark | null {
  load();
  const now = Date.now();
  let best: DangerMark | null = null;
  let bestD = range;
  for (const d of memory.danger) {
    if (now - d.at >= DANGER_TTL) continue;
    const dist = Math.hypot(d.x - pos.x, d.z - pos.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}
