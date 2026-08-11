"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { isTouchDevice } from "@/engine/input/touch";

/**
 * First-run teaching, delivered IN CONTEXT.
 *
 * The map screen covers the geography; this covers the verbs — but only at the
 * moment each one first becomes relevant. A wall of instructions before you play
 * is forgotten by the time it matters; "this is the vault, press E" while you're
 * standing on the vault with loot in your bag is not.
 *
 * Each beat fires once, ever, and is remembered in localStorage — so it's a
 * first-RUN experience rather than something that nags on every restart. There
 * is deliberately no beat for "where the treasure is": that's the guardian's job,
 * and it has to be remembered rather than displayed.
 */
const SEEN_KEY = "foxglade.taught";
const SHOW_MS = 5200;

interface Beat {
  id: string;
  /** Is this the moment to say it? */
  when: () => boolean;
  text: (touch: boolean) => string;
}

const BEATS: Beat[] = [
  {
    id: "fox",
    // Once the fox is off cooldown and there's a treasure to look for.
    when: () => performance.now() > runtime.foxReadyAt && runtime.foxState === "heel",
    // This used to promise the fox "cannot lie", which is the one thing it must
    // not say. A Kit misreads 45% of the time (FOX table, misreadChance), the
    // HUD two lines up already reads "still a pup — check its work", and the
    // guardian's briefing was reworded away from the same promise for the same
    // reason. Teaching a first-time player to trust a coin-flip — on the one
    // occasion they are guaranteed to be reading — poisons the whole deduction
    // layer: they follow the pup, dig at nothing, and conclude the game lied.
    text: (t) =>
      t
        ? "Lost? Tap FOX — it runs to the treasure. It means well, but a pup can be wrong."
        : "Lost? Press Q — your fox runs to the treasure. It means well, but a pup can be wrong.",
  },
  {
    id: "claim",
    when: () => runtime.nearHintIsReal && runtime.nearHintIndex >= 0,
    text: (t) => (t ? "Treasure. Tap GRAB to take it." : "Treasure. Press E to take it."),
  },
  {
    id: "carry",
    when: () => useGame.getState().villeCarrying > 0,
    text: () => "You're carrying it. Get it to the vault — go down out here and you drop it.",
  },
  {
    id: "vault",
    when: () => runtime.nearBank && useGame.getState().villeCarrying > 0,
    text: (t) =>
      t ? "The vault. Tap BANK to secure it — and push the day on." : "The vault. Press E to bank it — and push the day on.",
  },
  {
    id: "market",
    when: () => runtime.nearMarket,
    text: (t) => (t ? "The market. Tap SHOP to trade banked VILLE for gear." : "The market. Press E to trade banked VILLE for gear."),
  },
  {
    id: "shelter",
    when: () => runtime.sheltered,
    text: (t) =>
      t
        ? "Walls break their sight — they don't stop time, and they will follow. Tap REST to patch up."
        : "Walls break their sight — they don't stop time, and they will follow. Press X to patch up.",
  },
  {
    id: "reload",
    when: () => useGame.getState().ammoInMag === 0,
    text: (t) => (t ? "Out. It reloads itself — keep moving while it does." : "Out. Press R to reload (it also reloads itself)."),
  },
  {
    id: "liars",
    when: () => runtime.guardianBriefed && useGame.getState().chapter >= 2,
    text: () => "From here, not everyone tells the truth. Remember what the guardian said.",
  },
];

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function Tutorial() {
  const seen = useRef<Set<string>>(new Set());
  const shownAt = useRef(0);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    seen.current = loadSeen();
    const touch = isTouchDevice();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      // One at a time, and never while a beat is still on screen.
      if (now - shownAt.current < SHOW_MS) return;
      if (text) setText(null);
      const gs = useGame.getState();
      if (gs.roundState !== "playing" || gs.isDead || gs.shopOpen || !runtime.playerReady) return;

      for (const b of BEATS) {
        if (seen.current.has(b.id)) continue;
        let fires = false;
        try {
          fires = b.when();
        } catch {
          fires = false;
        }
        if (!fires) continue;
        seen.current.add(b.id);
        try {
          window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current]));
        } catch {
          /* ignore */
        }
        shownAt.current = now;
        setText(b.text(touch));
        break;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!text) return null;
  // On touch, the bottom third of the screen is thumbs. A teaching line sitting
  // at 132px landed underneath the FIRE button and behind the verb clusters —
  // the one message the player most needs to read, printed on the controls.
  return (
    <div style={{ ...style, bottom: isTouchDevice() ? 208 : 132 }}>{text}</div>
  );
}

const style: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "9px 18px",
  borderRadius: 10,
  background: "rgba(18,22,28,0.88)",
  border: "1px solid rgba(143,208,224,0.55)",
  color: "#dff0f6",
  fontSize: 14,
  letterSpacing: 0.3,
  // Wrap instead of ellipsing: a truncated instruction is no instruction.
  maxWidth: "min(520px, 88vw)",
  textAlign: "center",
  lineHeight: 1.45,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  pointerEvents: "none",
  userSelect: "none",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
};
