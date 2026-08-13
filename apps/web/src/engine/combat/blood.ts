import * as THREE from "three";

/**
 * Blood on a landed body hit (Valor's ImpactFX `surface: 'flesh'` +
 * `bloodSplash()`, ported to FoxGlade's simpler pooled-mesh VFX style rather
 * than its instanced-shader particle layers — same read, plainer pipeline).
 *
 * Every hit that lands on a body sprays; a KILLING hit sprays harder and
 * leaves a pool (see bloodStains.ts). Direction matters: most of it kicks
 * back toward the shooter (the visible side), a tighter "through" spray keeps
 * going the other way, and a fine mist hangs a moment longer than either —
 * three emissions off one spawn, not one particle burst.
 */
export interface BloodBurst {
  pos: THREE.Vector3; // impact point
  backDir: THREE.Vector3; // unit vector back toward the shooter (planar)
  lethal: boolean; // killing blow — bigger burst, triggers a pool decal
  at: number; // performance.now spawned (very negative = unused)
}

export const MAX_BLOOD = 14;

export const bloodPool: BloodBurst[] = Array.from({ length: MAX_BLOOD }, () => ({
  pos: new THREE.Vector3(),
  backDir: new THREE.Vector3(0, 0, 1),
  lethal: false,
  at: -1e9,
}));

let cursor = 0;
const _scratch = new THREE.Vector3();

/** Record a body hit for the BloodFX layer to draw from this frame onward. */
export function spawnBlood(pos: THREE.Vector3, shooterPos: THREE.Vector3, lethal: boolean) {
  const b = bloodPool[cursor];
  cursor = (cursor + 1) % MAX_BLOOD;
  b.pos.copy(pos);
  _scratch.copy(shooterPos).sub(pos);
  _scratch.y = 0;
  if (_scratch.lengthSq() > 1e-6) b.backDir.copy(_scratch.normalize());
  else b.backDir.set(0, 0, 1);
  b.lethal = lethal;
  b.at = performance.now();
}
