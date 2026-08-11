"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SpeechBubble } from "./SpeechBubble";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { VILLAGE } from "@/engine/world/village";
import { HINTS } from "@/engine/world/hints";
import { steerTowards } from "@/engine/fox/foxBrain";
import { NpcRig, type NpcRigState } from "@/engine/character/NpcRig";
import { guardianBrief } from "./villagerLines";
import { bearingTo, setLead } from "@/engine/world/leads";

/**
 * The guardian (Marvy's design, Phase 6).
 *
 * One trusted voice, at the start of each chapter, who tells you where the
 * treasure is — ONCE, out loud, and never writes it down. Everything else in the
 * village is then trying to talk you out of it: liars now contradict the
 * briefing by name rather than offering unrelated rumours.
 *
 * The memory pressure is the mechanic, so two rules matter:
 *
 *  1. The briefing is deliberately NOT pinned to the HUD. If it were, there'd be
 *     nothing to remember and the liars would be noise instead of a threat.
 *  2. Forgetting must cost you something without ending the run. That's the fox:
 *     it physically runs to the real treasure, and it cannot lie. The guardian
 *     tells you so in the first briefing, which is how the two systems get
 *     introduced as one idea rather than two features.
 *
 * It appears, delivers, and LEAVES — you can't walk back and ask again.
 */
const APPEAR_AT = new THREE.Vector3(VILLAGE.spawn.x + 2.2, 0, VILLAGE.spawn.z - 3.5);
const SPEAK_RANGE = 5.5;
const HOLD_TIME = 9; // seconds the briefing stays up
const WALK_SPEED = 2.6;
const LEAVE_DIST = 26; // how far it walks off before vanishing

type Phase = "gone" | "waiting" | "arriving" | "speaking" | "leaving";
const _goal = new THREE.Vector3();

export function Guardian() {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(APPEAR_AT.clone());
  const phase = useRef<Phase>("gone");
  const holdClock = useRef(0);
  const facing = useRef(Math.PI);
  const seenChapter = useRef(-1);
  const briefCount = useRef(0);
  const [line, setLine] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: WALK_SPEED });

  // Reset when a run restarts.
  const roundNonce = useGame((s) => s.roundNonce);
  useEffect(() => {
    phase.current = "gone";
    seenChapter.current = -1;
    briefCount.current = 0;
    runtime.guardianBriefed = false;
    setLine(null);
    setVisible(false);
  }, [roundNonce]);

  useFrame((_, rawDt) => {
    const gs = useGame.getState();
    if (gs.roundState !== "playing" || runtime.paused) return;
    const dt = Math.min(rawDt, 1 / 30);

    // Wait for the player to actually be at the controls. The opening chapter is
    // live from the moment the scene mounts — which is mid-load — so without this
    // the first (and most important) briefing was delivered to nobody.
    if (!runtime.playerReady) return;

    // A new chapter means a new board, so it comes back with a new briefing.
    if (seenChapter.current !== gs.chapter) {
      const opening = seenChapter.current < 0 && gs.chapter === 0;
      seenChapter.current = gs.chapter;
      if (opening) {
        // THE OPENING. It is already outside your door, waiting, before you have
        // opened it — so the first thing that happens today is meeting someone
        // who came to find you.
        //
        // It used to materialise seven metres ahead of wherever the player was
        // looking, which is what made it read as conjured rather than met: turn
        // around, and a man faded into being in front of you. Now the day starts
        // in a room, and that same rule would have put him in your bedroom.
        pos.current.copy(VILLAGE.guardianPost);
        phase.current = "waiting";
      } else {
        // Later chapters keep the old approach for now.
        const yaw = runtime.yaw;
        pos.current.set(
          runtime.playerPos.x - Math.sin(yaw) * 7,
          0,
          runtime.playerPos.z - Math.cos(yaw) * 7
        );
        phase.current = "arriving";
        audio.playAt("merchantGreet", pos.current.x, pos.current.z, 8, 40);
      }
      setVisible(true);
    }

    const d = Math.hypot(runtime.playerPos.x - pos.current.x, runtime.playerPos.z - pos.current.z);
    let moving = false;

    switch (phase.current) {
      case "waiting":
        // Stands its ground. No steering at all — a guardian that walks to meet
        // you is one you can back away from, and the whole point is that it was
        // here first and you came to it.
        //
        // `sheltered` is the real gate, not distance. Your door is close enough
        // to the post that raw range let it deliver the whole briefing through
        // the bedroom wall while you were still waking up, which threw away the
        // one beat this scene exists for. It speaks when you are OUTSIDE.
        if (!runtime.sheltered && d <= SPEAK_RANGE) {
          phase.current = "speaking";
          holdClock.current = HOLD_TIME;
          const real = HINTS.find((h) => h.real);
          briefCount.current++;
          setLine(guardianBrief(pos.current, real?.pos ?? runtime.playerPos, true));
          runtime.guardianBriefed = true;
          runtime.guardianSpokeAt = performance.now();
          if (real) {
            setLead(
              "guardian",
              bearingTo(pos.current.x, pos.current.z, real.pos.x, real.pos.z),
              performance.now()
            );
          }
          audio.playAt("villagerLine", pos.current.x, pos.current.z, 8, 40);
        }
        break;

      case "arriving":
        if (d <= SPEAK_RANGE) {
          phase.current = "speaking";
          holdClock.current = HOLD_TIME;
          const real = HINTS.find((h) => h.real);
          const first = briefCount.current === 0;
          briefCount.current++;
          setLine(guardianBrief(pos.current, real?.pos ?? runtime.playerPos, first));
          runtime.guardianBriefed = true;
          runtime.guardianSpokeAt = performance.now();
          // Put the bearing it just named on the compass as a SECTOR that fades
          // (see world/leads.ts). Not a pin: you still have to go and look, and
          // in a minute you'll only half-remember which way it said.
          if (real) {
            setLead(
              "guardian",
              bearingTo(pos.current.x, pos.current.z, real.pos.x, real.pos.z),
              performance.now()
            );
          }
          audio.playAt("villagerLine", pos.current.x, pos.current.z, 8, 40);
        } else {
          _goal.set(runtime.playerPos.x, 0, runtime.playerPos.z);
          moving = steerTowards(pos.current, _goal, WALK_SPEED, dt, 0.45) > 1e-4;
        }
        break;

      case "speaking":
        holdClock.current -= dt;
        if (holdClock.current <= 0) {
          phase.current = "leaving";
          setLine(null);
        }
        break;

      case "leaving":
        // Walks back toward the gate and goes. You cannot ask again — that's the
        // point; the briefing has to live in your head, not on the map.
        _goal.set(VILLAGE.spawn.x, 0, VILLAGE.spawn.z + 8);
        moving = steerTowards(pos.current, _goal, WALK_SPEED, dt, 0.45) > 1e-4;
        if (pos.current.distanceTo(_goal) < 1.5 || d > LEAVE_DIST) {
          phase.current = "gone";
          setVisible(false);
        }
        break;
    }

    // Face the player while engaging, else face travel.
    const want =
      phase.current === "leaving"
        ? Math.atan2(_goal.x - pos.current.x, _goal.z - pos.current.z)
        : Math.atan2(runtime.playerPos.x - pos.current.x, runtime.playerPos.z - pos.current.z);
    let df = want - facing.current;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    facing.current += df * Math.min(1, 5 * dt);

    anim.current.moving = moving;
    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z);
      group.current.rotation.y = facing.current;
    }
  });

  if (!visible) return null;

  return (
    <group ref={group}>
      <NpcRig model="guardian" state={anim.current} />
      {line && <SpeechBubble text={line} y={2.75} tone="guardian" />}
    </group>
  );
}
