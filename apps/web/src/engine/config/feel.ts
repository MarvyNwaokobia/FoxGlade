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
  cameraDistance: 5.2,
  cameraHeight: 2.6,
  cameraMinHeight: 0.8, // camera never dips below this, so you can't see under the world
  cameraMinDistance: 2.4, // closest the camera pulls to the player on collision (avoids face-cam)
  cameraCollisionBuffer: 0.3, // gap kept in front of a wall the camera pulls up to
  /** Camera position smoothing (higher = tighter follow, lower = floatier). */
  cameraLerp: 12,
  /** Height on the player the camera aims at. */
  lookAtHeight: 1.4,
  baseFov: 60,
  runFovKick: 7, // camera widens slightly while running, so speed is felt
  fovLerp: 8,

  // --- Fox companion follow ---
  // The fox stays BESIDE (and slightly ahead of) the player so it's always in
  // view — a companion you watch and care for, never hidden behind you.
  foxForwardOffset: 0.9, // how far ahead of the player it walks (keeps it on-screen)
  foxSideOffset: 1.3, // how far out to the side it walks
  foxSide: 1, // 1 = player's right, -1 = left
  foxSpeed: 9, // how quickly it catches up (higher = tighter to heel)
  foxBobAmplitude: 0.12,
  foxBobSpeed: 9,

  // --- World ---
  arenaHalfExtent: 40, // half-size of the square play area (metres)
  playerRadius: 0.4,
  playerHeight: 1.7,
} as const;

export type Feel = typeof FEEL;
