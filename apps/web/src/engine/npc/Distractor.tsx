"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { runtime } from "@/engine/runtime";
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";

const MAX_HEALTH = 2;
const BODY_H = 1.8;
const BODY_R = 0.42;
const BUBBLE_RANGE = 22; // fake-dialogue bubble only shows within earshot

const LINES = [
  "The treasure's this way, friend!",
  "I saw it glint over there — go!",
  "Trust me, that glow is the real one.",
  "Everyone knows it's just past here!",
];

/**
 * A distractor NPC (DESIGN §2): unarmed, broadcasts a fake hint. It stands by a
 * decoy and lies about it. Shoot it (2 hits, it never fights back) and its decoy
 * ping is silenced — one way to clean up the compass, alongside the fox's sniff.
 */
export function Distractor({
  position,
  hintIndex,
}: {
  position: [number, number, number];
  hintIndex: number;
}) {
  const [health, setHealth] = useState(MAX_HEALTH);
  const [removed, setRemoved] = useState(false); // unmount after the death lies out
  const dead = health <= 0;
  const line = useRef(LINES[hintIndex % LINES.length]);
  // Per-instance drive so the death flag can be set (it just stands + lies otherwise).
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: 0 });
  anim.current.dead = dead;

  // The lie is spoken, not broadcast: only render the bubble within earshot
  // (drei's `occlude` proved unreliable at long range through walls).
  const [nearby, setNearby] = useState(false);
  const nearbyRef = useRef(false);
  useFrame(() => {
    const dx = position[0] - runtime.playerPos.x;
    const dz = position[2] - runtime.playerPos.z;
    const near = dx * dx + dz * dz < BUBBLE_RANGE * BUBBLE_RANGE;
    if (near !== nearbyRef.current) {
      nearbyRef.current = near;
      setNearby(near);
    }
  });

  useEffect(() => {
    const pos = new THREE.Vector3(position[0], position[1], position[2]);
    const enemy: Enemy = {
      getPosition: () => pos,
      hitRadius: 0.8,
      hitHeight: 1.0,
      bodyRadius: 0.45,
      takeHit: (damage) => {
        anim.current.hitAt = performance.now(); // stagger + flash punch
        setHealth((h) => {
          const next = Math.max(0, h - damage);
          if (next === 0) {
            enemies.delete(enemy);
            runtime.hintSilenced[hintIndex] = true; // its decoy vanishes
          }
          return next;
        });
      },
    };
    enemies.add(enemy);
    return () => {
      enemies.delete(enemy);
    };
  }, [position, hintIndex]);

  // Shot down: lie for a beat before despawning (its decoy is already silenced).
  useEffect(() => {
    if (!dead) return;
    const id = setTimeout(() => setRemoved(true), DEATH_LINGER_MS);
    return () => clearTimeout(id);
  }, [dead]);

  if (removed) return null;

  return (
    <group position={position}>
      <NpcRig model="npc_distractor" state={anim.current} />
      {/* Lantern prop — the "false light" it waves at you (dropped once downed) */}
      {!dead && (
        <mesh position={[0.35, BODY_H * 0.55, 0.12]}>
          <boxGeometry args={[0.22, 0.28, 0.22]} />
          <meshStandardMaterial color="#f2c14e" emissive="#f2c14e" emissiveIntensity={0.6} />
        </mesh>
      )}
      {/* Fake dialogue — only within earshot, and only while alive */}
      {nearby && !dead && (
        <Html position={[0, BODY_H + 0.55, 0]} center distanceFactor={18} occlude style={{ pointerEvents: "none" }}>
          <div style={bubble}>{line.current}</div>
        </Html>
      )}
      {/* Contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

const bubble: React.CSSProperties = {
  padding: "4px 9px",
  borderRadius: 8,
  background: "rgba(122,108,174,0.92)",
  color: "#ffffff",
  fontSize: 12,
  whiteSpace: "nowrap",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  border: "1px solid rgba(255,255,255,0.3)",
};
