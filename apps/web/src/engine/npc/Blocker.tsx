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

const MAX_HEALTH = 3;
const BODY_H = 1.8;
const BODY_R = 0.45;
const ENGAGE_RANGE = 24; // starts shooting within this distance
const FIRE_COOLDOWN = 1.6; // seconds between shots
const PROJECTILE_SPEED = 20; // m/s — slow enough to dodge / break LOS
const MOVE_SPEED = 2.6; // m/s when advancing/strafing
const AGGRO_RANGE = 32; // starts pursuing within this distance
const RANGE_MAX = 15; // farther than this → advance
const RANGE_MIN = 7; // closer than this → back off (otherwise strafe)

/**
 * A blocker NPC: an armed enemy that engages. It pursues the player toward a
 * preferred fighting range, strafes, and fires when it has line of sight. Shows a
 * health bar, flashes on hit, despawns when killed.
 */
export function Blocker({ position }: { position: [number, number, number] }) {
  const [health, setHealth] = useState(MAX_HEALTH);
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;
  const group = useRef<THREE.Group>(null);
  const cooldown = useRef(Math.random() * FIRE_COOLDOWN); // stagger initial volleys
  const pos = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const strafeDir = useRef(Math.random() < 0.5 ? 1 : -1);
  const strafeTimer = useRef(2 + Math.random() * 2);

  useEffect(() => {
    const enemy: Enemy = {
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 1.0,
      bodyRadius: 0.5,
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

  // Engage: pursue toward a fighting range, strafe, and fire when LOS is clear.
  useFrame((_, rawDt) => {
    if (dead || useGame.getState().roundState !== "playing") return;
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

    // Movement toward the player (pursues even without LOS, to come around cover).
    if (dist < AGGRO_RANGE && dist > 0.01) {
      const nx = dx / dist;
      const nz = dz / dist;
      let mx: number;
      let mz: number;
      if (dist > RANGE_MAX) {
        mx = nx; // advance
        mz = nz;
      } else if (dist < RANGE_MIN) {
        mx = -nx; // back off
        mz = -nz;
      } else {
        mx = -nz * strafeDir.current; // strafe (perpendicular)
        mz = nx * strafeDir.current;
      }
      pos.current.x += mx * MOVE_SPEED * dt;
      pos.current.z += mz * MOVE_SPEED * dt;
      resolveColliders(pos.current, BODY_R, COLLIDERS);
      const lim = VILLAGE.half - BODY_R;
      pos.current.x = Math.max(-lim, Math.min(lim, pos.current.x));
      pos.current.z = Math.max(-lim, Math.min(lim, pos.current.z));
    }

    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = Math.atan2(dx, dz); // face the player
    }

    // Fire when in range with a clear line of sight.
    if (dist <= ENGAGE_RANGE && cooldown.current <= 0) {
      const from = new THREE.Vector3(pos.current.x, 1.0, pos.current.z);
      const to = new THREE.Vector3(runtime.playerPos.x, runtime.playerPos.y + 1.0, runtime.playerPos.z);
      if (raycastBoxes(from, to, BOXES3D) >= 1) {
        cooldown.current = FIRE_COOLDOWN;
        const dir = to.clone().sub(from).normalize();
        spawnProjectile(from.clone().addScaledVector(dir, 0.7), dir, PROJECTILE_SPEED);
      }
    }
  });

  if (dead) return null;

  const frac = health / MAX_HEALTH;
  return (
    <group ref={group} position={position}>
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
