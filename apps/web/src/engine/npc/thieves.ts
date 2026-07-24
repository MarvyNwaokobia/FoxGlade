import * as THREE from "three";

/** Live thieves, so the HUD can show a blip for each without prop threading. */
export interface ThiefRef {
  getPos: () => THREE.Vector3;
}

export const thieves = new Set<ThiefRef>();
export const MAX_THIEVES = 3;
