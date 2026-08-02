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

/**
 * How hard the aim is helped toward a target on touch.
 *
 * A phone gives you a thumb-drag for a mouse. Tracking a moving blocker with one
 * while your other thumb is on FIRE is a genuinely different — and much harder —
 * problem than the same fight on a desktop, and without help the honest outcome
 * of most mobile firefights is a coin flip. Every shipped mobile shooter helps
 * here; the question is only how much and how visibly.
 *
 * This is deliberately gentle: it only bites inside a narrow cone around where
 * you're ALREADY pointing, it can't acquire a target for you, and it stops
 * pulling once you're on. It is a steadying hand, not an aimbot.
 */
export const AIM_ASSIST = {
  /** Half-angle of the cone (radians) a target must be inside to be helped. */
  coneRad: 0.085,
  /** Beyond this the assist doesn't reach at all (metres). */
  maxRange: 46,
  /** Fraction of the remaining angle closed per second at full strength. */
  strength: 5.2,
  /** Inside this angle you're on target — stop pulling, or it feels magnetic. */
  deadRad: 0.012,
} as const;

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}
