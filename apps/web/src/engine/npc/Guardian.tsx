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
import { guardianBriefPages } from "./villagerLines";
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
 * world stops, not just you. There is deliberately no auto-dismiss: some
 * people read faster than others.
 *
 * The first briefing of a run is PAGED rather than one paragraph (Marvy's
 * call, 2026-08-14): it walks the shape of the whole day, one beat per tap —
 * where the treasure is, then morning, then afternoon, then dusk — instead of
 * a wall of text nobody actually reads end to end. E (or the Hud's tap
 * prompt on touch) bumps `runtime.guardianAdvance`; this component is the
 * only thing that knows how many pages there are, so it's the one deciding
 * whether that bump means "next page" or "actually clear the gate." Later
 * mornings get a single short page — the day's shape is already known.
 */
const SPEAK_RANGE = 5.5;
const WALK_SPEED = 2.6;
const LEAVE_DIST = 26; // how far it walks off before vanishing
/**
 * How long the player has to have been OUTSIDE before the guardian is allowed
 * to speak (Marvy's call, 2026-08-13). The post sits close enough to the door
 * that distance alone was already satisfied the instant `sheltered` flipped
 * false — so the freeze used to land on the very frame you crossed the
 * threshold, before you'd taken a step or the over-the-shoulder camera (which
 * pulls in tight near walls, see PlayerController's collision-solved boom)
 * had any room to ease back out. The result was a hard-frozen shot of a wall,
 * not the player standing outside facing the guardian. This buffer just lets
 * a couple of real steps and the camera's own follow happen BEFORE anything
 * locks — the gate itself is still immediate once it fires.
 */
const STEP_OUT_GRACE = 0.7; // seconds

type Phase = "gone" | "waiting" | "speaking" | "leaving";
const _goal = new THREE.Vector3();

export function Guardian() {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(VILLAGE.guardianPost.clone());
  const phase = useRef<Phase>("gone");
  const facing = useRef(Math.PI);
  const briefCount = useRef(0);
  /** performance.now the player was last seen stepping OUT of shelter; -1
   *  while sheltered. Drives STEP_OUT_GRACE. */
  const unshelteredAt = useRef(-1);
  const [line, setLine] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const anim = useRef<NpcRigState>({ moving: false, running: false, fireAt: -1, speed: WALK_SPEED });
  /** The current briefing's pages, and where we are in them. */
  const pages = useRef<string[]>([]);
  const pageIndex = useRef(0);
  /** Last `runtime.guardianAdvance` value we've already acted on, so we only
   *  react to a NEW tap/E-press rather than re-triggering on our own reads. */
  const seenAdvance = useRef(0);

  // Reset when a run restarts.
  const roundNonce = useGame((s) => s.roundNonce);
  useEffect(() => {
    phase.current = "gone";
    briefCount.current = 0;
    unshelteredAt.current = -1;
    pages.current = [];
    pageIndex.current = 0;
    seenAdvance.current = runtime.guardianAdvance;
    runtime.guardianBriefed = false;
    runtime.guardianGate = false;
    runtime.guardianPage = 0;
    runtime.guardianPageCount = 1;
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

    // Tracks how long it's been since the player was last inside, so the
    // "waiting" case below can require a beat of actually being outside
    // before it's allowed to trigger — see STEP_OUT_GRACE.
    if (runtime.sheltered) unshelteredAt.current = -1;
    else if (unshelteredAt.current < 0) unshelteredAt.current = performance.now();
    const steppedOutFor = unshelteredAt.current > 0 ? (performance.now() - unshelteredAt.current) / 1000 : 0;

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
        // one beat this scene exists for. It speaks when you are OUTSIDE — and
        // now only once you've BEEN outside for a beat (STEP_OUT_GRACE), not on
        // the exact frame you cross the threshold.
        if (!runtime.sheltered && d <= SPEAK_RANGE && steppedOutFor >= STEP_OUT_GRACE) {
          phase.current = "speaking";
          runtime.guardianGate = true;
          const real = HINTS.find((h) => h.real);
          const first = briefCount.current === 0;
          briefCount.current++;
          pages.current = guardianBriefPages(pos.current, real?.pos ?? runtime.playerPos, first, gs.day);
          pageIndex.current = 0;
          seenAdvance.current = runtime.guardianAdvance;
          runtime.guardianPage = 0;
          runtime.guardianPageCount = pages.current.length;
          setLine(pages.current[0]);
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
        // Waits for PlayerController (E) or the Hud tap prompt to bump
        // `guardianAdvance` — see the class doc. Nothing here counts down on
        // its own. Each bump either turns the page or, on the last page,
        // clears the gate.
        if (runtime.guardianAdvance !== seenAdvance.current) {
          seenAdvance.current = runtime.guardianAdvance;
          pageIndex.current++;
          if (pageIndex.current >= pages.current.length) {
            runtime.guardianGate = false;
          } else {
            runtime.guardianPage = pageIndex.current;
            setLine(pages.current[pageIndex.current]);
          }
        }
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
