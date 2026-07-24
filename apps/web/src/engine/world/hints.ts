import * as THREE from "three";

/**
 * Treasure hints (DESIGN §2, §14.1). Several candidate zones; TWO are real this
 * round — a shallow common treasure and a deep rare one (depth ≈ rarity, §7) —
 * and the rest are decoys (the distractors' fake pings). Claiming EITHER real
 * treasure wins the round at that treasure's rarity; thieves steal specific
 * treasures, and the round is lost only when every real treasure is gone.
 * All look identical until the fox's sniff reveals them.
 */
export type Rarity = "common" | "rare";

export interface Hint {
  pos: THREE.Vector3;
  real: boolean;
  rarity?: Rarity;
}

export const HINTS: Hint[] = [
  { pos: new THREE.Vector3(-9, 0, -31), real: true, rarity: "rare" }, // deep-north nook
  { pos: new THREE.Vector3(21.5, 0, -15), real: true, rarity: "common" }, // east courtyard pocket
  { pos: new THREE.Vector3(-27, 0, -20), real: false }, // west-deep decoy
  { pos: new THREE.Vector3(28, 0, -25), real: false }, // southeast-deep decoy
];

/** How close you must be to a hint to trigger its zone (real → claim, fake → dud). */
export const HINT_RADIUS = 3.5;

/** Fox sniff (v1 fixed values; cooldown will shorten as the fox matures, §10). */
export const SNIFF_COOLDOWN = 18; // seconds between sniffs
export const SNIFF_REVEAL = 6; // seconds the real hints stay lit after a sniff
