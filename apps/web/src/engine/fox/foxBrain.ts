import * as THREE from "three";
import { FOX } from "@/engine/config/fox";
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

/** The real, unclaimed, unstolen treasure the fox would lead you to (or null). */
export function findScoutTarget(): THREE.Vector3 | null {
  for (let i = 0; i < HINTS.length; i++) {
    if (HINTS[i].real && !runtime.hintStolen[i] && !runtime.hintClaimed[i]) return HINTS[i].pos;
  }
  return null;
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
