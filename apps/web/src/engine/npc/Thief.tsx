"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { useGame } from "@/engine/store";
import { thieves, type ThiefRef } from "./thieves";
import { THIEF } from "@/engine/config/round";
import { HINTS } from "@/engine/world/hints";
import { runtime } from "@/engine/runtime";
import { audio } from "@/engine/audio/audio";
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";
import { foxThiefSpeedMult, steerTowards } from "@/engine/fox/foxBrain";
import { findPath } from "@/engine/world/navgrid";

const BODY_H = 1.7;
const BODY_R = 0.4;

/**
 * A thief racing you for the treasure — and now actually hunting it.
 *
 * It used to run a HARDCODED waypoint list at a constant speed, never looking at
 * you, never reacting to being shot, and vanishing on arrival. Two things were
 * wrong with that:
 *
 *  - Phase 5 made the treasure board RESEED each chapter, and those waypoints
 *    ended at the old fixed hint coordinates. So since that change the thieves
 *    have been sprinting, with total confidence, to patches of empty cobblestone.
 *    The race had quietly stopped existing.
 *  - Even when it worked it was a train on rails. Shooting at one did nothing but
 *    subtract health; it wouldn't flinch, hurry, or deviate.
 *
 * Now it finds the real treasure itself, PATHS to it across the village (same A*
 * the fox uses), breaks into a sprint when shot at, physically takes the treasure
 * with a grab beat, and then runs for the wall with it. Kill it before it reaches
 * the wall and the treasure drops back onto the board.
 */
type Phase = "running" | "taking" | "fleeing";

const GRAB_TIME = 1.1; // seconds spent taking the treasure — your window to stop it
const PANIC_TIME = 4.5; // seconds it sprints after being shot at
const REPATH = 0.8; // seconds between route recalculations
const _goal = new THREE.Vector3();

export function Thief({
  entry,
  speed = THIEF.speed,
  startDelay = 0,
}: {
  /** Where it slips into the village from (a point on the wall). */
  entry: [number, number];
  speed?: number;
  startDelay?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(entry[0], 0, entry[1]));
  const facing = useRef(0);
  const delay = useRef(startDelay);
  const [started, setStarted] = useState(startDelay <= 0);
  const [escaped, setEscaped] = useState(false);
  const [health, setHealth] = useState<number>(THIEF.health);
  // Synchronous mirror of `health` — see Blocker.tsx for why takeHit needs it.
  const healthRef = useRef<number>(THIEF.health);
  const [removed, setRemoved] = useState(false);
  const live = useRef<{ enemy: Enemy; ref: ThiefRef } | null>(null);
  const anim = useRef<NpcRigState>({ moving: false, running: true, fireAt: -1, speed });
  const dead = health <= 0;

  const phase = useRef<Phase>("running");
  const targetHint = useRef(-1);
  const grabClock = useRef(0);
  const panicUntil = useRef(0);
  const path = useRef<THREE.Vector3[]>([]);
  const repathClock = useRef(0);
  const carrying = useRef(false);
  // A render-visible mirror of `carrying`. The ref is what the 60fps loop reads,
  // but the loot sack and the carrier glow are JSX — and a ref mutation triggers
  // no re-render, so the sack only ever changed appearance if some OTHER state
  // happened to update in the same beat. The thief could take the treasure and
  // still be rendered empty-handed all the way to the wall.
  const [hasLoot, setHasLoot] = useState(false);
  const exit = useRef(new THREE.Vector3(entry[0], 0, entry[1]));
  const prevPos = useRef(new THREE.Vector3(entry[0], 0, entry[1]));

  useEffect(() => {
    if (!started) return;
    const ref: ThiefRef = { getPos: () => pos.current };
    thieves.add(ref);
    const enemy: Enemy = {
      kind: "thief",
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 0.9,
      bodyRadius: 0.4,
      takeHit: (damage) => {
        anim.current.hitAt = performance.now();
        // Being shot at makes it RUN. A racer that doesn't panic when rounds
        // start landing near it reads as scenery, not a rival.
        panicUntil.current = performance.now() + PANIC_TIME * 1000;
        const before = healthRef.current;
        const next = Math.max(0, before - damage);
        healthRef.current = next;
        setHealth(next);
        if (next === 0) {
          enemies.delete(enemy);
          thieves.delete(ref);
        }
        return before > 0 && next === 0;
      },
    };
    enemies.add(enemy);
    live.current = { enemy, ref };
    return () => {
      enemies.delete(enemy);
      thieves.delete(ref);
      live.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Shot down. If it was carrying, the treasure goes back on the board — killing
  // a courier has to actually recover the prize or there's no point chasing one.
  useEffect(() => {
    if (!dead) return;
    anim.current.dead = true;
    if (carrying.current && targetHint.current >= 0) {
      runtime.hintStolen[targetHint.current] = false;
      carrying.current = false;
      setHasLoot(false);
    }
    const id = setTimeout(() => setRemoved(true), DEATH_LINGER_MS);
    return () => clearTimeout(id);
  }, [dead]);

  useFrame((_, rawDt) => {
    if (dead || escaped || useGame.getState().roundState !== "playing") return;
    if (runtime.paused) return;
    const dt = Math.min(rawDt, 1 / 30);
    const now = performance.now();

    if (!started) {
      delay.current -= dt;
      if (delay.current <= 0) setStarted(true);
      return;
    }

    // Find the real treasure for itself, every time — the board moves.
    if (phase.current === "running") {
      if (
        targetHint.current < 0 ||
        !HINTS[targetHint.current]?.real ||
        runtime.hintStolen[targetHint.current] ||
        runtime.hintClaimed[targetHint.current]
      ) {
        const idx = HINTS.findIndex(
          (h, i) => h.real && !runtime.hintStolen[i] && !runtime.hintClaimed[i]
        );
        if (idx < 0) {
          // Nothing left worth stealing — cut and run.
          phase.current = "fleeing";
        } else if (idx !== targetHint.current) {
          targetHint.current = idx;
          path.current.length = 0;
        }
      }
    }

    prevPos.current.copy(pos.current);
    const panicking = now < panicUntil.current;
    const foxSlow = live.current ? foxThiefSpeedMult(live.current.enemy) : 1;
    const spd = speed * (panicking ? THIEF.panicMult : 1) * foxSlow;
    let moving = false;

    if (phase.current === "taking") {
      grabClock.current -= dt;
      if (grabClock.current <= 0) {
        const i = targetHint.current;
        if (i >= 0 && !runtime.hintStolen[i] && !runtime.hintClaimed[i]) {
          runtime.hintStolen[i] = true;
          runtime.treasureStolenAt = now;
          carrying.current = true;
          setHasLoot(true);
          // It has the prize and it's running for the wall. Loud, and audible
          // most of the way across the village — this is the chase starting.
          audio.playAt("thiefFlee", pos.current.x, pos.current.z, 14, 75);
        }
        phase.current = "fleeing";
        path.current.length = 0;
      }
    } else {
      // Route to the treasure, or to the wall if it's carrying / has nothing left.
      const goal =
        phase.current === "fleeing"
          ? _goal.copy(exit.current)
          : _goal.copy(HINTS[targetHint.current]?.pos ?? exit.current);

      repathClock.current -= dt;
      if (path.current.length === 0 || repathClock.current <= 0) {
        repathClock.current = REPATH;
        path.current = findPath(pos.current, goal) ?? [];
      }
      while (path.current.length && path.current[0].distanceTo(pos.current) < 1.0) {
        path.current.shift();
      }
      const next = path.current[0] ?? goal;
      moving = steerTowards(pos.current, next, spd, dt, BODY_R) > 1e-5;

      const dGoal = Math.hypot(goal.x - pos.current.x, goal.z - pos.current.z);
      if (phase.current === "running" && dGoal < 1.8) {
        // At the treasure: it has to physically TAKE it, which is the window you
        // get to shoot it off the prize. It used to teleport out of existence the
        // instant it touched the spot.
        //
        // And it ANNOUNCES it. GRAB_TIME is the only counterplay this system
        // offers, and a window you can't perceive is not counterplay — the whole
        // race was resolving off-screen with a toast for an epitaph. The cue is
        // positional, so it also tells you which way to run.
        audio.playAt("thiefGrab", pos.current.x, pos.current.z, 10, 60);
        phase.current = "taking";
        grabClock.current = GRAB_TIME;
        anim.current.moving = false;
      } else if (phase.current === "fleeing" && dGoal < 1.5) {
        // Out through the wall with it. Only NOW is the treasure really gone.
        if (live.current) {
          enemies.delete(live.current.enemy);
          thieves.delete(live.current.ref);
        }
        setEscaped(true);
        // Only a thief that actually got AWAY costs you — and it costs daylight
        // and a relocated treasure, not the run (see store.loseTreasureToThief).
        if (carrying.current) useGame.getState().loseTreasureToThief();
      }
    }

    // Face the way it actually travelled this frame.
    if (moving) {
      const dx = pos.current.x - prevPos.current.x;
      const dz = pos.current.z - prevPos.current.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-5) facing.current = Math.atan2(dx, dz);
    }

    anim.current.moving = moving;
    anim.current.running = panicking || phase.current === "fleeing";
    anim.current.speed = spd;
    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = facing.current;
    }
  });

  if (escaped || !started || removed) return null;

  return (
    <group ref={group} position={[entry[0], 0, entry[1]]}>
      <NpcRig model="npc_thief" state={anim.current} />
      {/* Loot sack — only actually full once it has the treasure. */}
      <mesh position={[-0.3, BODY_H * 0.62, -0.12]} scale={hasLoot ? 1.35 : 0.85}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial
          color={hasLoot ? "#d8b45a" : "#8a6a3c"}
          emissive={hasLoot ? "#8a6a20" : "#000000"}
          emissiveIntensity={hasLoot ? 0.5 : 0}
          roughness={0.85}
        />
      </mesh>
      {/* A CARRIER GLOWS. The treasure it's holding throws light, so from the far
          side of the village a fleeing thief is a moving spark you can pick out
          and chase — the difference between losing a rare and never knowing one
          was on the board. It only appears once the prize is actually taken, so
          it never gives away a thief that hasn't earned the attention. */}
      {hasLoot && (
        <group position={[-0.3, BODY_H * 0.62, -0.12]}>
          <pointLight color="#ffd070" intensity={5} distance={9} decay={2} />
          <mesh>
            <sphereGeometry args={[0.34, 12, 12]} />
            <meshBasicMaterial color="#ffe6a8" transparent opacity={0.32} depthWrite={false} />
          </mesh>
        </group>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
