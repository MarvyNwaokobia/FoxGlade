/**
 * Shared touch-input state, written by the on-screen MobileControls and read by
 * the PlayerController each frame (same no-re-render pattern as `runtime`).
 * Discrete one-shot actions (crouch, sniff, claim, bomb, rest, respawn, restart)
 * are NOT here — MobileControls dispatches synthetic KeyboardEvents for those so
 * the existing key handlers run unchanged.
 */
export const touch = {
  /** True on touch devices — hides the desktop pointer-lock prompt and lets the
   *  controller bypass the `document.pointerLockElement` gates. */
  enabled: false,
  /** Analog move vector from the left stick, each axis -1..1 (y+ = forward). */
  moveX: 0,
  moveY: 0,
  /** True while the stick is pushed past the run threshold. */
  run: false,
  /** Look delta (screen px) accumulated since the controller last consumed it. */
  lookDX: 0,
  lookDY: 0,
  /** Held while the fire button is pressed. */
  fire: false,
  /** Held while the jump button is pressed. */
  jump: false,
};

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}
