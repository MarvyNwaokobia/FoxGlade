"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { blockerStats, type BlockerRole } from "@/engine/config/round";
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";
import { foxPinnedBlocker, steerTowards } from "@/engine/fox/foxBrain";
import { findPath } from "@/engine/world/navgrid";

const BODY_H = 1.8;
const BODY_R = 0.45;

/** Scratch goal point fed to the shared steering routine. */
const _goal = new THREE.Vector3();
/** Scratch for the telegraph beam (muzzle → target, in the NPC's local space). */
const _beamFrom = new THREE.Vector3();
const _beamTo = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
/** The cylinder's own long axis. */
const _beamAxis = new THREE.Vector3(0, 1, 0);

type Awareness = "idle" | "alert" | "engaged";

/**
 * A blocker NPC: an armed enemy that engages. It starts IDLE and only wakes when
 * it sees you (or hears your gunfire): a brief ALERT beat — a bark + an "!" over
 * its head — then ENGAGED, pursuing toward a fighting range, strafing, and firing
 * on line of sight. Loses interest and returns to idle if you break away. Staggers
 * on hit, plays a death animation, then despawns.
 *
 * Its numbers come from its ROLE (see BLOCKER_ROLES): a `rusher` closes to knife
 * range on a short fuse, a `holder` posts up at distance and plants its feet to
 * shoot. Same code below — the two fights differ entirely in the stat block.
 */
export function Blocker({
  position,
  role = "rusher",
}: {
  position: [number, number, number];
  role?: BlockerRole;
}) {
  const S = useMemo(() => blockerStats(role), [role]);
  const [health, setHealth] = useState<number>(S.health);
  const [removed, setRemoved] = useState(false); // unmount after the death lies out
  const dead = health <= 0;
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null); // the "!" alert marker (toggled by state)
  const cooldown = useRef(Math.random() * S.fireCooldown); // stagger initial volleys
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
  const breachClock = useRef(0); // time spent locked out by a door (→ routes inside)
  const breachPath = useRef<THREE.Vector3[]>([]);
  const breachRepath = useRef(0);
  const anim = useRef<NpcRigState>({
    moving: false,
    running: false,
    fireAt: -1,
    speed: S.moveSpeed,
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
        cooldown.current = Math.max(cooldown.current, S.hitStagger);
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
    const stealth = runtime.crouching ? S.crouchDetectionMult : 1;

    // Line of sight to the player's chest (drives both sensing and firing). Aim
    // lower when crouched, so low cover genuinely hides you.
    const from = new THREE.Vector3(pos.current.x, 1.0, pos.current.z);
    const chestY = runtime.crouching ? 0.6 : 1.0;
    const to = new THREE.Vector3(runtime.playerPos.x, runtime.playerPos.y + chestY, runtime.playerPos.z);
    const hasLOS = raycastBoxes(from, to, BOXES3D) >= 1;
    // Senses you: in aggro range with sight, OR your recent gunfire within earshot.
    const heardShot = performance.now() - runtime.fireAt < 250 && dist < S.hearRange;
    const canSense = (dist < S.aggroRange * stealth && hasLOS) || heardShot;

    // Awareness transitions.
    if (awareness.current === "idle") {
      if (canSense) {
        awareness.current = "alert";
        alertClock.current = S.alertTime;
        audio.playAt("spot", pos.current.x, pos.current.z, 6, 42); // positional bark
      }
    } else if (awareness.current === "alert") {
      alertClock.current -= dt;
      if (alertClock.current <= 0) awareness.current = "engaged";
    } else {
      // Engaged: give up if the player stays out of sight and well away.
      if (!canSense && dist > S.aggroRange) {
        lostClock.current += dt;
        if (lostClock.current > S.loseSightTime) awareness.current = "idle";
      } else {
        lostClock.current = 0;
      }
    }

    // Breaching. If we're engaged, we've lost sight, and the player is standing
    // inside a building within reach, the answer is not to stand in the street
    // waiting for them to come out — it's to walk in after them. Without this the
    // doorway is still a sanctuary; the only thing the safe-room rewrite would
    // have changed is that the sun keeps moving while you use it.
    //
    // The delay is deliberate and generous (S.breachDelay): ducking inside
    // has to genuinely buy you a reload and a decision, or cover is worthless.
    const breaching =
      awareness.current === "engaged" &&
      runtime.sheltered &&
      !hasLOS &&
      dist < S.breachRange;
    if (breaching) {
      breachClock.current += dt;
      lostClock.current = 0; // committed: it isn't going to lose interest mid-entry
    } else {
      breachClock.current = 0;
      breachPath.current.length = 0;
    }
    const entering = breaching && breachClock.current >= S.breachDelay;
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
    // A HOLDER plants its feet while it lines up a shot. That's the role's whole
    // bargain: it hits hard from a distance you can't easily answer, and in
    // exchange the long wind-up happens on a stationary target. A rusher never
    // stops, so it's the opposite deal — hard to hit, but it has to get close.
    const planted = S.holdsGround && telegraphUntil.current > 0;
    // While it's locked out but not yet committed, it HOLDS — a stakeout outside
    // the door, not a jog around the building. That stillness is the tell: you
    // can see through a window that it hasn't left, and you know what the wait
    // ends in.
    if (awareness.current === "engaged" && dist > 0.01 && !planted && (!breaching || entering)) {
      moved = true;
      const nx = dx / dist;
      const nz = dz / dist;
      let mx: number;
      let mz: number;
      if (dist > S.rangeMax) {
        mx = nx; // advance
        mz = nz;
      } else if (dist < S.rangeMin) {
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
      if (entering) {
        // Going in. Local steering cannot solve a doorway — a building is a
        // concave obstacle and a greedy agent slides along the outside wall
        // forever (the exact failure documented in world/navgrid.ts). So the
        // breach routes on the same A* grid the fox and the thieves use, whose
        // clearance leaves the door opening walkable.
        breachRepath.current -= dt;
        if (breachPath.current.length === 0 || breachRepath.current <= 0) {
          breachRepath.current = S.breachRepath;
          breachPath.current = findPath(pos.current, runtime.playerPos) ?? [];
        }
        while (breachPath.current.length && breachPath.current[0].distanceTo(pos.current) < 0.9) {
          breachPath.current.shift();
        }
        _goal.copy(breachPath.current[0] ?? runtime.playerPos).setY(0);
      } else {
        _goal.set(startX + mx * 4, 0, startZ + mz * 4); // a point along the desired heading
      }
      const travelled = steerTowards(pos.current, _goal, S.moveSpeed, dt, BODY_R);
      const stepX = pos.current.x - startX;
      const stepZ = pos.current.z - startZ;
      // Tell the rig which way it's actually travelling relative to its facing (it
      // always faces the player), so a sideways step plays the strafe clip instead
      // of a forward walk cycle sliding across the ground.
      const inv = travelled > 1e-5 ? 1 / travelled : 0;
      anim.current.moveFwd = (stepX * nx + stepZ * nz) * inv;
      anim.current.moveRight = (-stepX * nz + stepZ * nx) * inv;
      // Genuinely wedged → stop animating a walk that isn't happening.
      moved = travelled > S.moveSpeed * dt * 0.15;
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
      dist <= S.engageRange * stealth &&
      hasLOS &&
      !pinned;
    const nowMs = performance.now();

    if (canShoot && cooldown.current <= 0 && telegraphUntil.current === 0) {
      telegraphUntil.current = nowMs + S.telegraphTime * 1000;
    }
    // Lost the shot (you broke LOS or ran) → drop the telegraph.
    if (!canShoot) telegraphUntil.current = 0;

    if (telegraphUntil.current > 0 && nowMs >= telegraphUntil.current) {
      telegraphUntil.current = 0;
      cooldown.current = S.fireCooldown;
      anim.current.fireAt = nowMs;
      // The round leaves the BARREL TIP, along the barrel — the rig publishes the
      // muzzle's world position each frame now that the gun is aimed. It used to
      // spawn at chest height, half a metre in front of the body, which is why
      // shots looked like they were coming out of the NPC rather than its weapon.
      const muzzlePos = anim.current.muzzleOut ?? from;
      const dir = to.clone().sub(muzzlePos).normalize();
      spawnProjectile(muzzlePos.clone().addScaledVector(dir, 0.12), dir, S.projectileSpeed, S.shotDamage);
      muzzleFlashUntil.current = nowMs + 130; // 70ms was invisible at 45fps (~3 frames)
      // Incoming fire — panned to the shooter's direction + quieter with distance.
      audio.playAt("enemyGun", pos.current.x, pos.current.z, AUDIO.enemyGunNear, AUDIO.enemyGunFar);
    }

    // Drive the telegraph line + muzzle flash (local space; the group is at pos).
    const aiming = telegraphUntil.current > 0;
    if (telegraph.current) {
      telegraph.current.visible = aiming;
      if (aiming) {
        // Stretch a thin beam from the BARREL TIP to the player, and swell it as
        // the shot approaches so the timing is readable, not just the direction.
        //
        // It used to start at a fixed (0, 1.0) on the body — the chest — while
        // the round itself leaves the published muzzle. Now that the weapon is
        // held in the hand rather than aimed by code, that gap is visible: you
        // were reading a warning line that didn't come from the gun and didn't
        // quite go where the bullet went. Warning, muzzle flash, round and
        // barrel all agree now.
        //
        // The cylinder's length runs along its LOCAL Y; the mesh is then rotated
        // to lie along Z. So the length scale goes on Y — scaling Z just fattened
        // the radius and left a stub floating in the air.
        const t = 1 - (telegraphUntil.current - nowMs) / (S.telegraphTime * 1000);
        const origin = anim.current.muzzleOut
          ? group.current!.worldToLocal(_beamFrom.copy(anim.current.muzzleOut))
          : _beamFrom.set(0, 1.0, 0);
        // Local target: the player, in this group's space (the group faces them,
        // so this is essentially straight ahead plus any elevation).
        _beamTo.copy(to);
        group.current!.worldToLocal(_beamTo);
        const len = _beamFrom.distanceTo(_beamTo);
        telegraph.current.scale.set(1, len, 1);
        telegraph.current.position.copy(origin).lerp(_beamTo, 0.5);
        // Point the beam down the firing line instead of assuming it's +Z.
        _beamDir.copy(_beamTo).sub(origin).normalize();
        telegraph.current.quaternion.setFromUnitVectors(_beamAxis, _beamDir);
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

  const frac = health / S.health;
  const holder = role === "holder";
  return (
    <group ref={group} position={position}>
      <NpcRig model="npc_blocker" state={anim.current} />

      {/* Health bar (billboarded) — gone once downed, so the corpse reads clean.
          Its WIDTH is the role's health, so a holder's bar is visibly the longer
          one. "Which of these do I shoot first" is only a decision if you can
          tell them apart before they open fire, and a bar you're already reading
          costs no new UI. */}
      {!dead && (
        <Billboard position={[0, BODY_H + 0.35, 0]}>
          <mesh>
            <planeGeometry args={[S.health / 3, 0.14]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5} depthWrite={false} />
          </mesh>
          <mesh position={[-((S.health / 3) * (1 - frac)) / 2, 0, 0.001]}>
            <planeGeometry args={[(S.health / 3) * frac, 0.11]} />
            <meshBasicMaterial color={holder ? "#ff8a3d" : "#ff5a5a"} depthWrite={false} />
          </mesh>
        </Billboard>
      )}

      {/* A holder wears a pauldron: heavier silhouette for the heavier enemy, and
          the read works at the distance it actually fights from, which a colour
          on a 14px bar does not. */}
      {!dead && holder && (
        <mesh position={[0, BODY_H * 0.78, 0]} castShadow>
          <boxGeometry args={[0.72, 0.16, 0.44]} />
          <meshStandardMaterial color="#3d4450" roughness={0.65} metalness={0.35} />
        </mesh>
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
        <mesh ref={telegraph} visible={false} renderOrder={3}>
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
