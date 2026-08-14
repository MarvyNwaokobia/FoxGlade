"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { isTouchDevice } from "@/engine/input/touch";

/**
 * What an NPC is saying, anchored over its head.
 *
 * Every bubble in the game used drei's `distanceFactor`, which scales the div by
 * `factor / distance` with no ceiling. NPCs walk right up to you, so at a metre
 * and a half a 300px bubble renders about 2000px wide — in play it covered the
 * top third of the screen on desktop and nearly half of it on a phone, with the
 * text running off both edges. It was the worst-looking moment in the build and
 * it happened constantly.
 *
 * The rule here is simply that a bubble is **never bigger than its authored
 * size**. It sits at 1× from touching distance out to READ_DIST, shrinks from
 * there, bottoms out at MIN_SCALE so a far voice is still a legible murmur, and
 * fades away entirely past FADE_END rather than littering the skyline. The width
 * is clamped against the viewport too, so a long line wraps on a phone instead
 * of overflowing it.
 */

/** Out to here the bubble renders at full size. */
const READ_DIST = 6;
/** Never shrink below this fraction — a distant line should still be readable. */
const MIN_SCALE = 0.45;
/** Start fading out here… */
const FADE_START = 26;
/** …and be gone by here. */
const FADE_END = 34;

export type BubbleTone = "villager" | "guardian" | "merchant";

const TONES: Record<BubbleTone, React.CSSProperties> = {
  // A voice you can't place — deliberately NOT colour-coded by truthfulness,
  // because working that out is the game.
  villager: {
    background: "rgba(38,34,52,0.94)",
    color: "#f3ecdd",
    border: "1px solid rgba(255,255,255,0.28)",
  },
  // Gold-edged and unmistakable: you must know whose voice you're hearing.
  guardian: {
    background: "rgba(28,24,16,0.95)",
    color: "#ffe6b0",
    border: "1px solid rgba(242,193,78,0.85)",
    boxShadow: "0 0 18px rgba(242,193,78,0.25)",
  },
  merchant: {
    background: "rgba(46,36,24,0.94)",
    color: "#f5e6c8",
    border: "1px solid rgba(242,193,78,0.5)",
  },
};

const base: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.45,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  textAlign: "center",
  // Wrap, don't overflow. `nowrap` is what let a long line run off a phone even
  // once the scale was under control.
  width: "max-content",
  maxWidth: "min(300px, 76vw)",
  whiteSpace: "normal",
};

const _world = new THREE.Vector3();

export function SpeechBubble({
  text,
  y,
  tone = "villager",
}: {
  text: string;
  /** Height above the NPC's feet to hang the bubble at. */
  y: number;
  tone?: BubbleTone;
}) {
  const anchor = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera);
  // On touch, the bottom edge of the screen is the FIRE/action/AIM thumb row
  // (MobileControls.tsx) — clamping a bubble to within 8px of it, same as
  // desktop, pulls dialogue down behind the buttons the player is holding.
  const bottomMargin = useMemo(() => (isTouchDevice() ? 130 : 8), []);

  useFrame(() => {
    const el = box.current;
    if (!el || !anchor.current) return;
    // Nobody talks over a full-screen overlay. drei's Html portals into the
    // canvas's container and sits above the R3F layer, so a villager mid-line
    // when you opened the market printed his bubble across the shop panel.
    if (
      useGame.getState().shopOpen ||
      useGame.getState().menuOpen ||
      useGame.getState().profileOpen ||
      useGame.getState().bankOpen ||
      runtime.mapOpen
    ) {
      el.style.opacity = "0";
      return;
    }

    anchor.current.getWorldPosition(_world);
    const d = _world.distanceTo(camera.position);
    // Shrink with distance but NEVER magnify — 1× is the ceiling, always.
    const scale = Math.max(MIN_SCALE, Math.min(1, READ_DIST / Math.max(d, 0.001)));
    const fade = 1 - THREE.MathUtils.clamp((d - FADE_START) / (FADE_END - FADE_START), 0, 1);

    // Nudge back on-screen. An NPC standing near the edge of the frame anchors
    // its bubble half off it — half a sentence, cut down the middle. A speaker
    // at the edge of view should still be readable; the bubble slides in and
    // keeps pointing at them. This is anchored above the NPC's HEAD in world
    // space, so a tall speaker (the guardian) or a close/low camera routinely
    // projects that point above the top of the viewport entirely — you'd have
    // to tilt the camera up to ever see the line. Vertical clamp matches the
    // horizontal one already here for the same reason.
    let shiftX = 0;
    let shiftY = 0;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      const margin = 8;
      if (rect.left < margin) shiftX = margin - rect.left;
      else if (rect.right > window.innerWidth - margin) shiftX = window.innerWidth - margin - rect.right;
      if (rect.top < margin) shiftY = margin - rect.top;
      else if (rect.bottom > window.innerHeight - bottomMargin) shiftY = window.innerHeight - bottomMargin - rect.bottom;
    }

    el.style.transform = `translate(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    el.style.opacity = fade.toFixed(2);
  });

  return (
    <group ref={anchor} position={[0, y, 0]}>
      {/* No distanceFactor: the scaling above is ours, and it is bounded. */}
      <Html center occlude style={{ pointerEvents: "none" }}>
        <div ref={box} style={{ transformOrigin: "center bottom", willChange: "transform" }}>
          <div style={{ ...base, ...TONES[tone] }}>{text}</div>
        </div>
      </Html>
    </group>
  );
}
