"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";
import { COLLIDERS } from "@/engine/world/village";
import { resolveColliders } from "@/engine/world/collision";

/**
 * The fox companion — a real rigged, animated fox (CC-BY "Fox" by pxltiger, see
 * public/CREDITS.md). It trails beside/ahead of the player so it's always on
 * screen, and plays idle / walk / run from its own clip set based on how fast
 * it's actually moving. The "_InPlace" clips have no root motion, so code moves
 * the body (same pattern as the human rigs) and the feet stay planted.
 */
const FOX_URL = "/models/fox/fox.glb";
const TARGET_HEIGHT = 0.55; // real-world fox height (m) to scale the model to
const WALK_ABOVE = 0.4; // fox planar speed (m/s) above which it walks
const RUN_ABOVE = 4.5; // …above which it runs

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(t, 1);
}

export function FoxCompanion() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null); // holds the scaled model (mixer target)
  const shadow = useRef<THREE.Mesh>(null);
  const foxPos = useRef(new THREE.Vector3(1, 0, 3));
  const facing = useRef(0);
  const speed = useRef(0);

  const { scene, animations } = useGLTF(FOX_URL);
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    // Scale to a fox-sized height and drop its feet to y=0.
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const s = TARGET_HEIGHT / (size.y || 1);
    clone.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y = -box2.min.y;
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m && "roughness" in m) m.roughness = 1; // matte, no shine
      }
    });
    return clone;
  }, [scene]);

  const { actions } = useAnimations(animations, inner);
  const current = useRef<string>("");

  // Crossfade to a clip by name (idempotent if already playing it).
  const play = (name: string) => {
    if (current.current === name || !actions[name]) return;
    const next = actions[name]!;
    const prev = current.current ? actions[current.current] : null;
    next.reset().fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    current.current = name;
  };

  useEffect(() => {
    play("Fox_Idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);

    // Target: BESIDE and slightly AHEAD of the player (camera-relative) so the
    // fox is always on-screen, never lost behind you.
    const yaw = runtime.yaw;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const target = runtime.playerPos
      .clone()
      .addScaledVector(forward, FEEL.foxForwardOffset)
      .addScaledVector(right, FEEL.foxSideOffset * FEEL.foxSide);

    const prev = foxPos.current.clone();
    foxPos.current.lerp(target, Math.min(1, FEEL.foxSpeed * dt));
    resolveColliders(foxPos.current, 0.25, COLLIDERS);

    // Measured planar speed → drives idle/walk/run.
    const delta = foxPos.current.clone().sub(prev);
    delta.y = 0;
    const inst = delta.length() / dt;
    speed.current += (inst - speed.current) * Math.min(1, 10 * dt); // smoothed
    const s = speed.current;

    // Face travel when moving; face the way the player faces when idle (so it
    // stands beside you looking ahead, not sideways). Fox model's nose is +Z.
    const targetFace = s > WALK_ABOVE ? Math.atan2(delta.x, delta.z) : yaw + Math.PI;
    facing.current = lerpAngle(facing.current, targetFace, Math.min(1, 9 * dt));

    play(s > RUN_ABOVE ? "Fox_Run_InPlace" : s > WALK_ABOVE ? "Fox_Walk_InPlace" : "Fox_Idle");

    if (group.current) {
      group.current.position.set(foxPos.current.x, foxPos.current.y, foxPos.current.z);
      group.current.rotation.y = facing.current;
    }
    if (shadow.current) shadow.current.position.set(foxPos.current.x, 0.02, foxPos.current.z);
  });

  return (
    <>
      <group ref={group}>
        <group ref={inner}>
          <primitive object={model} />
        </group>
      </group>
      {/* Contact shadow so the fox reads as grounded */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.35, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </>
  );
}

useGLTF.preload(FOX_URL);
