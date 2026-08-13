import * as THREE from "three";

/**
 * Footstep dust (Valor's ImpactFX.scuff() — a cheap puff every stride, ported
 * to FoxGlade's simpler pooled-mesh style). Distance-gated, not timer-gated,
 * so the puffs land exactly where the feet do at any pace — see AudioDriver.tsx,
 * which already tracks ground distance for the footstep SOUND and spawns the
 * puff at the same trigger (one event, one place it's decided).
 */
export interface DustPuff {
  pos: THREE.Vector3;
  scale: number; // base size, m — walk vs run kick up different amounts
  at: number; // performance.now spawned (very negative = unused)
}

export const MAX_DUST = 10;

export const dustPool: DustPuff[] = Array.from({ length: MAX_DUST }, () => ({
  pos: new THREE.Vector3(),
  scale: 0.35,
  at: -1e9,
}));

let cursor = 0;

/** Record a footstep puff for the DustFX layer to draw from this frame onward. */
export function spawnDust(pos: THREE.Vector3, scale: number) {
  const d = dustPool[cursor];
  cursor = (cursor + 1) % MAX_DUST;
  d.pos.copy(pos);
  d.scale = scale;
  d.at = performance.now();
}
