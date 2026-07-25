"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { spawnProjectile } from "@/engine/combat/projectiles";
import { raycastBoxes, resolveColliders } from "@/engine/world/collision";
import { BOXES3D, COLLIDERS, VILLAGE } from "@/engine/world/village";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { AUDIO } from "@/engine/config/audio";
import { BLOCKER } from "@/engine/config/round";
import { NpcRig, type NpcRigState } from "@/engine/character/NpcRig";

const BODY_H = 1.8;
const BODY_R = 0.45;

/**
 * A blocker NPC: an armed enemy that engages. It pursues the player toward a
 * preferred fighting range, strafes, and fires when it has line of sight. Shows a
 * health bar, flashes on hit, despawns when killed.
 */
export function Blocker({ position }: { position: [number, number, number] }) {
  const [health, setHealth] = useState<number>(BLOCKER.health);
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;
  const group = useRef<THREE.Group>(null);
  const cooldown = useRef(Math.random() * BLOCKER.fireCooldown); // stagger initial volleys
  const pos = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const strafeDir = useRef(Math.random() < 0.5 ? 1 : -1);
  const strafeTimer = useRef(2 + Math.random() * 2);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: BLOCKER.moveSpeed });

  useEffect(() => {
    const enemy: Enemy = {
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 1.0,
      bodyRadius: 0.5,
      takeHit: (damage) => {
        setFlash(true);
        setHealth((h) => {
          const next = Math.max(0, h - damage);
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

  // Engage: pursue toward a fighting range, strafe, and fire when LOS is clear.
  useFrame((_, rawDt) => {
    if (dead || useGame.getState().roundState !== "playing") return;
    if (runtime.sheltered) return; // player indoors: the world is paused
    const dt = Math.min(rawDt, 1 / 30);
    cooldown.current -= dt;
    strafeTimer.current -= dt;
    if (strafeTimer.current <= 0) {
      strafeDir.current *= -1; // flip strafe direction periodically
      strafeTimer.current = 2 + Math.random() * 2;
    }

    const dx = runtime.playerPos.x - pos.current.x;
    const dz = runtime.playerPos.z - pos.current.z;
    const dist = Math.hypot(dx, dz);
    // A crouched player is noticed later (stealth, §14.2).
    const stealth = runtime.crouching ? BLOCKER.crouchDetectionMult : 1;

    // Movement toward the player (pursues even without LOS, to come around cover).
    let moved = false;
    if (dist < BLOCKER.aggroRange * stealth && dist > 0.01) {
      moved = true;
      const nx = dx / dist;
      const nz = dz / dist;
      let mx: number;
      let mz: number;
      if (dist > BLOCKER.rangeMax) {
        mx = nx; // advance
        mz = nz;
      } else if (dist < BLOCKER.rangeMin) {
        mx = -nx; // back off
        mz = -nz;
      } else {
        // Strafe, but with an advance bias so they spiral IN toward the player
        // (reads as active pursuit, not just sliding sideways).
        mx = -nz * strafeDir.current * 0.7 + nx * 0.4;
        mz = nx * strafeDir.current * 0.7 + nz * 0.4;
      }
      pos.current.x += mx * BLOCKER.moveSpeed * dt;
      pos.current.z += mz * BLOCKER.moveSpeed * dt;
      resolveColliders(pos.current, BODY_R, COLLIDERS);
      const lim = VILLAGE.half - BODY_R;
      pos.current.x = Math.max(-lim, Math.min(lim, pos.current.x));
      pos.current.z = Math.max(-lim, Math.min(lim, pos.current.z));
    }

    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = Math.atan2(dx, dz); // face the player
    }
    anim.current.moving = moved;

    // Fire when in range with a clear line of sight.
    if (dist <= BLOCKER.engageRange * stealth && cooldown.current <= 0) {
      const from = new THREE.Vector3(pos.current.x, 1.0, pos.current.z);
      // Aim at the chest — lower when crouched, so low cover genuinely hides you.
      const chestY = runtime.crouching ? 0.6 : 1.0;
      const to = new THREE.Vector3(runtime.playerPos.x, runtime.playerPos.y + chestY, runtime.playerPos.z);
      if (raycastBoxes(from, to, BOXES3D) >= 1) {
        cooldown.current = BLOCKER.fireCooldown;
        anim.current.fireAt = performance.now();
        const dir = to.clone().sub(from).normalize();
        spawnProjectile(from.clone().addScaledVector(dir, 0.7), dir, BLOCKER.projectileSpeed);
        // Incoming fire, quieter the farther off it is.
        audio.play("enemyGun", audio.distanceVolume(dist, AUDIO.enemyGunNear, AUDIO.enemyGunFar));
      }
    }
  });

  if (dead) return null;

  const frac = health / BLOCKER.health;
  return (
    <group ref={group} position={position}>
      <NpcRig model="npc_blocker" state={anim.current} />

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
