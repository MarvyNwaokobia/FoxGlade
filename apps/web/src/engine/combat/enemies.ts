import * as THREE from "three";
import { BOXES3D } from "@/engine/world/village";
import { raycastBoxes } from "@/engine/world/collision";
import { GUN } from "@/engine/config/round";

/**
 * A shootable entity. NPCs register themselves here on mount and remove
 * themselves on death/unmount, so the hitscan has one place to test against.
 */
export interface Enemy {
  getPosition: () => THREE.Vector3; // ground position
  hitRadius: number; // body hit sphere (generous)
  hitHeight: number; // centre of the body sphere above the ground position
  headHeight?: number; // centre of the head sphere (default: hitHeight + 0.6)
  headRadius?: number; // head sphere radius (default 0.28) — a hit here is a headshot
  bodyRadius: number; // physical radius for movement collision (tighter)
  takeHit: (damage: number) => void;
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
export function fireHitscan(camera: THREE.Camera): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
  const origin = camera.position.clone();
  const dir = camera.getWorldDirection(new THREE.Vector3());

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
  const tWall = raycastBoxes(origin, far, BOXES3D);
  const wallDist = tWall < 1 ? tWall * GUN.range : GUN.range;

  let hit = false;
  let headshot = false;
  let endDist = wallDist;
  if (best && bestT < wallDist) {
    hit = true;
    headshot = bestHead;
    endDist = bestT;
    const dmg = GUN.damage * (bestHead ? GUN.headshotMult : 1) * rangeFalloff(bestT);
    best.takeHit(dmg);
  }

  const point = origin.clone().addScaledVector(dir, endDist);
  return { hit, point, headshot };
}
