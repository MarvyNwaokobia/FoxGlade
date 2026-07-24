"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  AnimationStateMachine,
  AnimState,
  buildAnimMap,
  loadMixamoAnimations,
  getMixamoClips,
  isMixamoLoadComplete,
} from "@/engine/animation";

/**
 * The per-frame state the rig reads to drive its animation + transform. The
 * PlayerController owns one of these and mutates it every frame; the rig only
 * reads. Keeping it a plain mutable object (not React state) keeps the 60fps
 * loop out of React's render path.
 */
export interface PlayerRigState {
  position: THREE.Vector3;
  rotation: number; // body yaw (radians)
  velocity: THREE.Vector3;
  moving: boolean;
  running: boolean;
  crouching: boolean;
  grounded: boolean;
  dead: boolean;
  fireAt: number; // performance.now of the last shot
  visible: boolean; // false only when fully faded (camera extremely close)
  opacity: number; // 0..1 — fades as the camera closes in, so he never hard-vanishes
}

export type CharacterModelId = "man" | "sentinel" | "phantom" | "berserker" | "operator";

const MODEL_PATHS: Record<CharacterModelId, string> = {
  man: "/characters/glb/player_man.glb", // realistic Mixamo character (Marvy's), converted FBX→GLB
  sentinel: "/characters/glb/sentinel.glb",
  phantom: "/characters/glb/phantom.glb",
  berserker: "/characters/glb/berserker.glb",
  operator: "/characters/glb/operator.glb",
};

// Every GLB here is Blender-exported (Valor's rigs AND our FBX→GLB conversions),
// and they all carry the ~90° Z-up→Y-up root-pitch offset the mixer clips don't
// account for — so all of them need the per-frame HIPS_PITCH_FIX (see below).
// Confirmed empirically: without it the converted `man` lies flat / floats.
const NEEDS_PITCH_FIX = new Set<CharacterModelId>(["man", "sentinel", "phantom", "berserker", "operator"]);

const RIFLE_PATH = "/characters/guns/rifle.glb";

// The Blender-exported GLB rigs carry a ~90° pitch offset on the root (Hips) bone
// vs the Mixamo clips (Z-up→Y-up export), which lays the character out FLAT. The
// clips otherwise drive the rig correctly, so we cancel it with a constant -90° X
// rotation premultiplied onto the Hips each frame AFTER the mixer runs. Pure
// bone-quaternion math (Safari-safe, unlike rest-pose retargeting).
const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const HIPS_PITCH_FIX_INV = HIPS_PITCH_FIX.clone().invert();

// The rifle is driven from the right-hand bone each frame rather than PARENTED
// into the skeleton (parenting a child corrupts the animation bind → T-pose).
// GUN_GRIP is the gun's offset relative to the hand — tune these two if the
// rifle sits slightly off in the grip.
const GUN_GRIP = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 0.03, 0.02),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, Math.PI, 0)),
  new THREE.Vector3(1, 1, 1)
);
const _gunScratch = new THREE.Matrix4();

// Recent-shot window (seconds) that keeps the standing Fire clip playing.
const FIRE_HOLD = 0.22;

// Weapons are their own asset line (§14.6) and need proper per-gun sizing/grip —
// off for now so the socketed rifle's native scale doesn't render meters-long.
const SHOW_GUN = false;

interface PlayerRigProps {
  state: PlayerRigState;
  model?: CharacterModelId;
}

export const PlayerRig = memo(function PlayerRig({ state, model = "man" }: PlayerRigProps) {
  const needsPitchFix = NEEDS_PITCH_FIX.has(model);
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const gunRef = useRef<THREE.Object3D | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  const hipsBoneRef = useRef<THREE.Object3D | null>(null);
  const hipsFixApplied = useRef(false);
  const lean = useRef({ x: 0, z: 0 });
  const crouchScale = useRef(1);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);
  const lastFireAt = useRef(state.fireAt);
  const deathPlayed = useRef(false);
  const deathDrop = useRef(0); // eased downward offset that settles the corpse

  const { scene, animations } = useGLTF(MODEL_PATHS[model]);
  const rifle = useGLTF(RIFLE_PATH);

  const animMachine = useMemo(() => new AnimationStateMachine(buildAnimMap()), []);

  const materials = useRef<THREE.Material[]>([]);
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.Material[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // No cast shadow: a skinned-mesh shadow pass is pricey and the blob
        // contact-shadow under the player already grounds him. Still receives
        // building shadows (cheap) so he doesn't glow in the shade.
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false; // his bounds swing wide when animating
        // Own the materials (clone) so the camera fade opacity doesn't leak to
        // the source asset / other instances.
        child.material = Array.isArray(child.material)
          ? child.material.map((m) => m.clone())
          : child.material.clone();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => mats.push(m));
      }
    });
    materials.current = mats;
    return clone;
  }, [scene]);

  const rifleProto = useMemo(() => {
    const clone = SkeletonUtils.clone(rifle.scene);
    clone.traverse((c) => {
      if (c instanceof THREE.Mesh) c.castShadow = true;
    });
    return clone;
  }, [rifle.scene]);

  // Kick off the Mixamo FBX load immediately (shared across all rigs).
  useMemo(() => {
    loadMixamoAnimations();
  }, []);

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    // First init: mixer bound to the GLB's own clips.
    if (!initDone.current && groupRef.current.children.length > 0) {
      initDone.current = true;
      const mixer = new THREE.AnimationMixer(groupRef.current);
      mixerRef.current = mixer;
      animMachine.init(mixer, animations);

      let hipsBone: THREE.Object3D | null = null;
      groupRef.current.traverse((child) => {
        if ((child as THREE.Bone).isBone) {
          if (!hipsBone && /hips/i.test(child.name)) {
            hipsBone = child;
            hipsBoneRef.current = child;
          }
          if (!handBoneRef.current && /righthand$/i.test(child.name)) handBoneRef.current = child;
        }
      });
      if (hipsBone) {
        groupRef.current.updateWorldMatrix(true, true);
        const hipY = (hipsBone as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;
        animMachine.setRigScale(hipY);
      }
    }

    // Once the FULL Mixamo set is loaded, rebind with the combined clip list.
    if (initDone.current && !mixamoApplied.current && mixerRef.current && isMixamoLoadComplete()) {
      const mixamoClips = getMixamoClips();
      if (mixamoClips.size > 0) {
        mixamoApplied.current = true;
        const combined = [...animations];
        for (const [name, clip] of mixamoClips) {
          if (!combined.find((c) => c.name === name)) combined.push(clip);
        }
        animMachine.init(mixerRef.current, combined);

        // Socket the rifle as a SIBLING, driven from the hand bone each frame.
        if (SHOW_GUN && !gunRef.current) {
          const gun = rifleProto.clone(true);
          gun.matrixAutoUpdate = false;
          groupRef.current.add(gun);
          gunRef.current = gun;
        }
      }
    }

    // Never show a T-pose: reveal once the combat idle is driving the rig (or a
    // short fallback for a slow load).
    if (!revealed.current && initDone.current) {
      if (initTime.current === 0) initTime.current = performance.now();
      if (mixamoApplied.current || performance.now() - initTime.current > 2500) {
        revealed.current = true;
      }
    }
    groupRef.current.visible = revealed.current && state.visible;

    // Camera-proximity fade (set by the controller) so he never hard-vanishes.
    const op = state.opacity;
    for (const m of materials.current) {
      m.transparent = op < 0.99;
      m.opacity = op;
      m.depthWrite = op >= 0.99;
    }

    // ── Choose the animation state from gameplay flags ──
    if (state.dead) {
      if (!deathPlayed.current) {
        deathPlayed.current = true;
        animMachine.transition(AnimState.Death, true);
      }
    } else {
      if (deathPlayed.current) {
        deathPlayed.current = false;
        animMachine.transition(AnimState.Idle, true);
      }
      // Fire only when standing (full-body clip; layered aim-while-moving is a
      // later slice). While moving, legs keep running and the shot still fires.
      const firedRecently = (performance.now() - state.fireAt) / 1000 < FIRE_HOLD;
      if (state.fireAt !== lastFireAt.current) lastFireAt.current = state.fireAt;
      if (state.moving) {
        animMachine.transition(state.running ? AnimState.Run : AnimState.Walk);
      } else if (firedRecently) {
        animMachine.transition(AnimState.Fire);
      } else {
        animMachine.transition(AnimState.Idle);
      }
    }

    // Body faces state.rotation. On death the clip lays him horizontal but
    // pivots at hip height (root motion is stripped), so ease the whole rig down
    // to settle the body on the ground instead of floating.
    const dropTarget = state.dead ? -0.78 : 0;
    deathDrop.current += (dropTarget - deathDrop.current) * Math.min(1, 5 * dt);
    groupRef.current.position.copy(state.position);
    groupRef.current.position.y = Math.max(0, state.position.y) + deathDrop.current;
    const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.rotation);
    const rotLerp = 1 - Math.exp(-12 * dt);
    groupRef.current.quaternion.slerp(targetQuat, rotLerp);

    // Locomotion cadence + direction (body turns to face travel, so travel is
    // forward-dominant — strafe clips only kick in on hard sideways motion).
    const planarSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    animMachine.matchLocomotionSpeed(planarSpeed);
    if (planarSpeed > 0.3) {
      const fSin = Math.sin(state.rotation),
        fCos = Math.cos(state.rotation);
      const fwdAmt = state.velocity.x * fSin + state.velocity.z * fCos;
      const rightAmt = -state.velocity.x * fCos + state.velocity.z * fSin;
      animMachine.setMoveDirection(fwdAmt, rightAmt);
    }

    // Crouch: no dedicated clip yet — squash the rig vertically so it reads as a
    // duck while keeping feet planted (origin is at the feet). Placeholder until
    // a crouch/crouch-walk clip is added.
    const crouchTarget = state.crouching ? 0.78 : 1;
    crouchScale.current += (crouchTarget - crouchScale.current) * Math.min(1, 10 * dt);
    if (modelRef.current) modelRef.current.scale.y = crouchScale.current;

    // Subtle lean into movement for weight.
    const sin = Math.sin(state.rotation),
      cos = Math.cos(state.rotation);
    const fwd = state.velocity.x * sin + state.velocity.z * cos;
    const side = state.velocity.x * cos - state.velocity.z * sin;
    const targetX = -fwd * 0.02;
    const targetZ = side * 0.02;
    const lk = 1 - Math.exp(-8 * dt);
    lean.current.x += (targetX - lean.current.x) * lk;
    lean.current.z += (targetZ - lean.current.z) * lk;
    if (modelRef.current) modelRef.current.rotation.set(lean.current.x, 0, lean.current.z);

    // UNDO last frame's pitch correction before the mixer runs, so re-applying it
    // is idempotent (a finished one-shot clip like Death stops rewriting the Hips,
    // and an unconditional premultiply would compound -90°/frame and spin it).
    if (needsPitchFix && hipsBoneRef.current && hipsFixApplied.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX_INV);
    }

    animMachine.update(dt);

    // Stand the character upright — cancel the rig's baked-in root pitch (Valor
    // GLBs only; our FBX→GLB exports are already upright).
    if (needsPitchFix && hipsBoneRef.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX);
      hipsFixApplied.current = true;
    }

    // Drive the rifle from the hand bone (it's a sibling, not parented in the rig).
    if (gunRef.current && handBoneRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false);
      _gunScratch.copy(groupRef.current.matrixWorld).invert();
      gunRef.current.matrix.multiplyMatrices(_gunScratch, handBoneRef.current.matrixWorld).multiply(GUN_GRIP);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={modelRef}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
});

useGLTF.preload("/characters/glb/player_man.glb");
useGLTF.preload(RIFLE_PATH);
