"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SpeechBubble } from "./SpeechBubble";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { steerTowards } from "@/engine/fox/foxBrain";
import { NpcRig, type NpcRigState, DEATH_LINGER_MS } from "@/engine/character/NpcRig";
import { makeClaim, type VillagerClaim } from "./villagerLines";
import { bearingTo, setRumour } from "@/engine/world/leads";

const MAX_HEALTH = 2;
const BODY_H = 1.8;
const BODY_R = 0.42;

const NOTICE_RANGE = 26; // starts walking toward you from here
const SPEAK_RANGE = 4.5; // stops and delivers the line
const LOSE_RANGE = 34; // gives up and goes home
const WALK_SPEED = 2.4;
const SPEAK_TIME = 6.5; // seconds the bubble stays up
const RESPEAK_GAP = 14; // seconds before it'll pester you again

type Mood = "waiting" | "approaching" | "speaking" | "spent";
const _goal = new THREE.Vector3();

/**
 * A villager (DESIGN §2 "distractor"). It used to be a lamppost: it stood on one
 * spot forever, never moved, and displayed a CSS speech bubble — so the game's
 * central deception mechanic was both silent and inert, and since EVERY one of
 * them lied, the winning strategy was to ignore all of them.
 *
 * Now it notices you, walks over, hails you, and tells you where the treasure is
 * — out loud. Roughly one in three is telling the truth (see villagerLines), so
 * you have to actually weigh what you're told. Shoot it and its claim dies with
 * it, which is a real cost when the one you shot was honest.
 */
export function Distractor({
  position,
  hintIndex,
  truthful,
}: {
  position: [number, number, number];
  hintIndex: number;
  truthful: boolean;
}) {
  const [health, setHealth] = useState(MAX_HEALTH);
  const [removed, setRemoved] = useState(false);
  const dead = health <= 0;
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const home = useMemo(() => new THREE.Vector3(position[0], 0, position[2]), [position]);
  const mood = useRef<Mood>("waiting");
  const speakClock = useRef(0);
  const cooldown = useRef(0);
  const facing = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);

  const claim = useRef<VillagerClaim>(
    makeClaim(new THREE.Vector3(position[0], 0, position[2]), truthful, hintIndex)
  );
  // The board reseeds every chapter, so a claim made against the old layout would
  // be stale nonsense. Rebuild whenever the chapter turns — and once a guardian
  // has briefed you, liars switch to contradicting it directly.
  const claimChapter = useRef(-1);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: WALK_SPEED });
  anim.current.dead = dead;

  useEffect(() => {
    const enemy: Enemy = {
      kind: "distractor",
      getPosition: () => pos.current,
      hitRadius: 0.8,
      hitHeight: 1.0,
      bodyRadius: 0.45,
      takeHit: (damage) => {
        anim.current.hitAt = performance.now();
        setHealth((h) => {
          const next = Math.max(0, h - damage);
          if (next === 0) {
            enemies.delete(enemy);
            runtime.hintSilenced[hintIndex] = true;
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
    if (!dead) return;
    setBubble(null);
    const id = setTimeout(() => setRemoved(true), DEATH_LINGER_MS);
    return () => clearTimeout(id);
  }, [dead]);

  useFrame((_, rawDt) => {
    if (dead || runtime.paused) return;
    const gs = useGame.getState();
    if (gs.roundState !== "playing") return;
    const dt = Math.min(rawDt, 1 / 30);
    cooldown.current -= dt;

    if (claimChapter.current !== gs.chapter) {
      claimChapter.current = gs.chapter;
      claim.current = makeClaim(home, truthful, hintIndex + gs.chapter, runtime.guardianBriefed);
    }

    const d = Math.hypot(runtime.playerPos.x - pos.current.x, runtime.playerPos.z - pos.current.z);
    let moving = false;

    switch (mood.current) {
      case "waiting":
        if (d < NOTICE_RANGE && cooldown.current <= 0 && !gs.isDead) {
          mood.current = "approaching";
          audio.playAt("villagerHail", pos.current.x, pos.current.z, 8, 40);
        } else if (pos.current.distanceTo(home) > 0.6) {
          // Drift back to its post between conversations.
          moving = steerTowards(pos.current, home, WALK_SPEED * 0.7, dt, BODY_R) > 1e-4;
        }
        break;

      case "approaching":
        if (d > LOSE_RANGE || gs.isDead) {
          mood.current = "waiting";
        } else if (d <= SPEAK_RANGE) {
          mood.current = "speaking";
          speakClock.current = SPEAK_TIME;
          setBubble(claim.current.line);
          // Paint what it claims onto the compass as a RUMOUR wedge — beside the
          // guardian's lead, never on top of it. A liar's bearing looks exactly
          // like an honest one; the choice of which to walk toward stays yours,
          // and that choice is the mechanic.
          setRumour(
            bearingTo(pos.current.x, pos.current.z, claim.current.target.x, claim.current.target.z),
            performance.now()
          );
          audio.playAt("villagerLine", pos.current.x, pos.current.z, 8, 34);
        } else {
          _goal.set(runtime.playerPos.x, 0, runtime.playerPos.z);
          moving = steerTowards(pos.current, _goal, WALK_SPEED, dt, BODY_R) > 1e-4;
        }
        break;

      case "speaking":
        speakClock.current -= dt;
        if (speakClock.current <= 0 || d > LOSE_RANGE) {
          mood.current = "spent";
          cooldown.current = RESPEAK_GAP;
          setBubble(null);
        }
        break;

      case "spent":
        if (cooldown.current <= 0) mood.current = "waiting";
        else if (pos.current.distanceTo(home) > 0.6) {
          moving = steerTowards(pos.current, home, WALK_SPEED * 0.7, dt, BODY_R) > 1e-4;
        }
        break;
    }

    // Face the player while engaging, otherwise face where it's walking.
    const faceTarget =
      mood.current === "approaching" || mood.current === "speaking"
        ? Math.atan2(runtime.playerPos.x - pos.current.x, runtime.playerPos.z - pos.current.z)
        : facing.current;
    let df = faceTarget - facing.current;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    facing.current += df * Math.min(1, 6 * dt);

    anim.current.moving = moving;
    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = facing.current;
    }
  });

  if (removed) return null;

  return (
    <group ref={group} position={position}>
      <NpcRig model="npc_distractor" state={anim.current} />
      {/* Lantern prop — the "false light" it waves at you (dropped once downed) */}
      {!dead && (
        <mesh position={[0.35, BODY_H * 0.55, 0.12]}>
          <boxGeometry args={[0.22, 0.28, 0.22]} />
          <meshStandardMaterial color="#f2c14e" emissive="#f2c14e" emissiveIntensity={0.6} />
        </mesh>
      )}
      {/* What it's telling you. Deliberately NOT colour-coded by truthfulness —
          working that out is the game. */}
      {bubble && !dead && <SpeechBubble text={bubble} y={BODY_H + 0.55} tone="villager" />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[BODY_R * 1.4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

