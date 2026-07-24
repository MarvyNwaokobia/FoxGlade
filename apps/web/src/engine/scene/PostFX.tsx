"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/**
 * Cinematic post pass for mood: bloom makes the lanterns, hint beacons and lit
 * highlights glow; the vignette darkens the frame edges for a moody, focused
 * look. Kept subtle so gameplay readability stays intact.
 */
export function PostFX() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.75}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.7}
      />
      <Vignette darkness={0.55} offset={0.28} />
    </EffectComposer>
  );
}
