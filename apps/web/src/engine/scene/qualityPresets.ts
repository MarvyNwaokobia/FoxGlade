import type { QualityTier } from "./deviceTier";

/**
 * What each tier actually changes. Kept to knobs that cost nothing gameplay-
 * wise — render resolution, shadow map size, bloom, antialiasing, and purely
 * decorative draw-distance dressing (hills/treeline/chimneys/set-dressing
 * props). Deliberately does NOT touch NPC counts, spawn timing, or anything
 * else that affects difficulty — the village already caps out at a handful of
 * NPCs alive at once (2 blockers, up to 3 thieves, 6 distractors), so there
 * was never much to gain there, and thinning it out for a "low" device would
 * be a balance change wearing a performance-fix costume.
 */
export interface QualityConfig {
  /** [min, max] passed straight to <Canvas dpr>. */
  dpr: [number, number];
  bloom: boolean;
  shadows: boolean;
  shadowSize: number;
  antialias: boolean;
  /** Horizon (hills/treeline) + HouseDressing (chimneys/trim) + Props
   *  (outdoor set-dressing) — atmosphere, not gameplay. */
  dressing: boolean;
}

export const QUALITY: Record<QualityTier, QualityConfig> = {
  high: { dpr: [0.6, 1.35], bloom: true, shadows: true, shadowSize: 1024, antialias: true, dressing: true },
  medium: { dpr: [0.6, 1.0], bloom: true, shadows: true, shadowSize: 512, antialias: true, dressing: true },
  low: { dpr: [0.5, 0.75], bloom: false, shadows: false, shadowSize: 512, antialias: false, dressing: false },
};
