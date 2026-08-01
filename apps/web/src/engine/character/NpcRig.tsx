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
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { makeRifle } from "./GunMesh";

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
}

/** How long a killed NPC lies on the ground before it despawns (ms). Consumers
 *  keep the rig mounted this long so death reads instead of a pop-out. */
export const DEATH_LINGER_MS = 1600;

// The death clip pivots at hip height (root motion stripped), so drop the whole
// rig this far to lay the body on the ground instead of floating (cf. PlayerRig).
const NPC_DEATH_DROP = -0.85;

export type NpcModelId = "npc_blocker" | "npc_distractor" | "npc_thief";

const MODEL_PATHS: Record<NpcModelId, string> = {
  npc_blocker: "/characters/glb/npc_blocker.glb",
  npc_distractor: "/characters/glb/npc_distractor.glb",
  npc_thief: "/characters/glb/npc_thief.glb",
};

// Our FBX→GLB conversions carry the ~90° Z-up→Y-up root-pitch offset the mixer
// clips don't account for (same as the player rig) — cancel it each frame.
const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const HIPS_PITCH_FIX_INV = HIPS_PITCH_FIX.clone().invert();

const FIRE_HOLD = 0.22;

// Armed NPCs carry the same procedural rifle as the player, socketed to the hand
// bone with the same Valor grip (same Mixamo skeleton). Distractors are unarmed.
const NPC_GRIP = { rx: 0, oy: 0.02, oz: 0.04 };
const _npcGunScratch = new THREE.Matrix4();
const _npcGunWorld = new THREE.Matrix4();
const _npcGunScale = new THREE.Vector3(1, 1, 1);
const _npcGunOff = new THREE.Vector3();
const _npcGunQ = new THREE.Quaternion();
const _npcGunE = new THREE.Euler();

export const NpcRig = memo(function NpcRig({
  model,
  state,
}: {
  model: NpcModelId;
  state: NpcRigState;
}) {
  const armed = model !== "npc_distractor";
  const groupRef = useRef<THREE.Group>(null);
  const hipsBoneRef = useRef<THREE.Object3D | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
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
  const hitPunch = useRef(0); // 1 on a fresh hit, decays → stagger + flash amount

  const { scene, animations } = useGLTF(MODEL_PATHS[model]);
  const animMachine = useMemo(() => new AnimationStateMachine(buildAnimMap()), []);

  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false;
        // Own the materials (clone) so a per-instance hit-flash doesn't flash every
        // NPC that shares this model.
        child.material = Array.isArray(child.material)
          ? child.material.map((m) => m.clone())
          : child.material.clone();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => {
          const sm = m as THREE.MeshStandardMaterial;
          if ("roughness" in sm) sm.roughness = Math.max(sm.roughness ?? 1, 0.9);
          if ("metalness" in sm) sm.metalness = 0;
          mats.push(sm);
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
          if (armed && !handBoneRef.current && /righthand$/i.test(child.name)) handBoneRef.current = child;
        }
      });
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
      if (state.moving) {
        animMachine.transition(state.running ? AnimState.Run : AnimState.Walk);
        animMachine.matchLocomotionSpeed(state.speed);
      } else if (firedRecently) {
        animMachine.transition(AnimState.Fire);
      } else {
        animMachine.transition(AnimState.Idle);
      }
    }

    // Settle the corpse onto the ground (death clip pivots at hip height).
    const dropTarget = state.dead ? NPC_DEATH_DROP : 0;
    deathDrop.current += (dropTarget - deathDrop.current) * Math.min(1, 5 * dt);
    groupRef.current.position.y = deathDrop.current;

    // Hit-react: a fresh non-lethal hit punches hitPunch to 1; it decays fast into
    // a brief stagger (squash + lean back) and a white impact flash. Cleared on
    // death so the corpse reads clean. No clip → never interrupts fire/locomotion.
    if (state.dead) {
      hitPunch.current = 0;
    } else if (state.hitAt && state.hitAt !== lastHitAt.current) {
      lastHitAt.current = state.hitAt;
      hitPunch.current = 1;
    }
    hitPunch.current = Math.max(0, hitPunch.current - 4 * dt); // ~0.25s stagger
    const p = hitPunch.current;
    groupRef.current.scale.set(1 + 0.12 * p, 1 - 0.22 * p, 1 + 0.12 * p);
    groupRef.current.rotation.x = -0.4 * p; // big lean back from the impact (~23°)
    for (const m of materials.current) {
      m.emissive.setRGB(p, p, p); // bright white impact flash (p=0 → no glow)
      m.emissiveIntensity = p * 3;
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

    // Drive the rifle from the hand bone (Valor's socket) — same as the player.
    if (gunRef.current && handBoneRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false);
      _npcGunE.set(NPC_GRIP.rx, 0, 0);
      _npcGunWorld.compose(_npcGunOff.set(0, NPC_GRIP.oy, NPC_GRIP.oz), _npcGunQ.setFromEuler(_npcGunE), _npcGunScale);
      _npcGunScratch.copy(groupRef.current.matrixWorld).invert();
      gunRef.current.matrix.multiplyMatrices(_npcGunScratch, handBoneRef.current.matrixWorld).multiply(_npcGunWorld);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={clonedScene} />
    </group>
  );
});

useGLTF.preload("/characters/glb/npc_blocker.glb");
useGLTF.preload("/characters/glb/npc_distractor.glb");
useGLTF.preload("/characters/glb/npc_thief.glb");
