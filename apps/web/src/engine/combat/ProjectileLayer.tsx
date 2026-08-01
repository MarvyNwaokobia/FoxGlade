"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_PROJECTILES, projectilePool, stepProjectiles } from "./projectiles";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { BLOCKER } from "@/engine/config/round";

/** Renders the enemy projectile pool as one instanced mesh and steps it. */
export function Projectiles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (!runtime.paused) {
      // (Player indoors / shopping = world paused; shots hang mid-air until back.)
      stepProjectiles(dt, () => {
        if (useGame.getState().isDead) return;
        useGame.getState().damagePlayer(BLOCKER.shotDamage);
        runtime.damageAt = performance.now();
      });
    }

    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectilePool[i];
      if (p.active) {
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_PROJECTILES]} frustumCulled={false}>
      <sphereGeometry args={[0.14, 8, 8]} />
      <meshStandardMaterial color="#ff8a3c" emissive="#ff5a1e" emissiveIntensity={1.4} toneMapped={false} />
    </instancedMesh>
  );
}
