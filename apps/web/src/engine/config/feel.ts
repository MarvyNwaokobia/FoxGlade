/**
 * Tunable "game feel" constants for the movement slice.
 *
 * These are the numbers to play with while judging feel. Baselines are adapted
 * from Valor's CharacterController (walk 2.0 / run 4.8 / turnSpeed 10 / velocity
 * decay exp(-15·dt)) but nudged up for arena traversal — Foxglade is about
 * covering ground toward a treasure, not a tight melee pit.
 *
 * Everything a playtester would want to twist lives here so we never hunt
 * through scene code to retune the feel.
 */
export const FEEL = {
  // --- Locomotion (metres / second) ---
  walkSpeed: 4.2,
  runSpeed: 8.0, // hold Shift
  /** How fast horizontal velocity ramps toward the target (higher = snappier). */
  accel: 14,
  /** Exponential velocity decay when there's no input (higher = harder stop). */
  decay: 16,

  // --- Facing ---
  /** How fast the body rotates to face the movement direction (lerp factor·dt). */
  turnSpeed: 12,

  // --- Vertical ---
  gravity: -22,
  jumpForce: 8.0,

  // --- Camera (third-person orbit follow) ---
  mouseSensitivity: 0.0024,
  pitchMin: -0.55, // radians (look down)
  pitchMax: 0.95, // radians (look up)
  cameraDistance: 6.0,
  cameraHeight: 2.3,
  /** Camera position smoothing (higher = tighter follow, lower = floatier). */
  cameraLerp: 12,
  /** Height on the player the camera aims at. */
  lookAtHeight: 1.4,

  // --- Fox companion follow ---
  foxTrailDistance: 2.4, // how far behind the player the fox trails
  foxSideOffset: 1.0, // sits slightly to the player's side
  foxSpeed: 9, // how quickly it catches up (higher = tighter to heel)
  foxBobAmplitude: 0.12,
  foxBobSpeed: 9,

  // --- World ---
  arenaHalfExtent: 40, // half-size of the square play area (metres)
  playerRadius: 0.4,
  playerHeight: 1.7,
} as const;

export type Feel = typeof FEEL;
