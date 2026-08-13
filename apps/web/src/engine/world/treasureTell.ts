/**
 * Pure math for the ground-level treasure tell (DESIGN §14.10 slice 5) — split
 * out of VillageMesh.tsx (a "use client" R3F component, unimportable from the
 * plain-node test config) so the proximity/opacity curve and the deterministic
 * clod scatter are unit-testable without a browser.
 */

/** Fully visible within TELL_NEAR of the player, gone past TELL_FAR — a tell
 *  you find by approaching, not a beacon you spot from across the village. */
export const TELL_NEAR = 3;
export const TELL_FAR = 11;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 0 far away, 1 once within TELL_NEAR — how "found" a tell reads at this
 *  distance from the player. */
export function tellProximity(dist: number): number {
  return 1 - clamp((dist - TELL_NEAR) / (TELL_FAR - TELL_NEAR), 0, 1);
}

/** The turned-earth patch is always faintly there (0.12) even at range — it's
 *  the glint that's the real "you're close" signal — and brightens toward a
 *  legible 0.8 as `t` (tellProximity) climbs to 1. */
export function moundOpacity(t: number): number {
  return 0.12 + t * 0.68;
}

/** Squared so the glint stays essentially invisible until you're properly
 *  close, then comes up fast — it's the payoff for closing the distance, not
 *  a gradual fade you can read from a few paces back. */
export function glintOpacity(t: number): number {
  return t * t * 0.9;
}

export interface Clod {
  x: number;
  z: number;
  s: number;
  ry: number;
}

/** Deterministic scatter for the disturbed-earth clods around a tell, seeded
 *  per hint SLOT (not per hint content) so it doesn't reshuffle when the board
 *  reseeds a new treasure into the same slot mid-day. */
export function clodLayout(seed: number): Clod[] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = ((seed * 37 + i * 91) % 360) * (Math.PI / 180);
    const r = 0.32 + ((seed * 13 + i * 7) % 5) * 0.08;
    return {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      s: 0.13 + ((seed + i) % 3) * 0.045,
      ry: ((seed * 53 + i * 29) % 360) * (Math.PI / 180),
    };
  });
}
