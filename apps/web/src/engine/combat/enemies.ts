import * as THREE from "three";
import { BOXES3D } from "@/engine/world/village";
import { raycastBoxes } from "@/engine/world/collision";

/**
 * A shootable entity. NPCs register themselves here on mount and remove
 * themselves on death/unmount, so the hitscan has one place to test against.
 */
export interface Enemy {
  getPosition: () => THREE.Vector3; // ground position
  hitRadius: number; // shooting hit sphere (generous)
  hitHeight: number; // centre of the hit sphere above the ground position
  bodyRadius: number; // physical radius for movement collision (tighter)
  takeHit: (damage: number) => void;
}

export const enemies = new Set<Enemy>();

const GUN_DAMAGE = 1;
const GUN_RANGE = 70;

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

/**
 * Hitscan a shot from the camera's forward ray. Returns true if an enemy was hit
 * (used for the hitmarker). Shots are blocked by walls between the muzzle and
 * the target.
 */
export function fireHitscan(camera: THREE.Camera): boolean {
  const origin = camera.position.clone();
  const dir = camera.getWorldDirection(new THREE.Vector3());

  let best: Enemy | null = null;
  let bestT = GUN_RANGE;
  for (const e of enemies) {
    const center = e.getPosition().clone();
    center.y += e.hitHeight;
    const t = raySphere(origin, dir, center, e.hitRadius);
    if (t !== null && t < bestT) {
      bestT = t;
      best = e;
    }
  }
  if (!best) return false;

  // Blocked by a building before reaching the enemy?
  const hitPoint = origin.clone().addScaledVector(dir, bestT);
  if (raycastBoxes(origin, hitPoint, BOXES3D) < 1) return false;

  best.takeHit(GUN_DAMAGE);
  return true;
}
