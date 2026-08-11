/**
 * Per-frame Nights state the DOM HUD reads on its own rAF.
 *
 * Same reason Foxglade has one: the frame loop must never trigger a React
 * re-render, and a HUD that polls a mutable singleton costs nothing.
 */
export const nightsRuntime = {
  /** Live walkers right now. */
  alive: 0,
  /** Motes on the floor. */
  motes: 0,
  px: 0,
  pz: 0,
  /** performance.now of the last time the player was hit (drives the flash). */
  hitAt: -1,
};
