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
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";

const BODY_H = 1.8;
const BODY_R = 0.45;

type Awareness = "idle" | "alert" | "engaged";

/**
 * A blocker NPC: an armed enemy that engages. It starts IDLE and only wakes when
 * it sees you (or hears your gunfire): a brief ALERT beat — a bark + an "!" over
 * its head — then ENGAGED, pursuing toward a fighting range, strafing, and firing
 * on line of sight. Loses interest and returns to idle if you break away. Staggers
 * on hit, plays a death animation, then despawns.
 */
export function Blocker({ position }: { position: [number, number, number] }) {
  const [health, setHealth] = useState<number>(BLOCKER.health);
  const [removed, setRemoved] = useState(false); // unmount after the death lies out
  const dead = health <= 0;
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null); // the "!" alert marker (toggled by state)
  const cooldown = useRef(Math.random() * BLOCKER.fireCooldown); // stagger initial volleys
  const pos = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const strafeDir = useRef(Math.random() < 0.5 ? 1 : -1);
  const strafeTimer = useRef(2 + Math.random() * 2);
  const awareness = useRef<Awareness>("idle");
  const alertClock = useRef(0); // reaction beat during ALERT
  const lostClock = useRef(0); // time out of sight during ENGAGED (→ idle)
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: BLOCKER.moveSpeed });

  useEffect(() => {
    const enemy: Enemy = {
      kind: "blocker",
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 1.0,
      bodyRadius: 0.5,
      takeHit: (damage) => {
        anim.current.hitAt = performance.now(); // stagger + flash punch
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

  // On death, let the body lie for a beat before despawning (no instant pop-out).
  useEffect(() => {
    if (!dead) return;
    anim.current.dead = true;
    const id = setTimeout(() => setRemoved(true), DEATH_LINGER_MS);
    return () => clearTimeout(id);
  }, [dead]);

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

    // Line of sight to the player's chest (drives both sensing and firing). Aim
    // lower when crouched, so low cover genuinely hides you.
    const from = new THREE.Vector3(pos.current.x, 1.0, pos.current.z);
    const chestY = runtime.crouching ? 0.6 : 1.0;
    const to = new THREE.Vector3(runtime.playerPos.x, runtime.playerPos.y + chestY, runtime.playerPos.z);
    const hasLOS = raycastBoxes(from, to, BOXES3D) >= 1;
    // Senses you: in aggro range with sight, OR your recent gunfire within earshot.
    const heardShot = performance.now() - runtime.fireAt < 250 && dist < BLOCKER.hearRange;
    const canSense = (dist < BLOCKER.aggroRange * stealth && hasLOS) || heardShot;

    // Awareness transitions.
    if (awareness.current === "idle") {
      if (canSense) {
        awareness.current = "alert";
        alertClock.current = BLOCKER.alertTime;
        audio.playAt("spot", pos.current.x, pos.current.z, 6, 42); // positional bark
      }
    } else if (awareness.current === "alert") {
      alertClock.current -= dt;
      if (alertClock.current <= 0) awareness.current = "engaged";
    } else {
      // Engaged: give up if the player stays out of sight and well away.
      if (!canSense && dist > BLOCKER.aggroRange) {
        lostClock.current += dt;
        if (lostClock.current > BLOCKER.loseSightTime) awareness.current = "idle";
      } else {
        lostClock.current = 0;
      }
    }
    const aware = awareness.current !== "idle";
    if (marker.current) marker.current.visible = awareness.current === "alert";

    // Move only once ENGAGED (idle/alert hold position — the alert beat is a
    // telegraph, not a lunge).
    let moved = false;
    if (awareness.current === "engaged" && dist > 0.01) {
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
      if (aware) group.current.rotation.y = Math.atan2(dx, dz); // face the player once aware
    }
    anim.current.moving = moved;

    // Fire only when engaged, in range, with line of sight.
    if (
      awareness.current === "engaged" &&
      dist <= BLOCKER.engageRange * stealth &&
      hasLOS &&
      cooldown.current <= 0
    ) {
      cooldown.current = BLOCKER.fireCooldown;
      anim.current.fireAt = performance.now();
      const dir = to.clone().sub(from).normalize();
      spawnProjectile(from.clone().addScaledVector(dir, 0.7), dir, BLOCKER.projectileSpeed);
      // Incoming fire — panned to the shooter's direction + quieter with distance.
      audio.playAt("enemyGun", pos.current.x, pos.current.z, AUDIO.enemyGunNear, AUDIO.enemyGunFar);
    }
  });

  if (removed) return null;

  const frac = health / BLOCKER.health;
  return (
    <group ref={group} position={position}>
      <NpcRig model="npc_blocker" state={anim.current} />

      {/* Health bar (billboarded) — gone once downed, so the corpse reads clean */}
      {!dead && (
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
      )}

      {/* Alert "!" — flashes over the head the instant it spots you (toggled in the
          frame loop while ALERT), so the notice reads visually as well as by bark */}
      {!dead && (
        <Billboard position={[0, BODY_H + 0.75, 0]}>
          <group ref={marker} visible={false}>
            <mesh position={[0, 0.12, 0]}>
              <boxGeometry args={[0.1, 0.34, 0.1]} />
              <meshStandardMaterial color="#ffcf4a" emissive="#ffcf4a" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.15, 0]}>
              <boxGeometry args={[0.1, 0.1, 0.1]} />
              <meshStandardMaterial color="#ffcf4a" emissive="#ffcf4a" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
          </group>
        </Billboard>
      )}

      {/* Contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
