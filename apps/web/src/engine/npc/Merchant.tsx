"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SpeechBubble } from "./SpeechBubble";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { VILLAGE } from "@/engine/world/village";
import { NpcRig, type NpcRigState } from "@/engine/character/NpcRig";

/**
 * The market trader.
 *
 * The marketplace was a shop UI, not a place: stalls with nobody behind them, no
 * vendor, no other shoppers — the loneliest bazaar in gaming. One person standing
 * at the counter costs almost nothing and turns "press E to open a menu" into an
 * interaction with somebody.
 *
 * Not shootable (no entry in the enemy registry) — a market you can start a
 * firefight in stops being a safe zone.
 */
const GREETINGS = [
  "Powder, bombs, better iron. Name it.",
  "You look like you've had a day. Buy something.",
  "Coin first, questions later. That's the trade.",
];
const HAIL_RANGE = 9;
const REHAIL_GAP = 20; // seconds before it greets you again

export function Merchant() {
  const group = useRef<THREE.Group>(null);
  const cooldown = useRef(0);
  const facing = useRef(0);
  const [line, setLine] = useState<string | null>(null);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: 0 });

  // Stand behind the counter of the main stand, facing the gate you walk in from.
  const post = useRef(new THREE.Vector3(VILLAGE.market.x, 0, VILLAGE.market.z - 1.1));

  useEffect(() => () => setLine(null), []);

  useFrame((_, rawDt) => {
    if (runtime.paused && !useGame.getState().shopOpen) return;
    const dt = Math.min(rawDt, 1 / 30);
    cooldown.current -= dt;

    const d = Math.hypot(
      runtime.playerPos.x - post.current.x,
      runtime.playerPos.z - post.current.z
    );
    if (d < HAIL_RANGE && cooldown.current <= 0 && useGame.getState().roundState === "playing") {
      cooldown.current = REHAIL_GAP;
      const g = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      setLine(g);
      audio.playAt("merchantGreet", post.current.x, post.current.z, 6, 26);
      window.setTimeout(() => setLine(null), 5200);
    }

    // Track the customer.
    if (d < HAIL_RANGE * 1.6) {
      const want = Math.atan2(
        runtime.playerPos.x - post.current.x,
        runtime.playerPos.z - post.current.z
      );
      let df = want - facing.current;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      facing.current += df * Math.min(1, 4 * dt);
    }
    if (group.current) group.current.rotation.y = facing.current;
  });

  return (
    <group ref={group} position={[post.current.x, 0, post.current.z]}>
      <NpcRig model="npc_merchant" state={anim.current} />
      {line && <SpeechBubble text={line} y={2.3} tone="merchant" />}
    </group>
  );
}
