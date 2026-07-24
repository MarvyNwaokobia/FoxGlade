"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bombPool, MAX_BOMBS, explosions, MAX_EXPLOSIONS, stepBombs, clearBombs } from "./bombs";
import { BOMB } from "@/engine/config/round";
import { VILLAGE } from "@/engine/world/village";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";

const BLAST_FLASH_S = 0.4; // fireball grow+fade time
const BLAST_RING_S = 0.6; // ground ring grow+fade time

/**
 * Renders live bombs, the hold-to-aim landing telegraph, and blast VFX, and
 * steps the bomb sim. The store-touching blast effects (player self-damage,
 * treasure crack) live here, keeping bombs.ts store-free.
 */
export function Bombs() {
  const bombRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flashRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const telegraph = useRef<THREE.Group>(null);

  // Round restart → clear any in-flight bombs and blast VFX.
  const roundNonce = useGame((s) => s.roundNonce);
  useEffect(() => clearBombs(), [roundNonce]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (useGame.getState().roundState === "playing") {
      stepBombs(dt, (center) => {
        // Caught in your own blast (chest height, same sphere as enemies).
        const dx = center.x - runtime.playerPos.x;
        const dy = center.y - (runtime.playerPos.y + 1.0);
        const dz = center.z - runtime.playerPos.z;
        if (dx * dx + dy * dy + dz * dz < BOMB.radius * BOMB.radius) {
          useGame.getState().damagePlayer(BOMB.selfDamage);
          runtime.damageAt = performance.now();
        }
        // Blast reaching the treasure cracks it: reduced rarity, not a lost run (§13.5).
        if (Math.hypot(center.x - VILLAGE.treasure.x, center.z - VILLAGE.treasure.z) < BOMB.radius) {
          useGame.getState().crackTreasure();
        }
      });
    }

    // Live bombs.
    for (let i = 0; i < MAX_BOMBS; i++) {
      const m = bombRefs.current[i];
      if (!m) continue;
      const b = bombPool[i];
      m.visible = b.active;
      if (b.active) m.position.set(b.x, b.y, b.z);
    }

    // Blast VFX: an expanding fireball + a ground ring sweeping to the blast radius.
    const now = performance.now();
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const flash = flashRefs.current[i];
      const ring = ringRefs.current[i];
      if (!flash || !ring) continue;
      const ex = explosions[i];
      const flashT = ex ? (now - ex.at) / (BLAST_FLASH_S * 1000) : 1;
      const ringT = ex ? (now - ex.at) / (BLAST_RING_S * 1000) : 1;
      flash.visible = !!ex && flashT < 1;
      ring.visible = !!ex && ringT < 1;
      if (ex && flashT < 1) {
        flash.position.set(ex.x, ex.y, ex.z);
        flash.scale.setScalar(0.5 + flashT * BOMB.radius * 0.55);
        (flash.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - flashT);
      }
      if (ex && ringT < 1) {
        ring.position.set(ex.x, 0.04, ex.z);
        ring.scale.setScalar(0.2 + ringT * 1.0);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - ringT);
      }
    }

    // Hold-to-aim telegraph at the predicted landing point.
    if (telegraph.current) {
      telegraph.current.visible = runtime.bombAiming;
      if (runtime.bombAiming) {
        telegraph.current.position.set(runtime.bombAimPoint.x, 0.03, runtime.bombAimPoint.z);
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_BOMBS }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            bombRefs.current[i] = el;
          }}
          visible={false}
          castShadow
        >
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color="#2a2e34" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}

      {Array.from({ length: MAX_EXPLOSIONS }).map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              flashRefs.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#ffb054" transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh
            ref={(el) => {
              ringRefs.current[i] = el;
            }}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[BOMB.radius - 0.35, BOMB.radius, 48]} />
            <meshBasicMaterial color="#ff7a3c" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* Telegraph: the exact blast footprint, shown while G is held. */}
      <group ref={telegraph} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[BOMB.radius - 0.2, BOMB.radius, 48]} />
          <meshBasicMaterial color="#ff8a3c" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[BOMB.radius, 48]} />
          <meshBasicMaterial color="#ff8a3c" transparent opacity={0.1} depthWrite={false} />
        </mesh>
        {/* Landing dot so the throw's centre reads even when the ring clips walls. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.3, 16]} />
          <meshBasicMaterial color="#ff8a3c" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
