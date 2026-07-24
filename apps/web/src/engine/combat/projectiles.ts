import * as THREE from "three";
import { BOXES3D } from "@/engine/world/village";
import { runtime } from "@/engine/runtime";

/**
 * Enemy projectiles as a fixed pool (no per-frame allocation). Slow enough to be
 * dodged — you can sidestep them or break line of sight behind a building.
 */
export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  active: boolean;
}

export const MAX_PROJECTILES = 96;
const RADIUS = 0.14;
const PLAYER_HIT_RADIUS = 0.55;
const PLAYER_CHEST = 1.0;

export const projectilePool: Projectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, active: false,
}));

export function spawnProjectile(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, ttl = 3) {
  const p = projectilePool.find((q) => !q.active);
  if (!p) return;
  p.x = origin.x; p.y = origin.y; p.z = origin.z;
  p.vx = dir.x * speed; p.vy = dir.y * speed; p.vz = dir.z * speed;
  p.ttl = ttl;
  p.active = true;
}

function pointInBoxes(x: number, y: number, z: number): boolean {
  for (const b of BOXES3D) {
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

/**
 * Advance all active projectiles. Calls `onPlayerHit` when one reaches the
 * player. Projectiles die on hitting a wall, the ground, the player, or expiry.
 */
export function stepProjectiles(dt: number, onPlayerHit: () => void) {
  const px = runtime.playerPos.x;
  const py = runtime.playerPos.y + (runtime.crouching ? 0.6 : PLAYER_CHEST); // duck under shots
  const pz = runtime.playerPos.z;
  const hitR = RADIUS + PLAYER_HIT_RADIUS;

  for (const p of projectilePool) {
    if (!p.active) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.ttl -= dt;

    if (p.ttl <= 0 || p.y <= 0.05 || pointInBoxes(p.x, p.y, p.z)) {
      p.active = false;
      continue;
    }
    const dx = p.x - px, dy = p.y - py, dz = p.z - pz;
    if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
      p.active = false;
      onPlayerHit();
    }
  }
}
