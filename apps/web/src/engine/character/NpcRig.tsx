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
}

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

export const NpcRig = memo(function NpcRig({
  model,
  state,
}: {
  model: NpcModelId;
  state: NpcRigState;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hipsBoneRef = useRef<THREE.Object3D | null>(null);
  const hipsFixApplied = useRef(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);

  const { scene, animations } = useGLTF(MODEL_PATHS[model]);
  const animMachine = useMemo(() => new AnimationStateMachine(buildAnimMap()), []);

  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });
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
        if ((child as THREE.Bone).isBone && !hipsBone && /hips/i.test(child.name)) {
          hipsBone = child;
          hipsBoneRef.current = child;
        }
      });
      if (hipsBone) {
        groupRef.current.updateWorldMatrix(true, true);
        animMachine.setRigScale((hipsBone as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y);
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
    const frozen = runtime.sheltered || useGame.getState().roundState !== "playing";
    if (!frozen) {
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

    if (hipsBoneRef.current && hipsFixApplied.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX_INV);
    }
    if (!frozen) animMachine.update(dt);
    if (hipsBoneRef.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX);
      hipsFixApplied.current = true;
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
