"use client";

import { memo, useMemo, useRef } from "react";
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
} from "@/engine/animation";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { makeRifle, handGunWorldMatrix, muzzleWorldPos } from "./GunMesh";
import { buildArchetypeKit, type Archetype, type KitPiece } from "./ArchetypeKit";

/**
 * State the NPC's AI feeds the rig each frame. Position + facing are handled by
 * the PARENT group (the NPC component already moves/rotates it), so the rig only
 * needs the animation drivers — it animates in place at local origin.
 */
export interface NpcRigState {
  moving: boolean;
  running: boolean;
  fireAt: number; // performance.now of the last shot (-1 = unarmed)
  speed: number; // planar m/s, for foot-skate-matched cadence
  dead?: boolean; // plays the death clip + settles the corpse (see DEATH_LINGER_MS)
  hitAt?: number; // performance.now of the last non-lethal hit → stagger + flash punch
  /** Travel direction relative to the NPC's facing (it faces the player), so a
   *  sideways step plays a strafe clip instead of a forward walk that slides. */
  moveFwd?: number;
  moveRight?: number;
  /** Where this NPC is pointing its weapon (world direction). The rig aims the
   *  gun along it, exactly like the player's — so an enemy visibly levels its
   *  rifle at you instead of carrying it in a fixed pose while rounds appear. */
  aimDir?: THREE.Vector3;
  /** OUT: world position of this NPC's barrel tip, written by the rig each frame.
   *  The AI spawns its rounds and its muzzle flash from here, so gunfire leaves
   *  the gun rather than the middle of the chest. */
  muzzleOut?: THREE.Vector3;
}

/** How long a killed NPC lies on the ground before it despawns (ms). Consumers
 *  keep the rig mounted this long so death reads instead of a pop-out. */
export const DEATH_LINGER_MS = 1600;

// Settling the corpse.
//
// The death clip lays the body horizontal but pivots at hip height (the Hips
// position track is stripped), so the rig has to be lowered or the body floats.
// The drop itself was about right — what looked like "sinking into the ground"
// was the TIMING: it eased down on its own 5/s spring, independent of the clip,
// so the body finished falling over and *then* kept gliding downward through the
// floor for another second.
//
// Now the drop is driven by the death clip's own progress, so the body descends
// exactly as it collapses and is fully settled the moment the animation lands.
const DEATH_DROP = -0.8; // metres, at full clip progress
/** Seconds the corpse spends fading out before it unmounts (no more hard pop). */
const DEATH_FADE_SEC = 0.5;

export type NpcModelId = "npc_blocker" | "npc_distractor" | "npc_thief" | "guardian";

/**
 * Which mesh wears each ROLE. The keys are roles, the values are just files —
 * so casting the village is this table, and nothing else.
 *
 * The old casting drew one model from each of two completely different
 * families: a sci-fi trooper for the blocker, a modern tactical operator for
 * the guardian, and a medieval crusader for the villager, all standing on
 * cobblestone in front of Tudor half-timbering. Four fictions in one frame.
 * Meanwhile `phantom` (dark full plate) and `berserker` (a rough labourer) —
 * both already in the repo, both the right period — were sitting unused.
 *
 * The rule the casting follows now is the oldest one there is: **you can see an
 * ally's face, and you cannot see a threat's.** The guardian is open-faced and
 * gold, which is the colour his kit and his bubble already use. The blocker is a
 * faceless helm. The thief is hooded. The villager has nothing to hide behind
 * and nothing to fight with.
 */
const MODEL_PATHS: Record<NpcModelId, string> = {
  // Faceless dark plate — the widest, most menacing silhouette in the set.
  npc_blocker: "/characters/glb/phantom.glb",
  // A rough local. No armour, no weapon, no authority — which is exactly what
  // makes it interesting that he's telling you where the treasure is.
  npc_distractor: "/characters/glb/berserker.glb",
  // Hooded wanderer. This one was already right.
  npc_thief: "/characters/glb/npc_thief.glb",
  // Red-and-gold herald, face visible. It must be unmistakable at a glance,
  // because the whole mechanic rests on knowing which voice to trust.
  guardian: "/characters/glb/npc_distractor.glb",
};

// Our FBX→GLB conversions carry the ~90° Z-up→Y-up root-pitch offset the mixer
// clips don't account for (same as the player rig) — cancel it each frame.
const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const HIPS_PITCH_FIX_INV = HIPS_PITCH_FIX.clone().invert();

const FIRE_HOLD = 0.22;

// Armed NPCs carry the same procedural rifle as the player, socketed to the hand
// bone with the same Valor grip (same Mixamo skeleton). Distractors are unarmed.
// rx = -90° for the same reason as the player's grip (see PlayerRig for how the
// axis and sign were established): the hand bone's local frame puts the gun's
// authored +Z-forward along world -X, so armed NPCs were carrying their rifles
// jutting out sideways too.
// rz is the barrel roll — same measured -105.2° correction as the player's grip,
// or armed NPCs carry their rifles on their side with the sights facing left.
const NPC_GRIP = { rx: -Math.PI / 2, rz: -1.8368, oy: 0.02, oz: 0.04 };
const _npcGunScratch = new THREE.Matrix4();
const _npcGunWorld = new THREE.Matrix4();
// Scratch for the archetype kit sockets.
const _kitLocal = new THREE.Matrix4();
const _kitWorld = new THREE.Matrix4();
const _kitInv = new THREE.Matrix4();
const _kitQ = new THREE.Quaternion();
const _kitBoneQ = new THREE.Quaternion();
const _kitPos = new THREE.Vector3();
const _kitScale = new THREE.Vector3();
const _kitUnit = new THREE.Vector3();
const _kitUp = new THREE.Vector3(0, 1, 0);

/** Which silhouette kit each model wears (see ArchetypeKit.ts). */
const MODEL_ROLE: Record<NpcModelId, Archetype> = {
  npc_blocker: "blocker",
  npc_distractor: "villager",
  npc_thief: "thief",
  guardian: "guardian",
};

export const NpcRig = memo(function NpcRig({
  model,
  state,
}: {
  model: NpcModelId;
  state: NpcRigState;
}) {
  const armed = model === "npc_blocker" || model === "npc_thief";
  const groupRef = useRef<THREE.Group>(null);
  const hipsBoneRef = useRef<THREE.Object3D | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  // Silhouette kit: the shape that tells you what this NPC is before you're
  // close enough to read its texture. Sockets to head / spine / hand bones.
  const kitBones = useRef<{ head: THREE.Object3D | null; spine: THREE.Object3D | null }>({
    head: null,
    spine: null,
  });
  const kitRef = useRef<{ piece: KitPiece; node: THREE.Object3D }[]>([]);
  const gunRef = useRef<THREE.Object3D | null>(null);
  const hipsFixApplied = useRef(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);
  const deathPlayed = useRef(false);
  const deathDrop = useRef(0); // eased downward offset that settles the corpse
  const lastHitAt = useRef(-1);
  const deathAt = useRef(-1); // when the death fade started
  const hitPunch = useRef(0); // 1 on a fresh hit, decays → stagger + flash amount

  const { scene, animations } = useGLTF(MODEL_PATHS[model]);
  const animMachine = useMemo(() => new AnimationStateMachine(buildAnimMap()), []);

  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        // Own the materials (clone) so a per-instance hit-flash doesn't flash every
        // NPC that shares this model.
        child.material = Array.isArray(child.material)
          ? child.material.map((m) => m.clone())
          : child.material.clone();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => {
          dressCharacterMaterial(m);
          mats.push(m as THREE.MeshStandardMaterial);
        });
      }
    });
    materials.current = mats;
    return clone;
  }, [scene]);

  useMemo(() => {
    loadMixamoAnimations();
  }, []);

  useFrame((_, dt) => {
    if (!groupRef.current) return;

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
          if (!kitBones.current.head && /head$/i.test(child.name)) kitBones.current.head = child;
          if (!kitBones.current.spine && /spine2$/i.test(child.name)) kitBones.current.spine = child;
        }
      });
      // Fall back to the base spine if the rig has no Spine2.
      if (!kitBones.current.spine) {
        groupRef.current.traverse((child) => {
          if ((child as THREE.Bone).isBone && !kitBones.current.spine && /spine1?$/i.test(child.name)) {
            kitBones.current.spine = child;
          }
        });
      }
      // Attach the archetype kit. Matrix-driven per frame like the rifle, so it
      // rides the animation instead of floating in the rig's local space.
      if (kitRef.current.length === 0) {
        for (const piece of buildArchetypeKit(MODEL_ROLE[model])) {
          piece.object.matrixAutoUpdate = false;
          piece.object.traverse((n) => {
            const m = n as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
              m.frustumCulled = false;
            }
          });
          groupRef.current.add(piece.object);
          kitRef.current.push({ piece, node: piece.object });
        }
      }
      if (hipsBone) {
        groupRef.current.updateWorldMatrix(true, true);
        animMachine.setRigScale((hipsBone as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y);
      }
      // Socket the rifle to the hand (armed NPCs only), driven by matrix each frame.
      if (armed && !gunRef.current && handBoneRef.current) {
        const gun = makeRifle();
        gun.matrixAutoUpdate = false;
        groupRef.current.add(gun);
        gunRef.current = gun;
      }
    }

    if (initDone.current && !mixamoApplied.current && mixerRef.current && isMixamoLoadComplete()) {
      const mixamoClips = getMixamoClips();
      if (mixamoClips.size > 0) {
        mixamoApplied.current = true;
        const combined = [...animations];
        for (const [name, clip] of mixamoClips) {
          if (!combined.find((c) => c.name === name)) combined.push(clip);
        }
        animMachine.init(mixerRef.current, combined);
      }
    }

    if (!revealed.current && initDone.current) {
      if (initTime.current === 0) initTime.current = performance.now();
      if (mixamoApplied.current || performance.now() - initTime.current > 2500) revealed.current = true;
    }
    groupRef.current.visible = revealed.current;

    // Freeze with the rest of the world while the player is sheltered indoors
    // (the NPC's own AI has already stopped, so its pose must stop too — else it
    // moonwalks in place). The idempotent pitch-fix still runs so it stays upright.
    const frozen = runtime.paused || useGame.getState().roundState !== "playing";
    if (state.dead) {
      // Committed death one-shot (clamps + holds on the final frame).
      if (!deathPlayed.current) {
        deathPlayed.current = true;
        animMachine.transition(AnimState.Death, true);
      }
    } else if (!frozen) {
      const firedRecently = state.fireAt > 0 && (performance.now() - state.fireAt) / 1000 < FIRE_HOLD;
      // FIRING WINS over locomotion. This was the other way round, and since
      // blockers now advance on you they are moving almost the whole engagement —
      // so the Fire clip never once got a look-in and their shots appeared as
      // projectiles popping out of a walking body with no gesture at all. Planting
      // for a third of a second to shoot also reads better than firing on the move.
      if (firedRecently) {
        animMachine.transition(AnimState.Fire);
      } else if (state.moving) {
        // Pick the clip by travel direction first — otherwise a blocker sliding
        // sideways around you plays a forward walk cycle and its feet skate.
        if (state.moveFwd !== undefined && state.moveRight !== undefined) {
          animMachine.setMoveDirection(state.moveFwd, state.moveRight);
        }
        animMachine.transition(state.running ? AnimState.Run : AnimState.Walk);
        animMachine.matchLocomotionSpeed(state.speed);
      } else {
        animMachine.transition(AnimState.Idle);
      }
    }

    // Settle the corpse IN TIME WITH the death clip — the body lowers as it falls
    // and is done the instant the animation is, instead of continuing to glide
    // downward through the floor afterwards.
    deathDrop.current = state.dead ? DEATH_DROP * animMachine.getActiveProgress() : 0;
    groupRef.current.position.y = deathDrop.current;

    // Fade the body out over its last half-second instead of vanishing mid-frame.
    if (state.dead) {
      if (deathAt.current < 0) deathAt.current = performance.now();
      const elapsed = (performance.now() - deathAt.current) / 1000;
      const fadeStart = DEATH_LINGER_MS / 1000 - DEATH_FADE_SEC;
      const fade = THREE.MathUtils.clamp(1 - (elapsed - fadeStart) / DEATH_FADE_SEC, 0, 1);
      for (const m of materials.current) {
        m.transparent = fade < 0.99;
        m.opacity = fade;
        m.depthWrite = fade >= 0.99;
      }
      if (gunRef.current) gunRef.current.visible = fade > 0.05;
    }

    // Hit-react: play the REAL flinch clip.
    //
    // This used to be a procedural cartoon squash — scale to 1.12/0.78/1.12 plus a
    // 23° backward lean plus a full-white emissive flash. On a realistic soldier
    // that reads as a rendering glitch rather than an impact, and because it never
    // touched the animation state the NPC kept walking and shooting straight
    // through it, so shots landed with no consequence you could see. Now a hit
    // interrupts with `hitReaction` (the Blocker also pushes its fire cooldown out,
    // so a stagger genuinely buys you time) and the flash is a restrained impact
    // pop rather than a white-out.
    if (state.dead) {
      hitPunch.current = 0;
    } else if (state.hitAt && state.hitAt !== lastHitAt.current) {
      lastHitAt.current = state.hitAt;
      hitPunch.current = 1;
      if (!frozen) animMachine.transition(AnimState.HitLight, true);
    }
    hitPunch.current = Math.max(0, hitPunch.current - 5 * dt);
    const p = hitPunch.current;
    for (const m of materials.current) {
      m.emissive.setRGB(p * 0.9, p * 0.35, p * 0.25); // hot impact pop, not a white-out
      m.emissiveIntensity = p * 1.6;
    }

    if (hipsBoneRef.current && hipsFixApplied.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX_INV);
    }
    // Death animates even though the NPC's AI has stopped feeding locomotion; only
    // the world-pause (indoors) freezes it.
    if (!frozen) animMachine.update(dt);
    if (hipsBoneRef.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX);
      hipsFixApplied.current = true;
    }

    // Drive the silhouette kit off its bones, after the mixer has posed them.
    for (const { piece, node } of kitRef.current) {
      const bone =
        piece.bone === "head"
          ? kitBones.current.head
          : piece.bone === "spine"
            ? kitBones.current.spine
            : handBoneRef.current;
      if (!bone) continue;
      bone.updateWorldMatrix(true, false);
      // Take the bone's world POSITION and ROTATION, and throw its scale away.
      //
      // These GLBs are Mixamo conversions whose skeletons carry a large baked
      // scale, so multiplying straight through the bone's world matrix shrank
      // every piece of kit by that factor — the guardian's two-metre staff came
      // out a couple of centimetres long, present in the scene graph and
      // invisible on screen. The kit is authored in real metres and should stay
      // that way whatever the rig underneath is doing.
      bone.matrixWorld.decompose(_kitPos, _kitBoneQ, _kitScale);
      if (piece.upright) {
        // Track the hand, but stay vertical and only inherit the NPC's facing.
        _kitBoneQ.setFromAxisAngle(_kitUp, groupRef.current.rotation.y);
      }
      _kitWorld.compose(_kitPos, _kitBoneQ, _kitUnit.setScalar(piece.scale));
      _kitLocal.compose(
        piece.offset,
        _kitQ.setFromEuler(piece.euler),
        _kitUnit.setScalar(1)
      );
      _kitWorld.multiply(_kitLocal);
      _kitInv.copy(groupRef.current.matrixWorld).invert();
      node.matrix.multiplyMatrices(_kitInv, _kitWorld);
      // A dying NPC's kit fades with the body rather than hanging in the air.
      node.visible = !state.dead || deathAt.current < 0 || performance.now() - deathAt.current < DEATH_LINGER_MS - 100;
    }

    // Drive the rifle from the hand bone — HELD, same as the player (see
    // GunMesh.handGunWorldMatrix). NPCs body-face the player whenever they're
    // aware and the rig aims along `state.aimDir`, so a held weapon points close
    // enough down the firing line; their projectiles spawn from the published
    // muzzle either way, so the shot and the barrel still agree.
    if (gunRef.current && handBoneRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false);
      handGunWorldMatrix(_npcGunWorld, handBoneRef.current.matrixWorld, NPC_GRIP);
      if (state.muzzleOut) muzzleWorldPos(state.muzzleOut, gunRef.current, _npcGunWorld);
      _npcGunScratch.copy(groupRef.current.matrixWorld).invert();
      gunRef.current.matrix.multiplyMatrices(_npcGunScratch, _npcGunWorld);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={clonedScene} />
    </group>
  );
});

// Preload exactly what the casting table above actually uses, so nothing is
// fetched for a role it no longer plays (npc_blocker.glb and sentinel.glb are
// now unused by the village — see MODEL_PATHS).
Object.values(MODEL_PATHS).forEach((p) => useGLTF.preload(p));
