"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { dressCharacterMaterial } from "./materials";
import {
  AnimationStateMachine,
  AnimState,
  buildAnimMap,
  loadMixamoAnimations,
  getMixamoClips,
  isMixamoLoadComplete,
  getClipStride,
  CLIP_NAMES,
} from "@/engine/animation";
import type { HitDirection } from "@/engine/animation";
import { BOMB } from "@/engine/config/round";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import type { WeaponId } from "@/engine/config/shop";
import { makeGunMesh, handGunWorldMatrix, muzzleWorldPos } from "./GunMesh";
import { buildGunModel, useGunModelScene } from "./gunModels";

/** Every material on an object, so the camera fade can reach them. */
function collectMaterials(obj: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat && out.push(mat));
  });
  return out;
}

/** Free a swapped-out procedural gun's geometry + materials (no leaks on re-equip). */
function disposeGroup(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat?.dispose());
    }
  });
}

/**
 * The per-frame state the rig reads to drive its animation + transform. The
 * PlayerController owns one of these and mutates it every frame; the rig only
 * reads. Keeping it a plain mutable object (not React state) keeps the 60fps
 * loop out of React's render path.
 */
export interface PlayerRigState {
  position: THREE.Vector3;
  rotation: number; // body yaw (radians)
  aimPitch: number; // camera aim pitch (radians) — drives the spine aim-elevation
  velocity: THREE.Vector3;
  moving: boolean;
  running: boolean;
  crouching: boolean;
  grounded: boolean;
  dead: boolean;
  fireAt: number; // performance.now of the last shot
  aimYaw: number; // camera aim yaw (radians) — turns the torso onto the crosshair
  hitAt: number; // performance.now of the last hit taken (drives the flinch)
  hitSerious: boolean; // worth a body flinch at all? (chip damage isn't — see below)
  hitHeavy: boolean; // was that a big hit? → the heavier flinch clip
  hitDir: HitDirection; // which side it came from, so he flinches the right way
  reloading: boolean; // drives the reload clip
  throwAt: number; // performance.now of the last bomb lob (drives the throw clip)
  dodgeAt: number; // performance.now of the last dodge roll (drives the dodge clip)
  grabAt: number; // performance.now of the last interact (drives the pick-up clip)
  resting: boolean; // seated indoors (drives the sit clip)
  visible: boolean; // false only when fully faded (camera extremely close)
  opacity: number; // 0..1 — fades as the camera closes in, so he never hard-vanishes
}

export type CharacterModelId = "man" | "sentinel" | "phantom" | "berserker" | "operator" | "ninja" | "female";

export const MODEL_PATHS: Record<CharacterModelId, string> = {
  man: "/characters/glb/player_man.glb", // realistic Mixamo character (Marvy's), converted FBX→GLB
  sentinel: "/characters/glb/sentinel.glb",
  phantom: "/characters/glb/phantom.glb",
  berserker: "/characters/glb/berserker.glb",
  operator: "/characters/glb/operator.glb",
  // Coming-soon roster previews only (Onboarding.tsx's locked slots) — not
  // selectable heroes yet. Converted from design/Mixamo/Ninja.fbx and
  // Female2.fbx ("Kachujin") (2026-08-16): the two least-jarring of ~9+5
  // unconverted Mixamo candidates checked against the medieval setting (the
  // rest were sci-fi, anime-fantasy pirate/warrior costumes, or WWII
  // military — see the commit history for the full survey). Raw FBX import
  // came out ~130x too small — normalized to the same 1.8m-tall,
  // feet-at-origin convention every other model here uses.
  ninja: "/characters/glb/ninja.glb",
  female: "/characters/glb/female.glb",
};

// Every GLB here is Blender-exported (Valor's rigs AND our FBX→GLB conversions),
// and they all carry the ~90° Z-up→Y-up root-pitch offset the mixer clips don't
// account for — so all of them need the per-frame HIPS_PITCH_FIX (see below).
// Confirmed empirically: without it the converted `man` lies flat / floats.
const NEEDS_PITCH_FIX = new Set<CharacterModelId>([
  "man",
  "sentinel",
  "phantom",
  "berserker",
  "operator",
  "ninja",
  "female",
]);

// The Blender-exported GLB rigs carry a ~90° pitch offset on the root (Hips) bone
// vs the Mixamo clips (Z-up→Y-up export), which lays the character out FLAT. The
// clips otherwise drive the rig correctly, so we cancel it with a constant -90° X
// rotation premultiplied onto the Hips each frame AFTER the mixer runs. Pure
// bone-quaternion math (Safari-safe, unlike rest-pose retargeting).
const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const HIPS_PITCH_FIX_INV = HIPS_PITCH_FIX.clone().invert();

// The rifle is driven from the right-hand bone each frame rather than PARENTED
// into the skeleton (parenting a child corrupts the animation bind → T-pose). The
// procedural rifle (GunMesh, ported from Valor) is authored to the +Z-forward /
// up +Y / grip-at-origin convention the socket expects, so it drops into the hand
// with Valor's grip and no per-model fixup.
//
// GUN_GRIP, hand-relative (Valor's exact numbers). The procedural rifle (GunMesh)
// is life-sized and already in the +Z-forward / grip-at-origin convention, so
// scale is 1 and the grip drops in like Valor's fighters. Live-tunable via the
// keys below if a nudge is needed; bake the logged values here + set GUN_TUNER=false.
//   I/K pitch · J/L yaw · U/O roll · 4/6 x · 8/2 y · 7/9 z · -/= scale · P = log.
// rx = -90°: the hand bone's local frame is NOT world-aligned, so the gun's
// authored +Z-forward axis came out pointing along world -X — the rifle was held
// straight out sideways across the body, in every pose, for the player AND every
// armed NPC.
//
// The axis was found by sweeping each one headlessly; the SIGN was found by
// measuring, after eyeballing screenshots got it backwards (easy to do — from
// behind the character, a stock reads much like a barrel). The check that
// settled it: take the gun's named `muzzle` anchor, compute its world direction
// from the grip origin, and dot it against the camera's aim vector.
//   rx=+90 → -0.787  (muzzle pointing back at the player — wrong)
//   rx=-90 → +0.841  (muzzle down the aim line — right)
// The residual off-axis component is just the idle clip's relaxed arm pose; the
// spine traverse pulls it onto the crosshair when aiming.
// rz = the ROLL about the barrel. rx above got the muzzle pointing down the aim
// line, but left the weapon rolled onto its side — sights facing left rather than
// up. Measured the same way: take the gun's local +Y in world space, project world
// up perpendicular to the barrel, and read the signed angle between them about the
// barrel axis. That came out at -105.2°, which is this value. (Euler order is XYZ,
// so rz is applied first, in the gun's own frame — it rolls the weapon without
// disturbing the rx yaw fix.)
const GUN_TUNER = false; // keys freed for play
const gripTune = { rx: -Math.PI / 2, ry: 0, rz: -1.8368, ox: 0, oy: 0.02, oz: 0.04, scale: 1 };
// The grip's own scratch (euler/quat/offset/scale) now lives inside
// handGunWorldMatrix, so the rig only needs the two matrices it composes with.
const _gunScratch = new THREE.Matrix4();
const _gunWorld = new THREE.Matrix4();

// Aim elevation + TRAVERSE: pitch AND yaw the upper spine toward the aim so the
// socketed gun actually tracks the crosshair, instead of only nodding up and down
// while the muzzle points wherever the locomotion clip happened to leave it.
//
// The pitch half was already here. The yaw half is new, and it's the fix for
// "the gun doesn't point where I'm shooting": the body faces its travel direction
// while the camera aims somewhere else, so without a torso traverse the weapon can
// sit 30°+ off the reticle. Clamped, because past ~45° a spine-only twist stops
// looking like aiming and starts looking broken — beyond that the body should turn,
// which it does whenever you're moving.
const SPINE_PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const SPINE_PITCH_GAIN = -0.6; // negative: aim down → gun down (sign verified by screenshot)
const SPINE_YAW_GAIN = 0.75; // how much of the body↔aim yaw error the torso takes up
const SPINE_YAW_CLAMP = 0.8; // radians (~46°) — past this the body turns instead
const _spineQ = new THREE.Quaternion();
const _spineYawQ = new THREE.Quaternion();
const _spineAxisY = new THREE.Vector3(0, 1, 0);

/** Shortest signed angle from a to b, in radians. */
function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Held bomb: nudge it into the palm of the throwing hand during the wind-up.
const BOMB_GRIP = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 0.03, 0.05),
  new THREE.Quaternion(),
  new THREE.Vector3(1, 1, 1)
);

// Recent-shot window (seconds) that keeps the standing Fire clip playing.
const FIRE_HOLD = 0.22;

// Getting shot plays a real flinch clip — but SPARINGLY, for two reasons found by
// screenshotting it under live fire:
//
//  1. Mixamo's hit-reaction clips are UNARMED animations. On a rifleman the arms
//     fly up and the socketed gun swings off with the hand, which reads as a bug.
//  2. A blocker lands ~9 damage every 2.2s and there are five of them, so a
//     short cooldown had the character flinching almost continuously — sliding
//     around mid-flinch, unable to run, gun waving.
//
// So the full-body flinch is reserved for hits that genuinely matter (a heavy hit,
// or one that drops you into the danger band — see PlayerController). Ordinary
// chip damage reads through the screen shake, the red vignette and the directional
// damage arc, none of which fight the rifle pose. Rare and meaningful beats
// constant and broken.
const FLINCH_COOLDOWN = 2.0; // seconds

// REMOVED: the additive "aim-ready" upper-body layer.
//
// It froze one frame of gunplayShooting, made it additive against rifleIdle, and
// held it over whatever the legs were doing — the idea being "keep the rifle up
// while he runs". Two things were wrong with it:
//
//  1. An additive pose delta is only valid over clips in the SAME pose family.
//     Held over crouchIdle (whose arms sit somewhere completely different) it
//     produced crouchArms + (shootArms − idleArms) — which is why the character
//     crouched folded double with the rifle jabbed vertically over his head.
//  2. It wasn't needed. Every locomotion clip in this set is already a
//     rifle-held clip (rifleIdle / walk / run / strafes / crouch), so the weapon
//     is in two hands at the ready without any layer at all.
//
// Verified by screenshot: with the layer off, crouch reads as a correct
// shouldered stance and walk/run hold the rifle across the body. The per-shot
// beat is the Fire state (below) plus the camera recoil in PlayerController.

// Pose drop, DERIVED — not guessed.
//
// MixamoLoader strips the whole Hips position track (it carries cm-scale root
// motion that would fling the body), which also throws away the vertical dip that
// crouch / sit / death clips bake in. The rig then plays a crouch at standing hip
// height, so it floats — and the old fix was three hand-tuned constants
// (CROUCH_DROP -0.45, SIT_DROP -0.4, death -0.78) applied to the whole group.
// They were each eyeballed against a different clip, they stacked with the spine
// aim and the hips pitch fix, and the crouch pose came out folded double.
//
// The loader already measures every clip's mean hip height (ClipStride.hipY, in
// clip units) before stripping the track. So the correct drop is just the clip's
// hip height minus the idle's, converted to metres and scaled to this rig — one
// formula that is right for every clip, including ones nobody has tuned yet.
const MIXAMO_UNITS_PER_METER = 100;
/** Clamp: a derived drop should never exceed a plausible crouch/lie-down. */
const MAX_POSE_DROP = 0.95;

// Show the socketed rifle in-hand (the procedural GunMesh rifle).
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
  const spineBoneRef = useRef<THREE.Object3D | null>(null); // upper spine → aim elevation
  const spineAimApplied = useRef(false);
  const spineAimUndo = useRef(new THREE.Quaternion());
  const hipsFixApplied = useRef(false);
  const lean = useRef({ x: 0, z: 0 });
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);
  const lastFireAt = useRef(state.fireAt);
  const lastHitAt = useRef(state.hitAt);
  const lastFlinchAt = useRef(-Infinity); // rate-limits the flinch clip
  const deathPlayed = useRef(false);
  const deathDrop = useRef(0); // eased downward offset that settles the corpse
  // Edge trackers for the one-shot / stateful movement clips.
  const lastThrowAt = useRef(state.throwAt);
  const lastDodgeAt = useRef(state.dodgeAt);
  const lastGrabAt = useRef(state.grabAt);
  const prevGrounded = useRef(true);
  const wasResting = useRef(false);
  const sipClock = useRef(4); // seconds until the next seated sip while resting
  const prevRotation = useRef(state.rotation); // for turn-in-place detection
  const turnHold = useRef(0); // keeps the turn clip up briefly (anti-flicker)
  const heldBombRef = useRef<THREE.Mesh | null>(null); // bomb in hand during wind-up
  const rigHipY = useRef(1); // this rig's bind hip height (m), for scaling clip drops

  const { scene, animations } = useGLTF(MODEL_PATHS[model]);
  // The real weapon mesh (ported from Valor), for THIS rig only — it's the
  // player's own body (PlayerRig only ever mounts once, from
  // PlayerController), not the shared NPC rig, so reading the player's
  // equipped weapon here is safe.
  const equippedWeaponId = useGame((s) => s.equippedWeapon);
  const gunGltfScene = useGunModelScene(equippedWeaponId);

  /**
   * How far to settle the rig for the clip currently playing — derived from that
   * clip's own baked hip height vs the idle's, rather than a per-clip constant.
   * Returns metres (negative = down). Zero when the clip isn't measured (an
   * in-place clip with no hips track), which is the correct no-op.
   */
  const poseDrop = () => {
    const name = animMachine.currentClipName;
    if (!name) return 0;
    const clip = getClipStride(name);
    const idle = getClipStride(CLIP_NAMES.rifleIdle);
    if (!clip || !idle || idle.hipY <= 0) return 0;
    // Clip units → metres, then scaled to THIS rig's proportions (a taller
    // character's hips travel further for the same pose).
    const drop = ((clip.hipY - idle.hipY) / MIXAMO_UNITS_PER_METER) * (rigHipY.current / 1.0);
    return THREE.MathUtils.clamp(drop, -MAX_POSE_DROP, 0);
  };

  const animMachine = useMemo(() => new AnimationStateMachine(buildAnimMap()), []);

  const materials = useRef<THREE.Material[]>([]);
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.Material[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // He casts a real shadow now. The blob decal under him never agreed with
        // the light, which is most of why he read as pasted onto the ground
        // rather than standing on it — and with the sun sweeping across the day
        // a real shadow also tells you what time it is.
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false; // his bounds swing wide when animating
        // Own the materials (clone) so the camera fade opacity doesn't leak to
        // the source asset / other instances.
        child.material = Array.isArray(child.material)
          ? child.material.map((m) => m.clone())
          : child.material.clone();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => {
          dressCharacterMaterial(m);
          mats.push(m);
        });
      }
    });
    materials.current = mats;
    return clone;
  }, [scene]);

  // The in-hand gun is a procedural mesh (GunMesh) matching the equipped weapon;
  // we rebuild it whenever the player equips a different one in the market.
  const currentGunId = useRef<WeaponId | null>(null);

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
          if (!spineBoneRef.current && /spine1$/i.test(child.name)) spineBoneRef.current = child;
        }
      });
      if (hipsBone) {
        groupRef.current.updateWorldMatrix(true, true);
        const hipY = (hipsBone as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;
        animMachine.setRigScale(hipY);
        rigHipY.current = Math.max(0.3, hipY); // also scales the derived pose drop
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
          const id = equippedWeaponId; // matches gunGltfScene (same source render)
          const gun = buildGunModel(gunGltfScene, id);
          gun.matrixAutoUpdate = false;
          groupRef.current.add(gun);
          gunRef.current = gun;
          currentGunId.current = id;
          // The weapon has to fade with the man holding it. `materials.current`
          // is built in the clonedScene memo, which runs long before this — so
          // the gun was never in the fade list, and every time the camera closed
          // in (a wall, a doorway) you got a solid rifle and a pair of solid
          // hands hanging in the air over an invisible body.
          materials.current.push(...collectMaterials(gun));
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
    // The held bomb is JSX, so it never went through the material collection
    // above — it would hang in the air like the gun did.
    const bombMat = heldBombRef.current?.material as THREE.Material | undefined;
    if (bombMat) {
      bombMat.transparent = op < 0.99;
      bombMat.opacity = op;
      bombMat.depthWrite = op >= 0.99;
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

      // Taking a hit: a real flinch clip (light or heavy, by how hard it landed),
      // rate-limited so sustained fire can't lock the body in a flinch loop.
      if (state.hitAt !== lastHitAt.current) {
        lastHitAt.current = state.hitAt;
        const now = performance.now();
        if (state.hitAt > 0 && state.hitSerious && now - lastFlinchAt.current > FLINCH_COOLDOWN * 1000) {
          lastFlinchAt.current = now;
          animMachine.transitionHit(
            state.hitHeavy ? AnimState.HitHeavy : AnimState.HitLight,
            state.hitDir
          );
        }
      }

      // One-shot / stateful movement clips (edge-triggered). A missing clip makes
      // the transition a clean no-op, so these are safe before Marvy's downloads.
      if (state.throwAt !== lastThrowAt.current) {
        lastThrowAt.current = state.throwAt;
        if (state.throwAt > 0) animMachine.transition(AnimState.Throw, true);
      }
      // The dodge clip has been loaded and wired into the state machine since the
      // animation pass; nothing had ever been able to trigger it.
      if (state.dodgeAt !== lastDodgeAt.current) {
        lastDodgeAt.current = state.dodgeAt;
        if (state.dodgeAt > 0) animMachine.transition(AnimState.Dodge, true);
      }
      // Interact gesture (claim a treasure / bank at the vault / shop at the stall).
      if (state.grabAt !== lastGrabAt.current) {
        lastGrabAt.current = state.grabAt;
        if (state.grabAt > 0) animMachine.transition(AnimState.Grab, true);
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
        if (state.reloading) {
          // Reload owns the arms; the legs keep their locomotion cadence via the
          // clip's own timing. It's interruptible so movement stays responsive.
          animMachine.transition(AnimState.Reload);
        } else if (state.crouching) {
          animMachine.transition(state.moving ? AnimState.CrouchWalk : AnimState.CrouchIdle);
        } else if (state.moving) {
          animMachine.transition(state.running ? AnimState.Run : AnimState.Walk);
        } else if (turningInPlace) {
          animMachine.transition(AnimState.Turn);
        } else if (firedRecently) {
          // Standing and shooting → the full-body Fire clip. (Firing while moving
          // keeps the locomotion clip, which is already rifle-held; the shot reads
          // through the camera recoil + muzzle flash rather than a pose change.)
          animMachine.transition(AnimState.Fire);
        } else {
          animMachine.transition(AnimState.Idle);
        }
      }
    }

    // Body faces state.rotation. Settle the rig by the drop the CURRENT clip
    // actually bakes in (see MAX_POSE_DROP above) — derived from its own measured
    // hip height against the idle's, so crouch, sit and death all land correctly
    // without three separate magic numbers fighting each other.
    deathDrop.current += (poseDrop() - deathDrop.current) * Math.min(1, 5 * dt);
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

    // UNDO last frame's corrections before the mixer runs, so re-applying them is
    // idempotent (a finished one-shot clip stops rewriting the bones, and an
    // unconditional premultiply would compound every frame).
    if (spineBoneRef.current && spineAimApplied.current) {
      spineBoneRef.current.quaternion.premultiply(spineAimUndo.current);
      spineAimApplied.current = false;
    }
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

    // Aim elevation + traverse: pitch AND yaw the upper body onto the aim line so
    // the socketed gun tracks the crosshair in both axes. Applied on top of the
    // animated pose (after the mixer + hips fix), suppressed while dead/seated.
    if (spineBoneRef.current && !state.dead && !state.resting) {
      // `rotation` is a MODEL rotation (the rig faces its local +Z) while
      // `aimYaw` is the CAMERA yaw (forward is -Z). The two conventions are half a
      // turn apart, which is why the controller sets the body's facing target to
      // `yaw + PI`. Comparing them raw made the error a constant ±PI, so the
      // clamp below was saturated every single frame: the torso sat permanently
      // twisted 46° off the body instead of resting square and only twisting when
      // the aim genuinely ran ahead of the feet. Harmless-looking while the gun
      // was aimed by the camera; now that the weapon is held in the hand, it
      // would throw the barrel a clean 46° off the crosshair.
      const yawErr = THREE.MathUtils.clamp(
        angleDelta(state.rotation, state.aimYaw + Math.PI) * SPINE_YAW_GAIN,
        -SPINE_YAW_CLAMP,
        SPINE_YAW_CLAMP
      );
      _spineQ.setFromAxisAngle(SPINE_PITCH_AXIS, SPINE_PITCH_GAIN * state.aimPitch);
      _spineYawQ.setFromAxisAngle(_spineAxisY, yawErr);
      _spineQ.premultiply(_spineYawQ); // yaw about world-up, then the pitch lean
      spineBoneRef.current.quaternion.premultiply(_spineQ);
      spineAimUndo.current.copy(_spineQ).invert();
      spineAimApplied.current = true;
    }

    // Drive the gun from the hand bone (Valor's socket): gun.matrix =
    // groupRef⁻¹ · handBoneWorld · GUN_GRIP → renders exactly at the hand, oriented
    // to the animated grip (which carries the aim pose). The gun mesh is normalised
    // to +Z-forward / +Y-up with its origin at the grip, so GUN_GRIP is Valor's.
    // Swap the in-hand model when a new weapon is equipped in the market. Same
    // socket convention (origin at grip, +Z forward), so the hand-follow below is
    // unchanged — only the mesh differs.
    if (SHOW_GUN && gunRef.current && groupRef.current) {
      const id = equippedWeaponId; // matches gunGltfScene (same source render)
      if (id !== currentGunId.current) {
        const stale = new Set(collectMaterials(gunRef.current));
        materials.current = materials.current.filter((m) => !stale.has(m));
        groupRef.current.remove(gunRef.current);
        disposeGroup(gunRef.current);
        const gun = buildGunModel(gunGltfScene, id);
        gun.matrixAutoUpdate = false;
        groupRef.current.add(gun);
        gunRef.current = gun;
        currentGunId.current = id;
        // Swap the fade registration too, or the new gun stays solid and the old
        // one's disposed materials linger in the list forever.
        materials.current.push(...collectMaterials(gun));
      }
    }

    if (gunRef.current && handBoneRef.current && groupRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false); // refresh hand + ancestors
      // HELD, not aimed: the hand bone gives both position and orientation, via
      // the fixed grip offset. See handGunWorldMatrix for why the old
      // orientation-from-the-camera socket had to go, and where the barrel/aim
      // disagreement it was papering over is handled instead.
      //
      // The visible payoff is the whole upper body: the weapon now rolls with a
      // lean, dips with a flinch, swings through the reload, and — because the
      // Mixamo locomotion clips are all rifle clips — the LEFT hand sits on the
      // foregrip, which was simply not reachable before.
      handGunWorldMatrix(_gunWorld, handBoneRef.current.matrixWorld, gripTune);
      // Publish the real muzzle so the tracer + flash leave the barrel tip rather
      // than a hand-tuned offset floating near the shoulder. The tracer runs from
      // here to the hitscan's impact point, so it converges on what you hit even
      // when the held barrel sits a few degrees off the reticle.
      muzzleWorldPos(runtime.muzzlePos, gunRef.current, _gunWorld);
      _gunScratch.copy(groupRef.current.matrixWorld).invert();
      gunRef.current.matrix.multiplyMatrices(_gunScratch, _gunWorld);
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
