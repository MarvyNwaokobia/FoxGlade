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
  /** Index of the hint zone the player is standing in (-1 = none). */
  nearHintIndex: -1,
  /** Whether that hint is the real one. */
  nearHintIsReal: false,
  /** performance.now until which the fox's sniff keeps the real hint revealed. */
  revealRealUntil: -1,
  /** performance.now when the fox can sniff again (cooldown gate). */
  sniffReadyAt: 0,
  /** Timestamps (performance.now) for crosshair feedback. */
  fireAt: -1,
  hitAt: -1,
  /** Timestamp the player last took damage (for the screen flash). */
  damageAt: -1,
};
