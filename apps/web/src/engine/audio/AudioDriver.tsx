"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "./audio";
import { AUDIO } from "@/engine/config/audio";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { explosions } from "@/engine/combat/bombs";
import { VILLAGE } from "@/engine/world/village";
import { spawnDust } from "@/engine/combat/dust";

const _dustPos = new THREE.Vector3();

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
    headshotAt: -1,
    stolenAt: -1,
    sniffReadyAt: 0,
    explosionAt: -1,
    foxClock: 3 + Math.random() * 4,
    ducked: false,
    // Footstep cadence: accumulate ground distance, step once per stride length.
    stepAccum: 0,
    lastX: runtime.playerPos.x,
    lastZ: runtime.playerPos.z,
  });

  // Discrete state → cues.
  useEffect(() => {
    const unsub = useGame.subscribe((s, prev) => {
      if (s.treasureClaimed && !prev.treasureClaimed) {
        audio.play(s.treasureCracked ? "claimCracked" : "claim");
      }
      if (s.villeEarned > prev.villeEarned) audio.play("deposit");
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

    // Keep the 3D audio listener on the player (ear height ~1.5m) so positional
    // cues — enemy fire, blasts — pan to where they actually come from.
    audio.setListener(runtime.playerPos.x, 1.5, runtime.playerPos.z, runtime.yaw);

    // Player gunshot / hitmarker.
    if (runtime.fireAt !== st.fireAt) {
      st.fireAt = runtime.fireAt;
      if (runtime.fireAt > 0) audio.play("gunshot");
    }
    if (runtime.hitAt !== st.hitAt) {
      st.hitAt = runtime.hitAt;
      if (runtime.hitAt > 0) audio.play("hit");
    }
    if (runtime.headshotAt !== st.headshotAt) {
      st.headshotAt = runtime.headshotAt;
      if (runtime.headshotAt > 0) audio.play("headshot");
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
      audio.playAt("blast", bx, bz, AUDIO.blastNear, AUDIO.blastFar);
    }

    // Footsteps: step each time the player covers a stride's worth of ground.
    // Distance-based so the cadence auto-syncs to walk vs run speed. Gated to
    // real over-ground movement (not airborne, indoors, resting, or a respawn
    // teleport, which would register as a huge single-frame jump).
    const px = runtime.playerPos.x;
    const pz = runtime.playerPos.z;
    const moved = Math.hypot(px - st.lastX, pz - st.lastZ);
    st.lastX = px;
    st.lastZ = pz;
    // What you're standing on, and what room you're standing in. Both are just a
    // read of where the player is: inside a house it's boards in a small stone
    // room, inside the ramparts it's cobble in a street, beyond them it's grass
    // under open sky. Cheap, and it does more for "somewhere real" than another
    // ambient loop would.
    const indoors = runtime.sheltered;
    const inTown = Math.abs(px) <= VILLAGE.half && Math.abs(pz) <= VILLAGE.half;
    audio.setSpace(indoors ? "room" : inTown ? "street" : "open");
    const surface = indoors ? "footstepWood" : inTown ? "footstepStone" : "footstepGrass";

    const canStep =
      runtime.grounded &&
      !runtime.sheltered &&
      !runtime.resting &&
      !useGame.getState().isDead &&
      useGame.getState().roundState === "playing";
    if (canStep && moved > 0.002 && moved < 1.5) {
      st.stepAccum += moved;
      const stride = runtime.running ? AUDIO.stepDistanceRun : AUDIO.stepDistanceWalk;
      if (st.stepAccum >= stride) {
        st.stepAccum = 0;
        audio.play(surface, AUDIO.stepVolume);
        // Same trigger as the sound — a step makes both. Wood floors don't
        // kick up dust (Valor's scuff() is an outdoor-ground effect too).
        if (!indoors) {
          _dustPos.set(px, 0.05, pz);
          spawnDust(_dustPos, runtime.running ? 0.42 : 0.3);
        }
      }
    } else {
      // Standing/airborne: prime the accumulator so the next step lands promptly.
      st.stepAccum = AUDIO.stepDistanceWalk * 0.6;
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
