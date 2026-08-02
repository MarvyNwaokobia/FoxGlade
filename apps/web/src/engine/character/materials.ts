import * as THREE from "three";

/**
 * Character surfacing + grounding.
 *
 * Two long-standing complaints, both fixable without new art:
 *
 *  1. "Wet black latex." The materials were already forced matte (roughness 0.9,
 *     metalness 0), but a near-BLACK albedo under a bright HDRI reads as vinyl no
 *     matter how rough it is — all you can see is the specular, because there's no
 *     diffuse to compete with it. So very dark colours get lifted off pure black,
 *     and envMapIntensity is pulled right down: cloth doesn't mirror the sky.
 *
 *  2. "Feet and floor patched together." The rigs cast NO shadow — grounding was a
 *     soft blob decal, which sits at a fixed size and never agrees with the light.
 *     Now the sun moves across the day (Phase 5), a real cast shadow is both
 *     affordable-enough and the single strongest cue that a character is standing
 *     ON something rather than in front of it.
 */
export function dressCharacterMaterial(m: THREE.Material): void {
  const sm = m as THREE.MeshStandardMaterial;
  // The roughness/metalness MAPS have to go, not just the scalars. `roughness`
  // multiplies the map rather than replacing it, so a character authored with a
  // glossy roughness map stays glossy no matter what scalar you set — which is
  // why forcing 0.92 didn't stop the wet-vinyl look. These are converted Mixamo
  // figures with generic PBR maps; uniform matte is both closer to cloth and
  // closer to the art direction than whatever the source shipped with.
  if ("roughnessMap" in sm && sm.roughnessMap) sm.roughnessMap = null;
  if ("metalnessMap" in sm && sm.metalnessMap) sm.metalnessMap = null;
  if ("roughness" in sm) sm.roughness = 0.95;
  if ("metalness" in sm) sm.metalness = 0;
  // Cloth and leather barely pick up the environment. Left at the default 1 the
  // HDRI does most of the shading, which is exactly the plastic look.
  if ("envMapIntensity" in sm) sm.envMapIntensity = 0.28;
  // Lift crushed blacks so there's some diffuse for the light to land on.
  if (sm.color) {
    const l = sm.color.r * 0.299 + sm.color.g * 0.587 + sm.color.b * 0.114;
    if (l < 0.075) sm.color.setScalar(0.075 + l * 0.4);
  }
}
