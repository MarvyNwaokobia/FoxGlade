"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_PROJECTILES, projectilePool, stepProjectiles } from "./projectiles";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { FOX } from "@/engine/config/fox";
import { audio } from "@/engine/audio/audio";

/** How long a tracer streak is drawn (metres). Long enough to read as a round in
 *  flight, short enough that you can still judge where it actually is. */
const TRACER_LENGTH = 0.9;
/** The cylinder is authored along +Y; rotate that onto the velocity direction. */
const FORWARD = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** Renders the enemy projectile pool as one instanced mesh and steps it. */
export function Projectiles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (!runtime.paused) {
      // (Player indoors / shopping = world paused; shots hang mid-air until back.)
      stepProjectiles(dt, (p) => {
        if (useGame.getState().isDead) return;
        // Where it came FROM: back along the projectile's own velocity. Drives the
        // directional flinch and the on-screen damage indicator.
        runtime.damageFrom.set(-p.vx, 0, -p.vz);
        if (runtime.damageFrom.lengthSq() > 1e-6) runtime.damageFrom.normalize();
        // The round carries its shooter's damage — a holder's shot lands harder
        // than a rusher's, which is the whole point of the role split.
        runtime.damageAmount = p.damage;
        runtime.hitRollSign = Math.random() < 0.5 ? -1 : 1;
        useGame.getState().damagePlayer(p.damage);
        runtime.damageAt = performance.now();
      },
      // Fox took the round: it goes down (never dies) and you're without it.
      () => {
        if (runtime.foxState === "down") return;
        runtime.foxDownUntil = performance.now() + FOX.downTime * 1000;
        runtime.foxState = "down";
        audio.play("foxWhine");
      });
    }

    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectilePool[i];
      if (p.active) {
        // Orient each round ALONG its flight and stretch it into a streak. These
        // used to be fat glowing spheres, which read as "balls floating out of
        // the enemy" rather than gunfire. A thin tracer aligned to its own
        // velocity reads as a bullet, and — because it's stretched along travel —
        // it also stays legible between frames at speed.
        dummy.position.set(p.x, p.y, p.z);
        _dir.set(p.vx, p.vy, p.vz);
        const speed = _dir.length() || 1;
        _dir.multiplyScalar(1 / speed);
        dummy.quaternion.setFromUnitVectors(FORWARD, _dir);
        dummy.scale.set(1, 1, TRACER_LENGTH);
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
      {/* A slim cylinder along +Z (scaled to TRACER_LENGTH above), not a ball. */}
      <cylinderGeometry args={[0.028, 0.014, 1, 6, 1, true]} />
      <meshBasicMaterial color="#fff0c2" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
