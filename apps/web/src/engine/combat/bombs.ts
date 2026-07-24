import * as THREE from "three";
import { BOXES3D } from "@/engine/world/village";
import { FEEL } from "@/engine/config/feel";
import { BOMB } from "@/engine/config/round";
import { enemies } from "./enemies";

/**
 * Thrown bombs (DESIGN §2.4). A bomb is a lobbed projectile under the same
 * gravity as the player; it detonates on the first surface it touches (ground,
 * building, wall) or when its fuse runs out mid-air. The blast is a simple
 * sphere test — it does NOT check walls, so v1 blasts reach through cover
 * (revisit if it feels wrong).
 *
 * This module owns the simulation only. Player damage / treasure cracking are
 * applied by the caller via `stepBombs`' callback so this file never imports
 * the store (which imports config, which… stays acyclic).
 */
export interface Bomb {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  active: boolean;
}

export const MAX_BOMBS = 4;
export const bombPool: Bomb[] = Array.from({ length: MAX_BOMBS }, () => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, active: false,
}));

/** Recent detonations, kept briefly so the layer can animate the blast. */
export interface Explosion {
  x: number;
  y: number;
  z: number;
  at: number; // performance.now at detonation
}
export const MAX_EXPLOSIONS = 6;
export const explosions: Explosion[] = [];

const GROUND_Y = 0.12; // bomb "touches the ground" below this height

function pointInBoxes(x: number, y: number, z: number): boolean {
  for (const b of BOXES3D) {
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

/** Launch velocity from an aim direction: the shared throw model. */
function launchVelocity(aimDir: THREE.Vector3): THREE.Vector3 {
  return aimDir
    .clone()
    .add(new THREE.Vector3(0, BOMB.upBias, 0))
    .normalize()
    .multiplyScalar(BOMB.throwSpeed);
}

export function spawnBomb(origin: THREE.Vector3, aimDir: THREE.Vector3) {
  const b = bombPool.find((q) => !q.active);
  if (!b) return;
  const v = launchVelocity(aimDir);
  b.x = origin.x; b.y = origin.y; b.z = origin.z;
  b.vx = v.x; b.vy = v.y; b.vz = v.z;
  b.ttl = BOMB.fuse;
  b.active = true;
}

/**
 * Predict where a throw from `origin` along `aimDir` will land, by running the
 * exact same integration the live bomb uses — so the telegraph ring is honest.
 */
export function predictLanding(origin: THREE.Vector3, aimDir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const v = launchVelocity(aimDir);
  let x = origin.x, y = origin.y, z = origin.z;
  const dt = 1 / 60;
  for (let i = 0; i < BOMB.fuse * 60; i++) {
    v.y += FEEL.gravity * dt;
    const nx = x + v.x * dt, ny = y + v.y * dt, nz = z + v.z * dt;
    if (ny <= GROUND_Y || pointInBoxes(nx, ny, nz)) break;
    x = nx; y = ny; z = nz;
  }
  return out.set(x, Math.max(0, y), z);
}

function detonate(b: Bomb, onExplode: (center: THREE.Vector3) => void) {
  b.active = false;
  if (explosions.length >= MAX_EXPLOSIONS) explosions.shift();
  explosions.push({ x: b.x, y: b.y, z: b.z, at: performance.now() });

  const center = new THREE.Vector3(b.x, b.y, b.z);
  for (const e of enemies) {
    const p = e.getPosition();
    const dx = p.x - b.x;
    const dy = p.y + e.hitHeight - b.y;
    const dz = p.z - b.z;
    const r = BOMB.radius + e.hitRadius;
    if (dx * dx + dy * dy + dz * dz < r * r) e.takeHit(BOMB.enemyDamage);
  }
  onExplode(center);
}

/** Advance all live bombs; detonate on surface contact or fuse expiry. */
export function stepBombs(dt: number, onExplode: (center: THREE.Vector3) => void) {
  for (const b of bombPool) {
    if (!b.active) continue;
    b.vy += FEEL.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.ttl -= dt;
    if (b.y <= GROUND_Y || pointInBoxes(b.x, b.y, b.z) || b.ttl <= 0) {
      b.y = Math.max(GROUND_Y, b.y);
      detonate(b, onExplode);
    }
  }
}

/** Remove all live bombs and blast VFX (round restart). */
export function clearBombs() {
  for (const b of bombPool) b.active = false;
  explosions.length = 0;
}
