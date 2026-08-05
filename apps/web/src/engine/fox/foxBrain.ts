import * as THREE from "three";
import { FOX, foxGrowthFor } from "@/engine/config/fox";
import { pickWrongSlot, scoutIsCorrect, spotFamiliarity } from "./foxMemory";
import { runtime } from "@/engine/runtime";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { HINTS } from "@/engine/world/hints";
import { COLLIDERS } from "@/engine/world/village";
import { resolveColliders } from "@/engine/world/collision";

/**
 * The fox's decision layer, kept out of the render component.
 *
 * FoxCompanion used to be one lerp toward a fixed offset — which is why the fox
 * read as an attached prop rather than an animal. This owns the actual behaviour:
 * where it wants to be, what it's been sent to do, and how it gets there around
 * walls. The component just draws whatever this decides.
 */

export type FoxState = "heel" | "scout" | "attack" | "down";

/** Per-target stagger the fox applies on a successful lunge. */
export interface FoxStagger {
  /** performance.now until which a blocker can't fire. */
  blockerUntil: number;
  /** performance.now until which a thief is slowed, and by how much. */
  thiefUntil: number;
}
export const foxStagger: Map<Enemy, FoxStagger> = new Map();

/** Is this enemy currently pinned by the fox? (Blockers: can't shoot.) */
export function foxPinnedBlocker(e: Enemy): boolean {
  const s = foxStagger.get(e);
  return !!s && performance.now() < s.blockerUntil;
}
/** Speed multiplier for a thief the fox has latched onto. */
export function foxThiefSpeedMult(e: Enemy): number {
  const s = foxStagger.get(e);
  return s && performance.now() < s.thiefUntil ? (FOX.slowThief as number) : 1;
}

const _v = new THREE.Vector3();
const _probe = new THREE.Vector3();

/** Headings tried when the direct route is blocked (same trick the blockers use). */
const PROBES = [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7, 2.6, -2.6];

/**
 * Steer `pos` toward `target` at `speed`, sliding around walls rather than
 * grinding into them. Returns the distance actually covered this step.
 *
 * The scoring here is the whole trick, and it is easy to get wrong: candidate
 * headings are ranked by how much CLOSER TO THE TARGET they get you, not by how
 * far they travel along their own direction. Ranking by raw travel looks
 * reasonable and fails badly — a heading pointing straight back the way you came
 * is completely unobstructed, so it scores full marks. The result is an agent
 * that walks into a wall, turns around, walks back, turns around, and vibrates
 * on the spot forever. Measuring progress toward the goal makes retreating score
 * negative, which is exactly what you want.
 */
export function steerTowards(
  pos: THREE.Vector3,
  target: THREE.Vector3,
  speed: number,
  dt: number,
  radius = 0.28
): number {
  _v.set(target.x - pos.x, 0, target.z - pos.z);
  const dist = _v.length();
  if (dist < 1e-4) return 0;
  _v.multiplyScalar(1 / dist);
  const step = Math.min(speed * dt, dist);
  const sx = pos.x;
  const sz = pos.z;
  let bestX = 0;
  let bestZ = 0;
  let bestGain = 1e-4; // must make real progress, or we don't move at all
  for (const fan of PROBES) {
    const c = Math.cos(fan);
    const s = Math.sin(fan);
    const tx = _v.x * c - _v.z * s;
    const tz = _v.x * s + _v.z * c;
    _probe.set(sx + tx * step, 0, sz + tz * step);
    resolveColliders(_probe, radius, COLLIDERS);
    const gain = dist - Math.hypot(target.x - _probe.x, target.z - _probe.z);
    if (gain > bestGain) {
      bestGain = gain;
      bestX = _probe.x - sx;
      bestZ = _probe.z - sz;
    }
    if (gain > step * 0.9) break; // clean run at the target — stop looking
  }
  pos.x = sx + bestX;
  pos.z = sz + bestZ;
  return Math.hypot(bestX, bestZ);
}

/**
 * Where the fox BELIEVES the treasure is.
 *
 * Note the verb. This used to return the real one, always, unconditionally — the
 * fox was an oracle, and an oracle you can consult on a cooldown isn't a
 * companion, it's a hint button. Now a young fox can be honestly wrong: it reads
 * the board, and its judgement improves with growth and with how well it knows
 * the particular nook (fox/foxMemory.ts).
 *
 * It never knows it's wrong. It runs there, holds, and barks exactly the same —
 * which is the whole point, because that's what makes a Prime fox worth raising.
 */
export function findScoutTarget(villeEarned: number): THREE.Vector3 | null {
  const live = (i: number) => !runtime.hintStolen[i] && !runtime.hintClaimed[i];
  let realIdx = -1;
  const decoys: number[] = [];
  for (let i = 0; i < HINTS.length; i++) {
    if (!live(i)) continue;
    if (HINTS[i].real) realIdx = i;
    else if (!runtime.hintSilenced[i]) decoys.push(i);
  }
  if (realIdx < 0) return null;

  const growth = foxGrowthFor(villeEarned);
  const familiar = spotFamiliarity(HINTS[realIdx].pos.x, HINTS[realIdx].pos.z);
  // Cloned, not the live HINTS Vector3: reseedHints() rewrites those objects IN
  // PLACE (a new board mid-chapter, or the very resolution this scout is about to
  // cause), so holding the reference would let the fox's destination teleport out
  // from under it mid-run and send it chasing the new board forever.
  if (scoutIsCorrect(growth.misreadChance, familiar)) return HINTS[realIdx].pos.clone();

  const wrong = pickWrongSlot(decoys);
  // With no decoy left to be confused by, an unsure fox just gets it right.
  return wrong === null ? HINTS[realIdx].pos.clone() : HINTS[wrong].pos.clone();
}

/** Nearest threat to the player the fox could be sent at (blockers + thieves). */
export function findAttackTarget(): Enemy | null {
  let best: Enemy | null = null;
  let bestD: number = FOX.attackAcquireRange;
  for (const e of enemies) {
    if (e.kind === "distractor") continue; // it's not going to maul a civilian
    const p = e.getPosition();
    const d = Math.hypot(p.x - runtime.playerPos.x, p.z - runtime.playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Land a lunge: stagger a blocker, or slow a thief. */
export function applyLunge(target: Enemy) {
  const now = performance.now();
  foxStagger.set(target, {
    blockerUntil: target.kind === "blocker" ? now + FOX.staggerBlocker * 1000 : 0,
    thiefUntil: target.kind === "thief" ? now + FOX.slowThiefTime * 1000 : 0,
  });
}

/** Drop stagger entries whose enemies are gone, so the map can't grow forever. */
export function pruneStagger() {
  for (const e of foxStagger.keys()) if (!enemies.has(e)) foxStagger.delete(e);
}
