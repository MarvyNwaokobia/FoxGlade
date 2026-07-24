import * as THREE from "three";
import { VILLAGE } from "./village";

/**
 * Treasure hints (DESIGN §2). Several candidate zones, only one real — the rest
 * are decoys (the distractors' fake pings). The player either brute-forces all
 * of them (slow, dangerous) or uses the fox's sniff to go straight to the real
 * one. All look identical until revealed.
 */
export interface Hint {
  pos: THREE.Vector3;
  real: boolean;
}

export const HINTS: Hint[] = [
  { pos: VILLAGE.treasure.clone(), real: true }, // deep north
  { pos: new THREE.Vector3(-22, 0, -22), real: false }, // west-deep decoy
  { pos: new THREE.Vector3(24, 0, -14), real: false }, // east decoy
];

/** How close you must be to a hint to trigger its zone (real → claim, fake → dud). */
export const HINT_RADIUS = 3.5;

/** Fox sniff (v1 fixed values; cooldown will shorten as the fox matures, §10). */
export const SNIFF_COOLDOWN = 18; // seconds between sniffs
export const SNIFF_REVEAL = 6; // seconds the real hint stays lit after a sniff
