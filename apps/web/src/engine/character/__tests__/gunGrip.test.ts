import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { handGunWorldMatrix, muzzleWorldPos, type GripOffset } from "../GunMesh";

/**
 * The weapon socket. Held in the hand, not aimed by the camera — so the hand's
 * rotation has to reach the gun intact, and the rig's scale must not.
 */

const GRIP: GripOffset = { rx: -Math.PI / 2, rz: -1.8368, oy: 0.02, oz: 0.04 };

/** A hand bone at `pos`, rotated by `quat`, on a rig scaled by `scale`. */
function hand(pos: THREE.Vector3, quat: THREE.Quaternion, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(scale, scale, scale));
}

const out = () => new THREE.Matrix4();

describe("handGunWorldMatrix", () => {
  it("puts the gun in the hand", () => {
    const p = new THREE.Vector3(3, 1.4, -2);
    const m = handGunWorldMatrix(out(), hand(p, new THREE.Quaternion()), { rx: 0, rz: 0 });
    expect(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(p)).toBeCloseTo(0);
  });

  it("carries the hand's ROTATION through — the whole point of a socket", () => {
    // The old socket built its basis from the camera and threw this away, which
    // is why the weapon read as pinned to the forearm rather than gripped.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.4));
    const straight = handGunWorldMatrix(out(), hand(new THREE.Vector3(), new THREE.Quaternion()), GRIP);
    const rotated = handGunWorldMatrix(out(), hand(new THREE.Vector3(), q), GRIP);
    const barrelOf = (m: THREE.Matrix4) =>
      new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
    // Rotating the wrist must rotate the barrel by exactly the same amount.
    expect(barrelOf(rotated).angleTo(barrelOf(straight).applyQuaternion(q))).toBeCloseTo(0);
  });

  it("DROPS the rig's scale, so one grip works on every character", () => {
    // Our FBX→GLB conversions carry a ~100x node scale. Inheriting it would blow
    // the rifle up to fill the street (or shrink it to nothing on a 0.01 rig).
    const p = new THREE.Vector3(1, 1, 1);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.5, 0));
    const normal = handGunWorldMatrix(out(), hand(p, q, 1), GRIP);
    const giant = handGunWorldMatrix(out(), hand(p, q, 100), GRIP);
    const scaleOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(m);
    expect(scaleOf(giant).x).toBeCloseTo(scaleOf(normal).x);
    expect(scaleOf(normal).x).toBeCloseTo(1);
    // …and the gun stays in the hand rather than being flung out by the scale.
    expect(new THREE.Vector3().setFromMatrixPosition(giant).distanceTo(p)).toBeLessThan(0.2);
  });

  it("applies grip.scale, which is the only thing that should size the weapon", () => {
    const m = handGunWorldMatrix(out(), hand(new THREE.Vector3(), new THREE.Quaternion()), {
      rx: 0,
      rz: 0,
      scale: 0.5,
    });
    expect(new THREE.Vector3().setFromMatrixScale(m).x).toBeCloseTo(0.5);
  });

  it("offsets in the HAND's frame, not the world's", () => {
    // A grip offset is a fixed nudge into the palm; it has to rotate with the
    // wrist or the gun slides out of the hand as the arm swings.
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const m = handGunWorldMatrix(out(), hand(new THREE.Vector3(), q), { rx: 0, rz: 0, oz: 1 });
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    // +Z in the hand's frame, rotated 90° about Y, points down +X.
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);
  });

  it("reports a muzzle that moves with the weapon", () => {
    const gun = new THREE.Group();
    const muzzle = new THREE.Object3D();
    muzzle.name = "muzzle";
    muzzle.position.set(0, 0, 0.85); // down the barrel
    gun.add(muzzle);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0));
    const m = handGunWorldMatrix(out(), hand(new THREE.Vector3(2, 1, 0), q), GRIP);
    const tip = muzzleWorldPos(new THREE.Vector3(), gun, m);
    // The tracer leaves from here, so it must sit a barrel's length off the hand
    // rather than collapsing onto it.
    expect(tip.distanceTo(new THREE.Vector3(2, 1, 0))).toBeGreaterThan(0.5);
  });
});
