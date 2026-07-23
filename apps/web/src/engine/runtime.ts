import * as THREE from "three";

/**
 * A tiny mutable singleton the game loop writes every frame and the DOM HUD
 * reads via its own requestAnimationFrame — so the compass/heading never
 * triggers React re-renders from inside the 60fps loop.
 */
export const runtime = {
  playerPos: new THREE.Vector3(0, 0, 0),
  /** Body yaw in radians (0 = facing -Z). */
  yaw: 0,
  running: false,
  /** Fixed landmark the HUD compass points at (the treasure marker). */
  treasurePos: new THREE.Vector3(18, 0, -26),
  /** True while the player stands in the treasure zone. */
  nearTreasure: false,
};
