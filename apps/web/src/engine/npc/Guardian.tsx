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
 * One trusted voice who tells you where the treasure is, ONCE, out loud, and
 * never writes it down. Everything else in the village is then trying to talk
 * you out of it, and liars contradict the briefing by name rather than offering
 * unrelated rumours.
 *
 * The memory pressure is the mechanic, so two rules matter:
 *
 *  1. The briefing is deliberately NOT pinned to the HUD. If it were, there'd be
 *     nothing to remember and the liars would be noise instead of a threat.
 *  2. Forgetting must cost you something without ending the run. That's the fox:
 *     it physically runs off to look, and following it is the way back when your
 *     memory gives out. The guardian names it in the first briefing, which is
 *     how the two systems land as one idea rather than two features.
 *
 * It WAITS, it delivers, and it leaves. You cannot walk back and ask again.
 *
 * There is exactly one way it can arrive on screen, and that is by already being
 * there. It used to be spawned seven metres ahead of wherever the player was
 * facing at the top of every chapter, so it faded into being in front of you,
 * mid-map, as many as five times a day. Now it takes a fixed post outside your
 * door before the day starts and stands in it, which is also the only staging
 * that survives the day beginning indoors.
 *
 * Reading the briefing is now mandatory, not a race against a timer (Marvy's
 * call): the moment it starts speaking, `runtime.guardianGate` goes up, which
 * PlayerController folds into `paused` AND the movement freeze — so the whole
 * world stops, not just you. The only way out is an explicit acknowledgment
 * (E, or the Hud's tap prompt on touch), which is what clears the gate. There
 * is deliberately no auto-dismiss: some people read faster than others.
 */
const SPEAK_RANGE = 5.5;
const WALK_SPEED = 2.6;
const LEAVE_DIST = 26; // how far it walks off before vanishing

type Phase = "gone" | "waiting" | "speaking" | "leaving";
const _goal = new THREE.Vector3();

export function Guardian() {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(VILLAGE.guardianPost.clone());
  const phase = useRef<Phase>("gone");
  const facing = useRef(Math.PI);
  const briefCount = useRef(0);
  const [line, setLine] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: WALK_SPEED });

  // Reset when a run restarts.
  const roundNonce = useGame((s) => s.roundNonce);
  useEffect(() => {
    phase.current = "gone";
    briefCount.current = 0;
    runtime.guardianBriefed = false;
    runtime.guardianGate = false;
    setLine(null);
    setVisible(false);
  }, [roundNonce]);

  useFrame((_, rawDt) => {
    const gs = useGame.getState();
    // `runtime.paused` is true WHILE the gate is up (it's what freezes the rest
    // of the world), which would deadlock this component's own state machine —
    // it would never see the gate clear. Keep evaluating through the pause it
    // itself is causing; everything else still respects it as normal.
    if (gs.roundState !== "playing" || (runtime.paused && phase.current !== "speaking")) return;
    const dt = Math.min(rawDt, 1 / 30);

    // Wait for the player to actually be at the controls. The opening chapter is
    // live from the moment the scene mounts — which is mid-load — so without this
    // the first (and most important) briefing was delivered to nobody.
    if (!runtime.playerReady) return;

    // ONE briefing a day, taken at the post outside your door before you are up.
    //
    // It used to be one per CHAPTER, which meant up to five a day, each one
    // conjured in front of you wherever you happened to be standing. Tying it to
    // the morning instead is what makes it a person with a habit rather than a
    // system that fires on a state change, and it is the only version that works
    // now that a day starts behind a closed door.
    //
    // The cost is real and deliberate: later chapters reseed the board and no
    // longer come with a fresh bearing, so once you have spent the morning's
    // briefing the fox and the villagers are what you have left.
    if (phase.current === "gone" && briefCount.current === 0) {
      pos.current.copy(VILLAGE.guardianPost);
      phase.current = "waiting";
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
          runtime.guardianGate = true;
          const real = HINTS.find((h) => h.real);
          const first = briefCount.current === 0;
          briefCount.current++;
          setLine(guardianBrief(pos.current, real?.pos ?? runtime.playerPos, first));
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

      case "speaking":
        // Waits for PlayerController (E) or the Hud tap prompt to clear the
        // gate — see the class doc. Nothing here counts down on its own.
        if (!runtime.guardianGate) {
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
