"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audio } from "./audio";
import { AUDIO } from "@/engine/config/audio";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { explosions } from "@/engine/combat/bombs";

/**
 * Turns game state into sound. Lives inside the Canvas for `useFrame`. Per-frame
 * signals (gunfire, footsteps, blasts) are read as rising edges off `runtime`
 * timestamps; discrete state changes (claim, deposit, death, round end) come
 * from a zustand subscription. This is the ONLY place that decides *when* a cue
 * plays — the AudioBus decides *how*.
 */
export function AudioDriver() {
  // Last-seen values for edge detection.
  const seen = useRef({
    fireAt: -1,
    hitAt: -1,
    stolenAt: -1,
    sniffReadyAt: 0,
    explosionAt: -1,
    foxClock: 3 + Math.random() * 4,
    ducked: false,
  });

  // Discrete state → cues.
  useEffect(() => {
    const unsub = useGame.subscribe((s, prev) => {
      if (s.treasureClaimed && !prev.treasureClaimed) {
        audio.play(s.treasureCracked ? "claimCracked" : "claim");
      }
      if (s.villeBanked > prev.villeBanked) audio.play("deposit");
      // (the bomb-throw whoosh now plays at the hand-release point, fired from
      // PlayerController in sync with the throw animation — not on the count drop)
      if (s.isDead && !prev.isDead) audio.play("death");
      // Grunt as a REACTION to impact — a beat after the hit lands, so it never
      // collides with (or gets masked by) the enemy's muzzle report.
      if (s.playerHealth < prev.playerHealth && !s.isDead) {
        window.setTimeout(() => audio.play("hurt"), AUDIO.hurtDelay * 1000);
      }
      if (s.roundState === "lost" && prev.roundState === "playing") audio.play("lose");
    });
    return unsub;
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const st = seen.current;

    // Player gunshot / hitmarker.
    if (runtime.fireAt !== st.fireAt) {
      st.fireAt = runtime.fireAt;
      if (runtime.fireAt > 0) audio.play("gunshot");
    }
    if (runtime.hitAt !== st.hitAt) {
      st.hitAt = runtime.hitAt;
      if (runtime.hitAt > 0) audio.play("hit");
    }

    // A thief made off with a treasure.
    if (runtime.treasureStolenAt !== st.stolenAt) {
      st.stolenAt = runtime.treasureStolenAt;
      if (runtime.treasureStolenAt > 0) audio.play("alert");
    }

    // Successful fox sniff (Q) pushes the cooldown gate forward.
    if (runtime.sniffReadyAt > st.sniffReadyAt) audio.play("sniff");
    st.sniffReadyAt = runtime.sniffReadyAt;

    // Bomb blast — newest explosion, attenuated by distance.
    let newest = st.explosionAt;
    let bx = 0;
    let bz = 0;
    for (const e of explosions) {
      if (e.at > newest) {
        newest = e.at;
        bx = e.x;
        bz = e.z;
      }
    }
    if (newest > st.explosionAt) {
      st.explosionAt = newest;
      const d = Math.hypot(bx - runtime.playerPos.x, bz - runtime.playerPos.z);
      audio.play("blast", audio.distanceVolume(d, AUDIO.blastNear, AUDIO.blastFar));
    }

    // Occasional fox pant when the companion is near and settled.
    st.foxClock -= dt;
    if (st.foxClock <= 0) {
      st.foxClock = 4 + Math.random() * 6;
      if (!runtime.sheltered && useGame.getState().roundState === "playing") audio.play("foxPant");
    }

    // Muffle the beds while indoors (world paused).
    const wantDuck = runtime.sheltered;
    if (wantDuck !== st.ducked) {
      st.ducked = wantDuck;
      audio.duck(wantDuck ? AUDIO.indoorDuck : 1);
    }
  });

  return null;
}
