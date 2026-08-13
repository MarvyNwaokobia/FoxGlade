import * as THREE from "three";
import { BOXES3D } from "@/engine/world/village";
import { raycastBoxes } from "@/engine/world/collision";
import { GUN } from "@/engine/config/round";

/**
 * A shootable entity. NPCs register themselves here on mount and remove
 * themselves on death/unmount, so the hitscan has one place to test against.
 */
export type EnemyKind = "blocker" | "thief" | "distractor";

export interface Enemy {
  kind: EnemyKind; // what it is (the fox alerts to threats: blockers/thieves)
  getPosition: () => THREE.Vector3; // ground position
  hitRadius: number; // body hit sphere (generous)
  hitHeight: number; // centre of the body sphere above the ground position
  headHeight?: number; // centre of the head sphere (default: hitHeight + 0.6)
  headRadius?: number; // head sphere radius (default 0.28) — a hit here is a headshot
  bodyRadius: number; // physical radius for movement collision (tighter)
  /** Returns true if this hit was the killing blow — the blood system needs to
   *  know synchronously (a bigger pool burst on a kill vs a regular spray on a
   *  non-lethal hit), and React state isn't readable that fast. */
  takeHit: (damage: number) => boolean;
}

export const enemies = new Set<Enemy>();

/** Ray vs sphere; returns the near hit distance along `dir`, or null. */
function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, r: number): number | null {
  const oc = origin.clone().sub(center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Damage multiplier from range: full within falloffStart, → falloffMin by falloffEnd. */
function rangeFalloff(dist: number): number {
  if (dist <= GUN.falloffStart) return 1;
  if (dist >= GUN.falloffEnd) return GUN.falloffMin;
  const t = (dist - GUN.falloffStart) / (GUN.falloffEnd - GUN.falloffStart);
  return 1 - t * (1 - GUN.falloffMin);
}

/**
 * Hitscan a shot from the camera's forward ray. Tests each enemy's body AND head
 * spheres, applies range-falloff (and the headshot bonus) to the nearest hit, and
 * returns whether one was hit + whether it was a headshot + the impact `point`
 * (enemy / first wall / max range) so the ShotFX layer draws a tracer that stops
 * at what it hits.
 */
/**
 * Aim magnetism (touch only). A hitscan rifle aimed by thumb-drag will basically
 * never connect with a strafing NPC, so on touch the shot bends onto the nearest
 * enemy inside a narrow cone around where you're actually pointing. It's a bend,
 * not a snap: you still have to be roughly on target, and the tracer follows the
 * bent ray so the shot reads honestly.
 */
const ASSIST_CONE = Math.cos(THREE.MathUtils.degToRad(4.5)); // half-angle the assist covers
const ASSIST_MAX_RANGE = 45;

function assistedDirection(origin: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 {
  let best: THREE.Vector3 | null = null;
  let bestDot = ASSIST_CONE;
  const to = new THREE.Vector3();
  for (const e of enemies) {
    const gp = e.getPosition();
    to.set(gp.x, gp.y + e.hitHeight, gp.z).sub(origin);
    const dist = to.length();
    if (dist < 0.5 || dist > ASSIST_MAX_RANGE) continue;
    to.multiplyScalar(1 / dist);
    const d = to.dot(dir);
    if (d > bestDot) {
      // Don't magnetise onto something behind a wall.
      const far = origin.clone().addScaledVector(to, dist);
      if (raycastBoxes(origin, far, BOXES3D) < 1) continue;
      bestDot = d;
      best = to.clone();
    }
  }
  return best ?? dir;
}

/** Scratch — the wall-hit normal, filled in by raycastBoxes, read once per shot. */
const _wallNormal = new THREE.Vector3();

export function fireHitscan(
  camera: THREE.Camera,
  damageMult = 1,
  aimAssist = false,
): {
  hit: boolean;
  point: THREE.Vector3;
  headshot: boolean;
  wallNormal: THREE.Vector3 | null;
  /** True only when `hit` is a body hit AND it was the killing blow. */
  lethal: boolean;
} {
  const origin = camera.position.clone();
  let dir = camera.getWorldDirection(new THREE.Vector3());
  if (aimAssist) dir = assistedDirection(origin, dir);

  // Nearest hit across every enemy's body + head sphere.
  let best: Enemy | null = null;
  let bestT: number = GUN.range;
  let bestHead = false;
  const c = new THREE.Vector3();
  for (const e of enemies) {
    const gp = e.getPosition();
    c.set(gp.x, gp.y + e.hitHeight, gp.z);
    const tb = raySphere(origin, dir, c, e.hitRadius);
    if (tb !== null && tb < bestT) {
      bestT = tb;
      best = e;
      bestHead = false;
    }
    c.set(gp.x, gp.y + (e.headHeight ?? e.hitHeight + 0.6), gp.z);
    const th = raySphere(origin, dir, c, e.headRadius ?? 0.28);
    if (th !== null && th < bestT) {
      bestT = th;
      best = e;
      bestHead = true;
    }
  }

  // Distance to the first wall along the ray (the tracer stops at cover, and an
  // enemy behind a wall doesn't count).
  const far = origin.clone().addScaledVector(dir, GUN.range);
  const tWall = raycastBoxes(origin, far, BOXES3D, _wallNormal);
  const hitWall = tWall < 1;
  const wallDist = hitWall ? tWall * GUN.range : GUN.range;

  let hit = false;
  let headshot = false;
  let lethal = false;
  let endDist = wallDist;
  let stoppedAtWall = hitWall;
  if (best && bestT < wallDist) {
    hit = true;
    headshot = bestHead;
    endDist = bestT;
    stoppedAtWall = false;
    const dmg = GUN.damage * damageMult * (bestHead ? GUN.headshotMult : 1) * rangeFalloff(bestT);
    lethal = best.takeHit(dmg);
  }

  const point = origin.clone().addScaledVector(dir, endDist);
  return { hit, point, headshot, wallNormal: stoppedAtWall ? _wallNormal.clone() : null, lethal };
}
