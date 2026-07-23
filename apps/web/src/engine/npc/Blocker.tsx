"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { enemies, type Enemy } from "@/engine/combat/enemies";

const MAX_HEALTH = 3;
const BODY_H = 1.8;
const BODY_R = 0.45;

/**
 * A blocker NPC (M2 slice 1): stands in a chokepoint and must be shot to pass.
 * Registers as an Enemy so the player's hitscan can find it; shows a health bar,
 * flashes on hit, and despawns when killed. It does NOT fight back yet — enemy
 * fire is the next slice.
 */
export function Blocker({ position }: { position: [number, number, number] }) {
  const [health, setHealth] = useState(MAX_HEALTH);
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;

  useEffect(() => {
    const pos = new THREE.Vector3(position[0], position[1], position[2]);
    const enemy: Enemy = {
      getPosition: () => pos,
      hitRadius: 0.85,
      hitHeight: 1.0,
      takeHit: () => {
        setFlash(true);
        setHealth((h) => {
          const next = Math.max(0, h - 1);
          if (next === 0) enemies.delete(enemy);
          return next;
        });
      },
    };
    enemies.add(enemy);
    return () => {
      enemies.delete(enemy);
    };
  }, [position]);

  // Clear the white hit-flash shortly after each hit.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 90);
    return () => clearTimeout(id);
  }, [flash]);

  if (dead) return null;

  const frac = health / MAX_HEALTH;
  return (
    <group position={position}>
      <mesh position={[0, BODY_H / 2, 0]} castShadow>
        <capsuleGeometry args={[BODY_R, BODY_H - BODY_R * 2, 6, 12]} />
        <meshStandardMaterial color={flash ? "#ffffff" : "#b23b3b"} roughness={0.6} />
      </mesh>
      {/* A muzzle nub so it reads as armed (it can't shoot yet) */}
      <mesh position={[0.3, BODY_H * 0.55, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.12, 0.6, 0.12]} />
        <meshStandardMaterial color="#20242a" roughness={0.5} />
      </mesh>

      {/* Health bar (billboarded to face the camera) */}
      <Billboard position={[0, BODY_H + 0.35, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.14]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        <mesh position={[-(1 - frac) / 2, 0, 0.001]}>
          <planeGeometry args={[frac, 0.11]} />
          <meshBasicMaterial color="#ff5a5a" depthWrite={false} />
        </mesh>
      </Billboard>

      {/* Contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
