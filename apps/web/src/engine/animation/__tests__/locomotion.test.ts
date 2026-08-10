import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import {
  AnimationStateMachine,
  AnimState,
  buildAnimMap,
  classifyMoveDir,
  type MoveDir,
} from "../AnimationStateMachine";
import { CLIP_NAMES } from "../MixamoLoader";

/**
 * Locomotion clip selection and blending.
 *
 * Both bugs this covers were invisible in a still frame and obvious in motion:
 * a crouch-left that played the strafe-RIGHT cycle, and a stride that restarted
 * from time 0 every time a diagonal tipped the dominant axis over.
 */

/** A clip that animates one bone, long enough to have a readable phase. */
function clip(name: string, duration = 1): THREE.AnimationClip {
  const track = new THREE.VectorKeyframeTrack(
    ".position",
    [0, duration],
    [0, 0, 0, 0, 0, 0]
  );
  return new THREE.AnimationClip(name, duration, [track]);
}

const CLIPS = [
  CLIP_NAMES.rifleIdle,
  CLIP_NAMES.walk,
  CLIP_NAMES.run,
  CLIP_NAMES.strafeLeft,
  CLIP_NAMES.strafeRight,
  CLIP_NAMES.crouchWalk,
  CLIP_NAMES.crouchStrafe,
].map((n) => clip(n));

let machine: AnimationStateMachine;
let mixer: THREE.AnimationMixer;
let root: THREE.Object3D;

beforeEach(() => {
  root = new THREE.Object3D();
  mixer = new THREE.AnimationMixer(root);
  machine = new AnimationStateMachine(buildAnimMap());
  machine.init(mixer, CLIPS);
});

/** Point the machine at a travel direction and settle it in a state. */
function travel(state: AnimState, fwd: number, right: number) {
  machine.setMoveDirection(fwd, right);
  machine.transition(state);
  machine.setMoveDirection(fwd, right);
  machine.matchLocomotionSpeed(3);
}

/** timeScale of the action playing `name` (sign tells us if it's reversed). */
function scaleOf(name: string): number {
  return mixer.clipAction(CLIPS.find((c) => c.name === name)!).timeScale;
}

describe("clip selection per direction", () => {
  it("uses the authored strafe clips for standing left and right", () => {
    travel(AnimState.Walk, 0, 1);
    expect(machine.currentClipName).toBe(CLIP_NAMES.strafeRight);
    travel(AnimState.Walk, 0, -1);
    expect(machine.currentClipName).toBe(CLIP_NAMES.strafeLeft);
  });

  it("backpedals by running the forward clip in reverse", () => {
    travel(AnimState.Walk, -1, 0);
    expect(machine.currentClipName).toBe(CLIP_NAMES.walk);
    expect(scaleOf(CLIP_NAMES.walk)).toBeLessThan(0);
  });

  it("crouch-left MIRRORS the right clip instead of playing it forwards", () => {
    // The bug: both directions mapped to `crouchStrafe`, so a clip existed for
    // `left`, no reversal triggered, and the legs crossed the wrong way.
    travel(AnimState.CrouchWalk, 0, 1);
    expect(machine.currentClipName).toBe(CLIP_NAMES.crouchStrafe);
    expect(scaleOf(CLIP_NAMES.crouchStrafe)).toBeGreaterThan(0);

    travel(AnimState.CrouchWalk, 0, -1);
    expect(machine.currentClipName).toBe(CLIP_NAMES.crouchStrafe);
    expect(scaleOf(CLIP_NAMES.crouchStrafe)).toBeLessThan(0); // reversed = left
  });
});

describe("the diagonal blend", () => {
  it("plays BOTH clips on a diagonal, weighted by travel", () => {
    travel(AnimState.Walk, 1, 1); // 45° forward-right
    const walk = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.walk)!);
    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(walk.getEffectiveWeight()).toBeGreaterThan(0.1);
    expect(strafe.getEffectiveWeight()).toBeGreaterThan(0.1);
    // Total weight has to stay at 1 or the missing share bleeds the bind pose in.
    expect(walk.getEffectiveWeight() + strafe.getEffectiveWeight()).toBeCloseTo(1);
  });

  it("gives the secondary almost nothing when travel is nearly straight", () => {
    travel(AnimState.Walk, 1, 0.05);
    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(strafe.getEffectiveWeight()).toBeLessThan(0.1);
  });

  it("hands over smoothly: at the crossover both clips are already ~half", () => {
    // This is what makes the dominant-clip swap invisible. If the secondary
    // weight jumped from 0 to 0.5 at the boundary you'd see the hitch the blend
    // exists to remove.
    travel(AnimState.Walk, 1, 0.99);
    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(strafe.getEffectiveWeight()).toBeGreaterThan(0.4);
    expect(strafe.getEffectiveWeight()).toBeLessThan(0.6);
  });

  it("drops the blend when locomotion ends, so it can't leak into idle", () => {
    travel(AnimState.Walk, 1, 1);
    machine.transition(AnimState.Idle);
    machine.matchLocomotionSpeed(0);
    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(strafe.isRunning()).toBe(false);
    // Weight zeroed too, not just deactivated: clipAction() returns the same
    // object, so a stale weight would resurface the next time it's played.
    expect(strafe.getEffectiveWeight()).toBe(0);
  });
});

describe("the blend must never disarm the clip that's actually playing", () => {
  it("keeps the active action running when the dominant axis takes over its clip", () => {
    // The failure: walking forward-right, the blend is strafeRight. Tip the
    // travel over to right-dominant and `transition` picks strafeRight as the
    // DOMINANT clip — mixer.clipAction() returns the very same action object the
    // blend was holding. The blend then saw "secondary == active", called
    // clearLocoBlend, and stopped and zero-weighted the action now driving the
    // whole body. Nothing drove the bones, the rig fell back to its bind pose —
    // which for these Blender GLBs is the flat, Z-up orientation that
    // HIPS_PITCH_FIX exists to cancel. On screen: floating and horizontal.
    travel(AnimState.Walk, 1, 0.8); // forward-dominant, strafeRight blended in
    travel(AnimState.Walk, 0.8, 1); // now right-dominant — same clip, new role

    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(machine.currentClipName).toBe(CLIP_NAMES.strafeRight);
    expect(strafe.isRunning()).toBe(true);
    expect(strafe.getEffectiveWeight()).toBeGreaterThan(0);
  });

  it("leaves SOME clip driving the skeleton in every travel direction", () => {
    for (const [f, r] of [
      [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
      [1, 0.8], [0.8, 1], [-0.9, 1], [1, -0.9],
    ] as [number, number][]) {
      travel(AnimState.Walk, f, r);
      const name = machine.currentClipName!;
      const action = mixer.clipAction(CLIPS.find((c) => c.name === name)!);
      expect(action.isRunning(), `${f},${r} → ${name} not running`).toBe(true);
      expect(action.getEffectiveWeight(), `${f},${r} → ${name} zero weight`).toBeGreaterThan(0);
    }
  });
});

describe("stride phase", () => {
  it("survives a walk→strafe swap instead of re-planting from time 0", () => {
    travel(AnimState.Walk, 1, 0);
    const walk = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.walk)!);
    walk.time = 0.6; // mid-stride, one foot planted
    machine.setMoveDirection(0, 1); // hard turn onto a strafe
    const strafe = mixer.clipAction(CLIPS.find((c) => c.name === CLIP_NAMES.strafeRight)!);
    expect(machine.currentClipName).toBe(CLIP_NAMES.strafeRight);
    expect(strafe.time).toBeCloseTo(0.6, 1);
  });
});

describe("classifyMoveDir stickiness", () => {
  it("holds its axis through a wobble, so a diagonal doesn't chatter", () => {
    let dir: MoveDir = "forward";
    // Equal components: whichever axis is held should keep it.
    dir = classifyMoveDir(1, 1, dir);
    expect(dir).toBe("forward");
    dir = classifyMoveDir(1, 1, "right");
    expect(dir).toBe("right");
  });

  it("still hands over when the other axis genuinely wins", () => {
    expect(classifyMoveDir(0.2, 1, "forward")).toBe("right");
    expect(classifyMoveDir(-1, 0.2, "right")).toBe("back");
  });
});
