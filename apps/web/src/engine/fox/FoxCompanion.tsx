"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";

/**
 * A gray-box stand-in for the fox companion: a small body that trails at the
 * player's heel and bobs as it moves. It exists in the first slice on purpose —
 * the fox is Foxglade's identity, and its follow-feel is worth tuning early.
 * The real model swaps come with M6.
 */
export function FoxCompanion() {
  const group = useRef<THREE.Group>(null);
  const foxPos = useRef(new THREE.Vector3(1, 0, 3));
  const facing = useRef(0);
  const t = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    t.current += dt;

    // Target: behind + to the side of the player, relative to camera yaw.
    const yaw = runtime.yaw;
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // opposite of forward
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const target = runtime.playerPos
      .clone()
      .addScaledVector(back, FEEL.foxTrailDistance)
      .addScaledVector(right, FEEL.foxSideOffset);

    const prev = foxPos.current.clone();
    foxPos.current.lerp(target, Math.min(1, FEEL.foxSpeed * dt));

    // Face travel direction when actually moving.
    const delta = foxPos.current.clone().sub(prev);
    delta.y = 0;
    if (delta.lengthSq() > 1e-5) {
      facing.current = Math.atan2(delta.x, delta.z);
    }

    if (group.current) {
      const bob = runtime.running ? Math.sin(t.current * FEEL.foxBobSpeed) * FEEL.foxBobAmplitude : 0;
      group.current.position.set(foxPos.current.x, foxPos.current.y + Math.abs(bob), foxPos.current.z);
      group.current.rotation.y = facing.current;
    }
  });

  return (
    <group ref={group}>
      {/* Body (capsule laid horizontal along Z) */}
      <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.5, 6, 12]} />
        <meshStandardMaterial color="#e8792b" roughness={0.6} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.3, 0.42]}>
        <coneGeometry args={[0.1, 0.28, 10]} />
        <meshStandardMaterial color="#f2f2ec" roughness={0.5} />
      </mesh>
      {/* Ears */}
      <mesh position={[-0.1, 0.52, 0.05]} rotation={[0.2, 0, -0.2]}>
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshStandardMaterial color="#c85f1e" />
      </mesh>
      <mesh position={[0.1, 0.52, 0.05]} rotation={[0.2, 0, 0.2]}>
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshStandardMaterial color="#c85f1e" />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.32, -0.42]} rotation={[Math.PI / 2.4, 0, 0]}>
        <coneGeometry args={[0.13, 0.5, 10]} />
        <meshStandardMaterial color="#f2f2ec" roughness={0.6} />
      </mesh>
    </group>
  );
}
