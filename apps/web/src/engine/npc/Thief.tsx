"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { useGame } from "@/engine/store";
import { thieves, type ThiefRef } from "./thieves";
import { THIEF } from "@/engine/config/round";

const BODY_H = 1.7;
const BODY_R = 0.4;

/**
 * A thief racing the player to the real treasure along a fixed waypoint path
 * (a simple timed racer, DESIGN §13.6). Reach it first or shoot it down — if any
 * thief arrives, the round is lost. Fast and fragile. It doesn't exist in the
 * world until its start time hits (so late thieves can't be pre-sniped at
 * spawn); its blip appearing on the compass IS the "a thief is coming" alarm.
 */
export function Thief({
  path,
  speed = THIEF.speed,
  startDelay = 0,
}: {
  path: [number, number, number][];
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
  const [health, setHealth] = useState<number>(THIEF.health);
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;

  useEffect(() => {
    if (!started) return;
    const ref: ThiefRef = { getPos: () => pos.current };
    thieves.add(ref);
    const enemy: Enemy = {
      getPosition: () => pos.current,
      hitRadius: 0.85,
      hitHeight: 0.9,
      bodyRadius: 0.4,
      takeHit: (damage) => {
        setFlash(true);
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
    return () => {
      enemies.delete(enemy);
      thieves.delete(ref);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 90);
    return () => clearTimeout(id);
  }, [flash]);

  useFrame((_, rawDt) => {
    if (dead || useGame.getState().roundState !== "playing") return;
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
        if (seg.current >= wp.length - 1) useGame.getState().endRound("thief"); // reached treasure
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
  });

  if (dead || !started) return null;

  return (
    <group ref={group} position={[wp[0].x, 0, wp[0].z]}>
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
