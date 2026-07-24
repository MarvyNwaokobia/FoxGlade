"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { THIEF_SPEED } from "@/engine/config/round";

// Waypoints threading the open streets from near spawn to the real treasure —
// a simple timed racer (DESIGN §13.6), not full pathfinding.
const WP: THREE.Vector3[] = [
  new THREE.Vector3(5, 0, 30),
  new THREE.Vector3(5, 0, 16),
  new THREE.Vector3(5, 0, 4),
  new THREE.Vector3(0, 0, -10),
  new THREE.Vector3(0, 0, -22),
  new THREE.Vector3(0, 0, -28),
];
const MAX_HEALTH = 4;
const BODY_H = 1.7;
const BODY_R = 0.4;

/**
 * The thief races the player to the real treasure. Reach it first (or shoot the
 * thief down) — if it arrives, the round is lost. It's fast and fragile.
 */
export function Thief() {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(WP[0].clone());
  const seg = useRef(0);
  const facing = useRef(0);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;

  useEffect(() => {
    runtime.thiefAlive = true;
    runtime.thiefPos.copy(pos.current);
    const enemy: Enemy = {
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 0.9,
      bodyRadius: 0.4,
      takeHit: () => {
        setFlash(true);
        setHealth((h) => {
          const next = Math.max(0, h - 1);
          if (next === 0) {
            enemies.delete(enemy);
            runtime.thiefAlive = false;
          }
          return next;
        });
      },
    };
    enemies.add(enemy);
    return () => {
      enemies.delete(enemy);
      runtime.thiefAlive = false;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 90);
    return () => clearTimeout(id);
  }, [flash]);

  useFrame((_, rawDt) => {
    if (dead || useGame.getState().roundState !== "playing") return;
    const dt = Math.min(rawDt, 1 / 30);

    if (seg.current < WP.length - 1) {
      const target = WP[seg.current + 1];
      const to = target.clone().sub(pos.current);
      to.y = 0;
      const d = to.length();
      const step = THIEF_SPEED * dt;
      if (d <= step) {
        pos.current.copy(target);
        seg.current++;
        if (seg.current >= WP.length - 1) useGame.getState().endRound("thief"); // reached treasure
      } else {
        to.multiplyScalar(1 / d);
        pos.current.addScaledVector(to, step);
        facing.current = Math.atan2(to.x, to.z);
      }
    }

    runtime.thiefPos.copy(pos.current);
    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = facing.current;
    }
  });

  if (dead) return null;

  return (
    <group ref={group}>
      <mesh position={[0, BODY_H / 2, 0]} castShadow>
        <capsuleGeometry args={[BODY_R, BODY_H - BODY_R * 2, 6, 12]} />
        <meshStandardMaterial color={flash ? "#ffffff" : "#3f7f6e"} roughness={0.6} />
      </mesh>
      {/* Loot sack over the shoulder */}
      <mesh position={[-0.3, BODY_H * 0.62, -0.12]}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#8a6a3c" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
