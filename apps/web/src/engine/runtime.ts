import * as THREE from "three";
import { HINTS } from "./world/hints";

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
  /** True while the player is crouched (stealth: NPCs detect at reduced range). */
  crouching: false,
  /** True while the player is inside an enterable house (NPCs lose them). */
  sheltered: false,
  /** True while sitting to rest indoors (health regenerating). */
  resting: false,
  /** Index of the hint zone the player is standing in (-1 = none). */
  nearHintIndex: -1,
  /** Whether that hint is the real one. */
  nearHintIsReal: false,
  /** performance.now until which the fox's sniff keeps the real hint revealed. */
  revealRealUntil: -1,
  /** performance.now when the fox can sniff again (cooldown gate). */
  sniffReadyAt: 0,
  /** Per-hint: true once its distractor is silenced (decoy removed). */
  hintSilenced: HINTS.map(() => false),
  /** Per-hint: true once a thief has made off with that (real) treasure. */
  hintStolen: HINTS.map(() => false),
  /** Per-hint: true once a bomb blast has cracked that (real) treasure (§13.5). */
  hintCracked: HINTS.map(() => false),
  /** Timestamps for HUD toasts: a theft / a crack just happened. */
  treasureStolenAt: -1,
  treasureCrackedAt: -1,
  /** performance.now the current round started (drives the countdown). */
  roundStartAt: performance.now(),
  /** True while the player is holding G to aim a bomb throw. */
  bombAiming: false,
  /** Predicted bomb landing point (valid while bombAiming). */
  bombAimPoint: new THREE.Vector3(0, 0, 0),
  /** Timestamps (performance.now) for crosshair feedback. */
  fireAt: -1,
  hitAt: -1,
  /** Timestamp the player last took damage (for the screen flash). */
  damageAt: -1,
};
