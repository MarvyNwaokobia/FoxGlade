"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { useGame } from "@/engine/store";
import { thieves, type ThiefRef } from "./thieves";
import { THIEF } from "@/engine/config/round";
import { HINTS } from "@/engine/world/hints";
import { runtime } from "@/engine/runtime";
import type { Enemy as EnemyT } from "@/engine/combat/enemies";
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";

const BODY_H = 1.7;
const BODY_R = 0.4;

/**
 * A thief racing the player to ONE specific real treasure along a fixed
 * waypoint path (a simple timed racer, DESIGN §13.6). If it arrives, it makes
 * off with THAT treasure (§14.1) — the round is lost only when every real
 * treasure is stolen. Fast and fragile: shoot it down to save the treasure.
 * It doesn't exist in the world until its start time hits (so late thieves
 * can't be pre-sniped); its blip appearing on the compass IS the alarm.
 */
export function Thief({
  path,
  targetHint,
  speed = THIEF.speed,
  startDelay = 0,
}: {
  path: [number, number, number][];
  /** Index into HINTS of the (real) treasure this thief is racing for. */
  targetHint: number;
  speed?: number;
  startDelay?: number;
}) {
  const wp = useMemo(() => path.map((p) => new THREE.Vector3(p[0], p[1], p[2])), [path]);
  const group = useRef<THREE.Group>(null);
  const pos = useRef(wp[0].clone());
  const seg = useRef(0);
  const facing = useRef(0);
  const delay = useRef(startDelay);
  const [started, setStarted] = useState(startDelay <= 0);
  const [escaped, setEscaped] = useState(false); // reached its treasure and left
  const [health, setHealth] = useState<number>(THIEF.health);
  const [removed, setRemoved] = useState(false); // unmount after the death lies out
  const live = useRef<{ enemy: EnemyT; ref: ThiefRef } | null>(null);
  const anim = useRef<NpcRigState>({ moving: false, running: true, fireAt: -1, speed });
  const dead = health <= 0;

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
        anim.current.hitAt = performance.now(); // stagger + flash punch
        setHealth((h) => {
          const next = Math.max(0, h - damage);
          if (next === 0) {
            enemies.delete(enemy);
            thieves.delete(ref);
          }
          return next;
        });
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

  // Shot down: stop racing (useFrame bails on `dead`), lie for a beat, then despawn.
  useEffect(() => {
    if (!dead) return;
    anim.current.dead = true;
    const id = setTimeout(() => setRemoved(true), DEATH_LINGER_MS);
    return () => clearTimeout(id);
  }, [dead]);

  useFrame((_, rawDt) => {
    if (dead || escaped || useGame.getState().roundState !== "playing") return;
    if (runtime.paused) return; // player indoors or shopping: the world is paused
    const dt = Math.min(rawDt, 1 / 30);
    if (!started) {
      delay.current -= dt; // not yet in the world (staggered starts)
      if (delay.current <= 0) setStarted(true);
      return;
    }
    if (seg.current < wp.length - 1) {
      const target = wp[seg.current + 1];
      const to = target.clone().sub(pos.current);
      to.y = 0;
      const d = to.length();
      const step = speed * dt;
      if (d <= step) {
        pos.current.copy(target);
        seg.current++;
        if (seg.current >= wp.length - 1) {
          // Reached its treasure: it's stolen and the thief melts away. The
          // round is lost only when no real treasure is left to claim. (If a
          // faster thief already took this one, it leaves empty-handed.)
          if (!runtime.hintStolen[targetHint] && !runtime.hintClaimed[targetHint]) {
            runtime.hintStolen[targetHint] = true;
            runtime.treasureStolenAt = performance.now();
          }
          if (live.current) {
            enemies.delete(live.current.enemy);
            thieves.delete(live.current.ref);
          }
          setEscaped(true);
          const allGone = HINTS.every((h, i) => !h.real || runtime.hintStolen[i]);
          if (allGone) useGame.getState().endRound("thief");
        }
      } else {
        to.multiplyScalar(1 / d);
        pos.current.addScaledVector(to, step);
        facing.current = Math.atan2(to.x, to.z);
      }
    }

    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = facing.current;
    }
    anim.current.moving = true; // always racing while alive
  });

  if (escaped || !started || removed) return null; // corpse lingers while `dead`

  return (
    <group ref={group} position={[wp[0].x, 0, wp[0].z]}>
      <NpcRig model="npc_thief" state={anim.current} />
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
