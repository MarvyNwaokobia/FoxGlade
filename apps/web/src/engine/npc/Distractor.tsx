"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { runtime } from "@/engine/runtime";

const MAX_HEALTH = 2;
const BODY_H = 1.8;
const BODY_R = 0.42;

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
  const [flash, setFlash] = useState(false);
  const dead = health <= 0;
  const line = useRef(LINES[hintIndex % LINES.length]);

  useEffect(() => {
    const pos = new THREE.Vector3(position[0], position[1], position[2]);
    const enemy: Enemy = {
      getPosition: () => pos,
      hitRadius: 0.8,
      hitHeight: 1.0,
      bodyRadius: 0.45,
      takeHit: () => {
        setFlash(true);
        setHealth((h) => {
          const next = Math.max(0, h - 1);
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

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 90);
    return () => clearTimeout(id);
  }, [flash]);

  if (dead) return null;

  return (
    <group position={position}>
      <mesh position={[0, BODY_H / 2, 0]} castShadow>
        <capsuleGeometry args={[BODY_R, BODY_H - BODY_R * 2, 6, 12]} />
        <meshStandardMaterial color={flash ? "#ffffff" : "#7a6cae"} roughness={0.7} />
      </mesh>
      {/* Lantern prop — the "false light" it waves at you */}
      <mesh position={[0.35, BODY_H * 0.55, 0.12]}>
        <boxGeometry args={[0.22, 0.28, 0.22]} />
        <meshStandardMaterial color="#f2c14e" emissive="#f2c14e" emissiveIntensity={0.6} />
      </mesh>
      {/* Fake dialogue */}
      <Html position={[0, BODY_H + 0.55, 0]} center distanceFactor={18} occlude style={{ pointerEvents: "none" }}>
        <div style={bubble}>{line.current}</div>
      </Html>
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
