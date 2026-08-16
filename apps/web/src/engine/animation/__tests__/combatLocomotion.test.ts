import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { spliceUpperBody } from "../MixamoLoader";

/**
 * `spliceUpperBody` is what stands in for the missing `Rifle Walking.fbx` /
 * `Rifle Running.fbx` (see the CLIP_NAMES.combatWalk comment in MixamoLoader.ts):
 * legs from the real walk/run clip, upper body from rifleIdle, no additive math
 * (the thing that broke the earlier "aim-ready layer" over crouch — a straight
 * per-bone swap can't produce that failure, since nothing is summed).
 */

/** A one-track clip: a quaternion animating from `from` to `to` over `duration`. */
function boneClip(name: string, trackName: string, from: number, to: number, duration = 1): THREE.AnimationClip {
  const track = new THREE.QuaternionKeyframeTrack(
    `${trackName}.quaternion`,
    [0, duration],
    [0, 0, 0, from, 0, 0, 0, to]
  );
  return new THREE.AnimationClip(name, duration, [track]);
}

describe("spliceUpperBody", () => {
  it("keeps the legs clip's lower-body tracks untouched", () => {
    const legs = new THREE.AnimationClip("walk", 0.8, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftUpLeg.quaternion", [0, 0.8], [0, 0, 0, 1, 0, 0, 0, 2]),
      new THREE.QuaternionKeyframeTrack("mixamorigRightUpLeg.quaternion", [0, 0.8], [0, 0, 0, 3, 0, 0, 0, 4]),
    ]);
    const arms = boneClip("rifleIdle", "mixamorigRightArm", 9, 9);

    const out = spliceUpperBody(legs, arms, "combatWalk");

    const leftLeg = out.tracks.find((t) => t.name === "mixamorigLeftUpLeg.quaternion");
    const rightLeg = out.tracks.find((t) => t.name === "mixamorigRightUpLeg.quaternion");
    expect(leftLeg?.values).toEqual(legs.tracks[0].values);
    expect(rightLeg?.values).toEqual(legs.tracks[1].values);
  });

  it("replaces an upper-body bone the legs clip already has with the arms clip's version", () => {
    const legs = new THREE.AnimationClip("walk", 0.8, [
      boneClip("walk", "mixamorigRightArm", 111, 111, 0.8).tracks[0],
    ]);
    const arms = boneClip("rifleIdle", "mixamorigRightArm", 5, 6, 2);

    const out = spliceUpperBody(legs, arms, "combatWalk");

    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0].name).toBe("mixamorigRightArm.quaternion");
    // The walk clip's own arm swing (111) must be gone — replaced, not blended.
    expect(out.tracks[0].values).toEqual(arms.tracks[0].values);
  });

  it("appends an upper-body bone the legs clip never tracked at all", () => {
    const legs = new THREE.AnimationClip("walk", 0.8, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftUpLeg.quaternion", [0, 0.8], [0, 0, 0, 1, 0, 0, 0, 2]),
    ]);
    const arms = boneClip("rifleIdle", "mixamorigHead", 7, 8);

    const out = spliceUpperBody(legs, arms, "combatWalk");

    expect(out.tracks.some((t) => t.name === "mixamorigHead.quaternion")).toBe(true);
  });

  it("ignores an arms-clip track for a bone that isn't upper body", () => {
    const legs = new THREE.AnimationClip("walk", 0.8, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftUpLeg.quaternion", [0, 0.8], [0, 0, 0, 1, 0, 0, 0, 2]),
    ]);
    // rifleIdle animating a leg bone too (plausible — idle sways the whole
    // body slightly) must NOT leak into the walk cycle's own legs.
    const arms = boneClip("rifleIdle", "mixamorigLeftUpLeg", 99, 99);

    const out = spliceUpperBody(legs, arms, "combatWalk");

    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0].values).toEqual(legs.tracks[0].values);
  });

  it("takes its duration from the legs clip, not the arms clip", () => {
    const legs = new THREE.AnimationClip("run", 0.55, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftUpLeg.quaternion", [0, 0.55], [0, 0, 0, 1, 0, 0, 0, 2]),
    ]);
    const arms = boneClip("rifleIdle", "mixamorigHead", 1, 2, 3.4);

    const out = spliceUpperBody(legs, arms, "combatRun");

    expect(out.duration).toBe(0.55);
  });

  it("names the result after the requested state, not either source clip", () => {
    const legs = new THREE.AnimationClip("walk", 0.8, []);
    const arms = new THREE.AnimationClip("rifleIdle", 1, []);

    expect(spliceUpperBody(legs, arms, "combatWalk").name).toBe("combatWalk");
  });
});
