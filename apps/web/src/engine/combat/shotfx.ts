import * as THREE from "three";

/**
 * Cosmetic feedback for the player's hitscan shots. The shot itself is instant
 * (see enemies.ts); this is what SELLS it — a tracer streak from the muzzle to
 * the impact point, a muzzle flash at the origin, and an impact spark at the end.
 *
 * Pooled + ring-buffered (like projectiles.ts / bombs.ts) so the renderer stays
 * allocation-free at fire rate. PlayerController records a shot; ShotFX draws it.
 */
export interface Shot {
  from: THREE.Vector3; // muzzle (cosmetic — offset from the eye, not the camera)
  to: THREE.Vector3; // impact point (enemy / wall / max range)
  hit: boolean; // hit an enemy (vs wall / air) — tints the impact spark
  at: number; // performance.now the shot fired (very negative = unused)
}

export const MAX_SHOTS = 16;

export const shotPool: Shot[] = Array.from({ length: MAX_SHOTS }, () => ({
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  hit: false,
  at: -1e9,
}));

let cursor = 0;

/** Record a fired shot for the ShotFX layer to draw this frame onward. */
export function spawnShot(from: THREE.Vector3, to: THREE.Vector3, hit: boolean) {
  const s = shotPool[cursor];
  cursor = (cursor + 1) % MAX_SHOTS;
  s.from.copy(from);
  s.to.copy(to);
  s.hit = hit;
  s.at = performance.now();
}
