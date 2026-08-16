/**
 * Which skeleton bones count as "upper body" — shared between
 * `AnimationStateMachine` (the old, removed additive run-and-gun layer this
 * was originally built for) and `MixamoLoader` (splicing a synthetic
 * combat-ready walk/run, see the comment on `synthesizeCombatLocomotion`).
 * Pulled out to its own module so neither has to import the other — they
 * already point at each other for `CLIP_NAMES`/`getClipStride`.
 *
 * Track names are the colon-less mixamorig form (see normalizeBoneTrackName).
 * Spine base stays with the legs (torso bob); Spine1 up + both arms + head
 * are upper.
 */
export const UPPER_BODY_BONES = [
  "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
];

export function isUpperBodyTrack(trackName: string): boolean {
  return UPPER_BODY_BONES.some((b) => trackName.startsWith("mixamorig" + b));
}
