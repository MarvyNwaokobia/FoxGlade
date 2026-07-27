"use client";

import { memo, useEffect, useMemo, useRef } from "react";
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
  isUpperBodyTrack,
  CLIP_NAMES,
} from "@/engine/animation";
import { BOMB } from "@/engine/config/round";
import { runtime } from "@/engine/runtime";

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
  throwAt: number; // performance.now of the last bomb lob (drives the throw clip)
  resting: boolean; // seated indoors (drives the sit clip)
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
//
// VALOR'S METHOD: Valor's guns are authored to a fixed convention — barrel = +Z,
// up = +Y, origin AT the pistol grip — so a single hand-relative GUN_GRIP socket
// works on the shared Mixamo skeleton. Our imported rifle.glb doesn't follow that
// convention (different axes, origin off the grip, a baked node rotation + 100×
// scale), so we NORMALISE it to Valor's convention on load (see rifleProto) and
// then use Valor's exact grip. Orienting to the HAND (not the rig) is what makes
// the barrel follow the aim pose.
const GUN_SCALE = 0.17; // counters the model's baked 100× node scale → ~0.9 m
// GUN_GRIP, hand-relative (Valor's numbers). Live-tunable via the keys below; once
// dialed, bake the logged values into gripTune's defaults and set GUN_TUNER=false.
//   I/K pitch · J/L yaw · U/O roll · 4/6 x · 8/2 y · 7/9 z · -/= scale · P = log.
const GUN_TUNER = false; // gun grip parked for now (revisit); keys freed for play
const gripTune = { rx: Math.PI / 2, ry: 0, rz: 0, ox: 0, oy: 0.02, oz: 0.04, scale: GUN_SCALE };
const _gunScratch = new THREE.Matrix4();
const _gunWorld = new THREE.Matrix4();
const _gunScaleVec = new THREE.Vector3();
const _gunOff = new THREE.Vector3();
const _gunEuler = new THREE.Euler();
const _tmpQ = new THREE.Quaternion();

// Held bomb: nudge it into the palm of the throwing hand during the wind-up.
const BOMB_GRIP = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 0.03, 0.05),
  new THREE.Quaternion(),
  new THREE.Vector3(1, 1, 1)
);

// Recent-shot window (seconds) that keeps the standing Fire clip playing.
const FIRE_HOLD = 0.22;

// Weapon-ready pose (Marvy's call): hold the shooting clip's aim frame as a
// STATIC additive over the lowered rifle-idle, so the character always keeps the
// rifle up in two hands while the legs keep walking/running underneath. Camera
// recoil (PlayerController) sells the shot, so this layer just holds the stance.
const AIM_HOLD_TIME = 0.0; // seconds into gunplayShooting to freeze the aim pose (bump if it looks mid-recoil)
const AIM_WEIGHT = 1.0; // additive weight of the aim-ready pose (0 = lowered idle, 1 = full aim)

// Seated clips bake their hip-drop into the (stripped) Hips position track, so
// the rig would sit at standing height = floating. Settle the whole rig down by
// this much while seated — same code-driven trick as the death drop. Tune to the
// Sitting clip if he sits too high/low.
const SIT_DROP = -0.4;
// Crouch clips also bake a hip-drop that gets stripped → the crouch pose floats.
// Settle it back to the ground (tune if he hovers / sinks while crouched).
const CROUCH_DROP = -0.45;

// Show the socketed rifle in-hand. GUN_SCALE (above) counters the model's baked
// 100× node scale so it renders at real-rifle size; GUN_GRIP tunes the grip.
const SHOW_GUN = true;

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
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);
  const lastFireAt = useRef(state.fireAt);
  const deathPlayed = useRef(false);
  const deathDrop = useRef(0); // eased downward offset that settles the corpse
  // Additive upper-body fire layer (run-and-gun) + its eased weight.
  const fireAddAction = useRef<THREE.AnimationAction | null>(null);
  const fireLayerBuilt = useRef(false);
  const fireWeight = useRef(0);
  // Edge trackers for the one-shot / stateful movement clips.
  const lastThrowAt = useRef(state.throwAt);
  const prevGrounded = useRef(true);
  const wasResting = useRef(false);
  const sipClock = useRef(4); // seconds until the next seated sip while resting
  const prevRotation = useRef(state.rotation); // for turn-in-place detection
  const turnHold = useRef(0); // keeps the turn clip up briefly (anti-flicker)
  const heldBombRef = useRef<THREE.Mesh | null>(null); // bomb in hand during wind-up

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
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => {
          // Matte — kill the wet/shiny plastic highlight on the character.
          const sm = m as THREE.MeshStandardMaterial;
          if ("roughness" in sm) sm.roughness = Math.max(sm.roughness ?? 1, 0.9);
          if ("metalness" in sm) sm.metalness = 0;
          mats.push(m);
        });
      }
    });
    materials.current = mats;
    return clone;
  }, [scene]);

  const rifleProto = useMemo(() => {
    const src = SkeletonUtils.clone(rifle.scene);
    src.updateMatrixWorld(true);
    // Normalise the imported rifle to VALOR'S convention (barrel +Z, up +Y, origin
    // at the grip) so Valor's shared hand-grip socket works:
    //  (1) bake node transforms (incl. the baked 100× scale + internal rotation)
    //      into geometry — the gun's frame becomes its raw geometry frame
    //      (measured: barrel +X, up +Z, thickness +Y);
    //  (2) remap those axes onto +Z-forward / +Y-up;
    //  (3) recentre so the pistol grip sits at the origin (X-centre, lower, rear).
    const REMAP = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1), // barrel (+X) → +Z (firing dir)
      new THREE.Vector3(1, 0, 0), // thickness (+Y) → +X
      new THREE.Vector3(0, 1, 0) //  up (+Z) → +Y
    );
    const flat = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    src.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld); // bake node transform
        g.applyMatrix4(REMAP); // to +Z-forward / +Y-up
        const baked = new THREE.Mesh(g, mesh.material);
        baked.castShadow = true;
        flat.add(baked);
        geos.push(g);
      }
    });
    // Recentre: origin ≈ the pistol grip (X-centre, near the bottom, ~30% from the
    // rear), so socketing the origin to the hand puts the grip in the palm.
    const box = new THREE.Box3().setFromObject(flat);
    const size = box.getSize(new THREE.Vector3());
    const grip = new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.min.y + size.y * 0.12,
      box.min.z + size.z * 0.3
    );
    for (const g of geos) g.translate(-grip.x, -grip.y, -grip.z);
    return flat;
  }, [rifle.scene]);

  // Kick off the Mixamo FBX load immediately (shared across all rigs).
  useMemo(() => {
    loadMixamoAnimations();
  }, []);

  // Live grip tuner (DEV): dial the rifle into the hand in-browser, press P to log,
  // then bake the numbers into gripTune's defaults and set GUN_TUNER = false.
  useEffect(() => {
    if (!GUN_TUNER) return;
    console.log("[gripTune] I/K pitch · J/L yaw · U/O roll · 4/6 x · 8/2 y · 7/9 z · -/= scale · P log");
    const onKey = (e: KeyboardEvent) => {
      const R = 0.08, T = 0.02, S = 0.01;
      switch (e.code) {
        case "KeyI": gripTune.rx += R; break;
        case "KeyK": gripTune.rx -= R; break;
        case "KeyJ": gripTune.ry += R; break;
        case "KeyL": gripTune.ry -= R; break;
        case "KeyU": gripTune.rz += R; break;
        case "KeyO": gripTune.rz -= R; break;
        case "Digit6": gripTune.ox += T; break;
        case "Digit4": gripTune.ox -= T; break;
        case "Digit8": gripTune.oy += T; break;
        case "Digit2": gripTune.oy -= T; break;
        case "Digit9": gripTune.oz += T; break;
        case "Digit7": gripTune.oz -= T; break;
        case "Equal": gripTune.scale += S; break;
        case "Minus": gripTune.scale = Math.max(0.01, gripTune.scale - S); break;
        case "KeyP": console.log("[gripTune]", JSON.stringify(gripTune)); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

        // Build the additive upper-body AIM-READY layer: take the shot clip's aim
        // pose, mask it to arm/torso/head tracks, make it additive relative to the
        // lowered idle, and FREEZE it on one frame. Held over the base locomotion
        // action it keeps the rifle up in two hands while the legs walk/run. Legs
        // are untouched because the layer only carries upper-body tracks.
        if (!fireLayerBuilt.current && mixerRef.current) {
          fireLayerBuilt.current = true;
          const mixer = mixerRef.current;
          const fire = mixamoClips.get(CLIP_NAMES.gunplayShooting);
          const idle = mixamoClips.get(CLIP_NAMES.rifleIdle);
          if (fire && idle) {
            const upper = fire.clone();
            const idleNames = new Set(idle.tracks.map((t) => t.name));
            // makeClipAdditive subtracts a reference value per track, so keep only
            // upper-body tracks that also exist in the idle reference clip.
            upper.tracks = upper.tracks.filter((t) => isUpperBodyTrack(t.name) && idleNames.has(t.name));
            if (upper.tracks.length > 0) {
              upper.name = "aimReadyAdditive";
              THREE.AnimationUtils.makeClipAdditive(upper, 0, idle, 30);
              const action = mixer.clipAction(upper);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.play();
              action.paused = true; // hold a static aim frame — no shoot-loop bob
              action.time = AIM_HOLD_TIME;
              action.setEffectiveWeight(0); // eased up to AIM_WEIGHT below
              fireAddAction.current = action;
            }
          }
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
    const firedRecently = (performance.now() - state.fireAt) / 1000 < FIRE_HOLD;
    if (state.fireAt !== lastFireAt.current) lastFireAt.current = state.fireAt;

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

      // One-shot / stateful movement clips (edge-triggered). A missing clip makes
      // the transition a clean no-op, so these are safe before Marvy's downloads.
      if (state.throwAt !== lastThrowAt.current) {
        lastThrowAt.current = state.throwAt;
        if (state.throwAt > 0) animMachine.transition(AnimState.Throw, true);
      }
      if (prevGrounded.current && !state.grounded) {
        // A running jump reads as a hurdle/vault; a standing jump is a plain jump.
        const hurdle = state.moving && state.running;
        animMachine.transition(hurdle ? AnimState.Vault : AnimState.Jump, true);
      }
      prevGrounded.current = state.grounded;
      if (state.resting && !wasResting.current) animMachine.transition(AnimState.Sit, true);
      else if (!state.resting && wasResting.current) animMachine.transition(AnimState.Idle, true);
      wasResting.current = state.resting;
      // While seated, take a sip every few seconds (the "Sitting Drinking" clip).
      if (state.resting) {
        sipClock.current -= dt;
        if (sipClock.current <= 0 && animMachine.state === AnimState.Sit) {
          sipClock.current = 6 + Math.random() * 4;
          animMachine.transition(AnimState.Drink, true);
        }
      } else {
        sipClock.current = 4;
      }

      // Turn-in-place: how fast the body's target facing is sweeping (turning the
      // camera while standing). Above a threshold, play the turn shuffle instead
      // of a static idle — a short hold prevents flicker at the threshold.
      let dRot = state.rotation - prevRotation.current;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      prevRotation.current = state.rotation;
      if (Math.abs(dRot) / Math.max(dt, 1e-3) > 1.4) turnHold.current = 0.22;
      else turnHold.current = Math.max(0, turnHold.current - dt);
      const turningInPlace = !state.moving && state.grounded && !state.crouching && turnHold.current > 0;

      // Base locomotion — but never while a committed clip owns the whole body.
      const busyStates: AnimState[] = [
        AnimState.Throw, AnimState.Jump, AnimState.Vault, AnimState.Sit, AnimState.Drink, AnimState.Grab,
        AnimState.Dodge, AnimState.HitLight, AnimState.HitHeavy,
      ];
      const busy = busyStates.includes(animMachine.state);
      if (!busy) {
        if (state.crouching) {
          animMachine.transition(state.moving ? AnimState.CrouchWalk : AnimState.CrouchIdle);
        } else if (state.moving) {
          animMachine.transition(state.running ? AnimState.Run : AnimState.Walk);
        } else if (turningInPlace) {
          animMachine.transition(AnimState.Turn);
        } else if (firedRecently && !fireAddAction.current) {
          animMachine.transition(AnimState.Fire); // fallback if the additive layer failed to build
        } else {
          animMachine.transition(AnimState.Idle);
        }
      }
    }

    // Weapon-ready aim weight: hold the rifle up over whatever the legs are doing,
    // eased in/out. Dropped only while a committed full-body clip owns the arms
    // (bomb throw, vault, seated rest, grab) or on death.
    if (fireAddAction.current) {
      const s = animMachine.state;
      const armed =
        !state.dead &&
        s !== AnimState.Throw && s !== AnimState.Vault &&
        s !== AnimState.Sit && s !== AnimState.Drink && s !== AnimState.Grab &&
        s !== AnimState.Death;
      const target = armed ? AIM_WEIGHT : 0;
      fireWeight.current += (target - fireWeight.current) * Math.min(1, 10 * dt);
      fireAddAction.current.setEffectiveWeight(fireWeight.current);
    }

    // Body faces state.rotation. On death the clip lays him horizontal but
    // pivots at hip height (root motion is stripped), so ease the whole rig down
    // to settle the body on the ground instead of floating.
    const seated = animMachine.state === AnimState.Sit || animMachine.state === AnimState.Drink;
    const crouched = animMachine.state === AnimState.CrouchIdle || animMachine.state === AnimState.CrouchWalk;
    const dropTarget = state.dead ? -0.78 : seated ? SIT_DROP : crouched ? CROUCH_DROP : 0;
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

    // (Crouch now uses real CrouchIdle/CrouchWalk clips — the old vertical-squash
    // placeholder was removed.)

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

    // Drive the gun from the hand bone (Valor's socket): gun.matrix =
    // groupRef⁻¹ · handBoneWorld · GUN_GRIP → renders exactly at the hand, oriented
    // to the animated grip (which carries the aim pose). The gun mesh is normalised
    // to +Z-forward / +Y-up with its origin at the grip, so GUN_GRIP is Valor's.
    if (gunRef.current && handBoneRef.current && groupRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false); // refresh hand + ancestors
      _gunWorld.compose(
        _gunOff.set(gripTune.ox, gripTune.oy, gripTune.oz),
        _tmpQ.setFromEuler(_gunEuler.set(gripTune.rx, gripTune.ry, gripTune.rz)),
        _gunScaleVec.setScalar(gripTune.scale)
      );
      _gunScratch.copy(groupRef.current.matrixWorld).invert();
      gunRef.current.matrix.multiplyMatrices(_gunScratch, handBoneRef.current.matrixWorld).multiply(_gunWorld);
    }

    // Held bomb + hand position — only during a throw (otherwise this per-frame
    // bone-matrix walk is wasted work). Publishes the hand's world position so the
    // controller lobs the real bomb FROM the hand, and shows the bomb in-hand
    // through the wind-up.
    const throwElapsed = state.throwAt > 0 ? (performance.now() - state.throwAt) / 1000 : Infinity;
    if (handBoneRef.current && throwElapsed < BOMB.windup + 0.15) {
      handBoneRef.current.updateWorldMatrix(true, false);
      runtime.rightHandPos.setFromMatrixPosition(handBoneRef.current.matrixWorld);
      const held = heldBombRef.current;
      if (held) {
        held.visible = throwElapsed < BOMB.windup && groupRef.current.visible;
        if (held.visible) {
          _gunScratch.copy(groupRef.current.matrixWorld).invert();
          held.matrix.multiplyMatrices(_gunScratch, handBoneRef.current.matrixWorld).multiply(BOMB_GRIP);
        }
      }
    } else if (heldBombRef.current && heldBombRef.current.visible) {
      heldBombRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={modelRef}>
        <primitive object={clonedScene} />
      </group>
      {/* Bomb held in the throwing hand during the wind-up (matrix driven from
          the hand bone each frame; hidden until a throw starts). */}
      <mesh ref={heldBombRef} visible={false} matrixAutoUpdate={false} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#2a2e34" roughness={0.5} metalness={0.35} />
      </mesh>
    </group>
  );
});

useGLTF.preload("/characters/glb/player_man.glb");
useGLTF.preload(RIFLE_PATH);
