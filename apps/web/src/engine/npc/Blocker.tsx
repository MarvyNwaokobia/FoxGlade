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
import { foxPinnedBlocker, steerTowards } from "@/engine/fox/foxBrain";

const BODY_H = 1.8;
const BODY_R = 0.45;

/** Scratch goal point fed to the shared steering routine. */
const _goal = new THREE.Vector3();

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
  const telegraph = useRef<THREE.Mesh>(null); // aim beam shown just before a shot
  const muzzle = useRef<THREE.Group>(null); // muzzle flash on the shot itself
  const telegraphUntil = useRef(0); // performance.now the telegraphed shot fires (0 = not aiming)
  const muzzleFlashUntil = useRef(0);
  const self = useRef<Enemy | null>(null); // this blocker's entry in the hit registry
  const awareness = useRef<Awareness>("idle");
  const alertClock = useRef(0); // reaction beat during ALERT
  const lostClock = useRef(0); // time out of sight during ENGAGED (→ idle)
  const anim = useRef<NpcRigState>({
    moving: false,
    running: false,
    fireAt: -1,
    speed: BLOCKER.moveSpeed,
    aimDir: new THREE.Vector3(0, 0, 1),
    muzzleOut: new THREE.Vector3(),
  });

  useEffect(() => {
    const enemy: Enemy = {
      kind: "blocker",
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 1.0,
      bodyRadius: 0.5,
      takeHit: (damage) => {
        anim.current.hitAt = performance.now(); // real flinch clip + impact flash
        // A hit INTERRUPTS: it staggers the shot cycle and cancels any telegraphed
        // shot in progress. That's what makes shooting first actually worth
        // something — previously a blocker fired straight through being hit, so
        // landing rounds bought you nothing until the third one killed it.
        cooldown.current = Math.max(cooldown.current, BLOCKER.hitStagger);
        telegraphUntil.current = 0;
        setHealth((h) => {
          const next = Math.max(0, h - damage);
          if (next === 0) enemies.delete(enemy);
          return next;
        });
      },
    };
    enemies.add(enemy);
    self.current = enemy;
    return () => {
      enemies.delete(enemy);
      self.current = null;
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
    if (runtime.paused) return; // player indoors or shopping: the world is paused
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
    // Level the weapon at the player whenever aware — the rig aims the gun along
    // this, so an enemy that has noticed you is visibly pointing a rifle at you
    // rather than carrying it in a fixed pose while rounds appear from its chest.
    if (aware && anim.current.aimDir) {
      anim.current.aimDir.copy(to).sub(from).normalize();
    }
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
        // Inside the fighting band: mostly CLOSE, with a bit of lateral drift so
        // they don't march in a straight line. The old mix was 0.7 sideways to 0.4
        // forward, which — with a band 4m wide — meant they spent almost the whole
        // fight orbiting you and barely ever advanced. It read as "blockers only
        // walk sideways" because that is essentially what they were doing.
        mx = -nz * strafeDir.current * 0.35 + nx * 0.85;
        mz = nx * strafeDir.current * 0.35 + nz * 0.85;
      }
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;

      // Wall handling: STEER around obstacles instead of grinding into them,
      // using the SAME routine the fox uses (foxBrain.steerTowards). It had its
      // own copy of this, with a scoring bug that made retreating score full
      // marks — so a blocker would walk into a building, back off, walk in again
      // and jitter. One shared implementation, one place to get it right.
      const startX = pos.current.x;
      const startZ = pos.current.z;
      _goal.set(startX + mx * 4, 0, startZ + mz * 4); // a point along the desired heading
      const travelled = steerTowards(pos.current, _goal, BLOCKER.moveSpeed, dt, BODY_R);
      const stepX = pos.current.x - startX;
      const stepZ = pos.current.z - startZ;
      // Tell the rig which way it's actually travelling relative to its facing (it
      // always faces the player), so a sideways step plays the strafe clip instead
      // of a forward walk cycle sliding across the ground.
      const inv = travelled > 1e-5 ? 1 / travelled : 0;
      anim.current.moveFwd = (stepX * nx + stepZ * nz) * inv;
      anim.current.moveRight = (-stepX * nz + stepZ * nx) * inv;
      // Genuinely wedged → stop animating a walk that isn't happening.
      moved = travelled > BLOCKER.moveSpeed * dt * 0.15;
      const lim = VILLAGE.half - BODY_R;
      pos.current.x = Math.max(-lim, Math.min(lim, pos.current.x));
      pos.current.z = Math.max(-lim, Math.min(lim, pos.current.z));
    }

    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      if (aware) group.current.rotation.y = Math.atan2(dx, dz); // face the player once aware
    }
    anim.current.moving = moved;

    // Fire only when engaged, in range, with line of sight — but TELEGRAPH first.
    //
    // A shot used to leave the muzzle with no warning at all, which is why you
    // could lose a hundred health without ever knowing who was shooting: the "!"
    // only appeared during the half-second ALERT beat and never again. Now each
    // shot is preceded by a short aim beat with a visible line drawn from the
    // muzzle to where the round is going. You get a chance to break line of sight,
    // sidestep, or shoot first — and being shot cancels it (see takeHit).
    // A fox lunge PINS it: no firing while it's busy being savaged. This is the
    // window the fox buys you — it doesn't do your killing, it makes space.
    const pinned = self.current ? foxPinnedBlocker(self.current) : false;
    const canShoot =
      awareness.current === "engaged" &&
      dist <= BLOCKER.engageRange * stealth &&
      hasLOS &&
      !pinned;
    const nowMs = performance.now();

    if (canShoot && cooldown.current <= 0 && telegraphUntil.current === 0) {
      telegraphUntil.current = nowMs + BLOCKER.telegraphTime * 1000;
    }
    // Lost the shot (you broke LOS or ran) → drop the telegraph.
    if (!canShoot) telegraphUntil.current = 0;

    if (telegraphUntil.current > 0 && nowMs >= telegraphUntil.current) {
      telegraphUntil.current = 0;
      cooldown.current = BLOCKER.fireCooldown;
      anim.current.fireAt = nowMs;
      // The round leaves the BARREL TIP, along the barrel — the rig publishes the
      // muzzle's world position each frame now that the gun is aimed. It used to
      // spawn at chest height, half a metre in front of the body, which is why
      // shots looked like they were coming out of the NPC rather than its weapon.
      const muzzlePos = anim.current.muzzleOut ?? from;
      const dir = to.clone().sub(muzzlePos).normalize();
      spawnProjectile(muzzlePos.clone().addScaledVector(dir, 0.12), dir, BLOCKER.projectileSpeed);
      muzzleFlashUntil.current = nowMs + 130; // 70ms was invisible at 45fps (~3 frames)
      // Incoming fire — panned to the shooter's direction + quieter with distance.
      audio.playAt("enemyGun", pos.current.x, pos.current.z, AUDIO.enemyGunNear, AUDIO.enemyGunFar);
    }

    // Drive the telegraph line + muzzle flash (local space; the group is at pos).
    const aiming = telegraphUntil.current > 0;
    if (telegraph.current) {
      telegraph.current.visible = aiming;
      if (aiming) {
        // Stretch a thin beam from the muzzle to the player, and swell it as the
        // shot approaches so the timing is readable, not just the direction.
        // The cylinder's length runs along its LOCAL Y; the mesh is then rotated
        // to lie along Z. So the length scale goes on Y — scaling Z just fattened
        // the radius and left a stub floating in the air.
        const t = 1 - (telegraphUntil.current - nowMs) / (BLOCKER.telegraphTime * 1000);
        telegraph.current.scale.set(1, dist, 1);
        telegraph.current.position.set(0, 1.0, dist / 2);
        const mat = telegraph.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.12 + 0.4 * t * t;
      }
    }
    if (muzzle.current) {
      const on = nowMs < muzzleFlashUntil.current;
      muzzle.current.visible = on;
      // Park the flash ON the barrel tip (converted into this group's local
      // space), not at a guessed chest offset, so flash and round agree.
      if (on && anim.current.muzzleOut && group.current) {
        muzzle.current.position.copy(anim.current.muzzleOut);
        group.current.worldToLocal(muzzle.current.position);
      }
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

      {/* Shot telegraph: a thin beam from the muzzle to where the round is going,
          shown during the aim beat before each shot. The group already faces the
          player, so a unit-length beam along +Z scaled by distance lands on them. */}
      {!dead && (
        <mesh ref={telegraph} visible={false} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
          <cylinderGeometry args={[0.018, 0.018, 1, 6]} />
          <meshBasicMaterial color="#ff7a4a" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* Muzzle flash on the shot itself — bigger and longer-lived than the first
          pass, which at 45fps lasted about three frames and was easy to miss
          entirely. Without it a shot reads as a ball spawning out of thin air. */}
      {!dead && (
        <group ref={muzzle} visible={false} position={[0, 1.0, 0.8]}>
          <mesh>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshBasicMaterial color="#ffe6b0" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
          </mesh>
          {/* A short flare down the barrel line so the flash has direction */}
          <mesh position={[0, 0, 0.22]}>
            <coneGeometry args={[0.13, 0.5, 8]} />
            <meshBasicMaterial color="#ffc072" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* Contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
