"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { isTouchDevice } from "@/engine/input/touch";

/**
 * Blocks play on a touch device held in portrait.
 *
 * The camera framing (FEEL.cameraDistance/cameraShoulder, tuned against a
 * ~2.16:1 landscape frame), the HUD reflow and the whole MobileControls thumb
 * layout are all built and code-commented for a landscape phone — but nothing
 * anywhere ever told a player to turn theirs sideways, and most people open a
 * link in whatever orientation they were already holding the phone in
 * (usually portrait). Found in playtest (2026-08-16): a first-time mobile
 * visitor got a cramped HUD and an off camera with zero explanation why.
 *
 * Same shape as the guardian's gate (runtime.rotatePrompt folds into
 * `runtime.paused`, PlayerController.tsx) — auto-managed here, no dismiss
 * button: the fix IS the orientation change, so the overlay just watches for
 * it and gets out of the way the instant it happens.
 */
export function RotateDevicePrompt() {
  const roundState = useGame((s) => s.roundState);
  const [portrait, setPortrait] = useState(false);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(isTouchDevice());
    const measure = () => setPortrait(window.innerHeight > window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  // Only during actual play — the onboarding wizard and the opening map are
  // plain reflowing HTML, not camera-framing-dependent, so they don't need
  // this (see Onboarding.tsx's own width:min(760px,94vw) panel).
  const show = touch && portrait && roundState === "playing";

  useEffect(() => {
    runtime.rotatePrompt = show;
    return () => {
      runtime.rotatePrompt = false;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div style={styles.root}>
      <div style={styles.icon}>
        <div style={styles.phone} />
      </div>
      <div style={styles.title}>Turn your phone sideways</div>
      <div style={styles.sub}>FoxGlade plays best in landscape.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    // Above drei's own <Loader> (z-index 1000, Game.tsx) — a portrait player
    // should see this before the asset-load bar too, not only after it.
    zIndex: 1100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    background: "rgba(8,7,5,0.94)",
    pointerEvents: "auto",
    touchAction: "none",
    userSelect: "none",
  },
  icon: {
    width: 64,
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "fg-rotate-nudge 1.6s ease-in-out infinite",
  },
  phone: {
    width: 30,
    height: 50,
    borderRadius: 6,
    border: "2.5px solid #f2c14e",
    boxShadow: "0 0 18px rgba(242,193,78,0.25)",
  },
  title: {
    color: "#ffe6b0",
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: 0.3,
    fontFamily: "system-ui, sans-serif",
  },
  sub: {
    color: "rgba(232,238,242,0.6)",
    fontSize: 13.5,
    fontFamily: "system-ui, sans-serif",
  },
};

// Nudges the phone glyph from portrait toward landscape and back — the
// motion itself is the instruction, no arrow glyph or copy needed to explain
// it. Injected once; keyframes can't live in a plain style object.
if (typeof document !== "undefined" && !document.getElementById("fg-rotate-nudge-kf")) {
  const style = document.createElement("style");
  style.id = "fg-rotate-nudge-kf";
  style.textContent = `
    @keyframes fg-rotate-nudge {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-90deg); }
    }
  `;
  document.head.appendChild(style);
}
