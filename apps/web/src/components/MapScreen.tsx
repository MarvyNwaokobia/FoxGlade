"use client";

import { useEffect, useRef, useState } from "react";
import { isTouchDevice } from "@/engine/input/touch";
import { useGame } from "@/engine/store";
import { drawParchmentMap } from "./mapArt";

/**
 * The village map, as a physical object you unfold.
 *
 * The first pass was a dark UI card with grey rectangles — right information,
 * wrong object entirely, and it simply appeared. You're a person in a walled
 * medieval town: you should be looking at a piece of paper someone drew, and it
 * should OPEN.
 *
 * So the sheet is inked parchment (see mapArt.ts) and it unfolds in two motions,
 * the way a carried map actually does — the right half sweeps open across the
 * vertical crease, then the bottom half drops open across the horizontal one.
 * The creases are drawn into the paper where it's been worn pale from folding,
 * so the animation and the artwork agree with each other.
 *
 * One deliberate omission stays: no treasure is marked. A map that tells you
 * where the prize is deletes the hunt. This teaches the PLACE — where the gate,
 * the vault, the market and the safe houses are. Where the treasure is comes
 * from the guardian (remembered) and the fox (trusted).
 */
const SIZE = 470;

export function MapScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Lives in the store (not local state) so the hamburger menu's "Map" entry
  // can open it too, same as Tab already does — see store.ts mapScreenOpen.
  const open = useGame((s) => s.mapScreenOpen);
  const openMapScreen = useGame((s) => s.openMapScreen);
  const closeMapScreen = useGame((s) => s.closeMapScreen);
  const [closing, setClosing] = useState(false);
  /** Short-and-wide viewport (a phone on its side) — the layout goes two-column. */
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const measure = () => setLandscape(window.innerHeight < 560 && window.innerWidth > window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  // Every new GAME opens with the map. A new DAY does not.
  //
  // It was gated on a localStorage "seen it" flag once, which lost the opening
  // beat entirely after one session, so it was moved onto the round nonce. That
  // was right when a round was a session and wrong the moment days started
  // following one another: sleeping bumps the same nonce, so waking in your own
  // bed put a full-screen map of a village you live in between you and your own
  // front door, every single morning. `newGameNonce` moves only when a game
  // actually begins. Tab still opens it whenever you want it.
  const newGameNonce = useGame((s) => s.newGameNonce);
  useEffect(() => {
    setClosing(false);
    openMapScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newGameNonce]);

  // Keyboard closes are instant — no fold animation, `closing` stays false.
  // Only a pointer dismissal (click the backdrop / "Enter the village") plays
  // the fold-out via `dismiss()` below; that distinction is original to this
  // component and stays true after moving `open` into the store.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        if (useGame.getState().mapScreenOpen) closeMapScreen();
        else openMapScreen();
      } else if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") {
        closeMapScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Holding the village paused while the map is up — otherwise villagers walk
  // over and deliver lines behind the paper, and you dismiss it into a world
  // that has already moved on without you — now happens because `mapScreenOpen`
  // itself lives in the store; PlayerController/SpeechBubble read it via
  // `anyOverlayOpen` (store.ts), no separate runtime mirror needed.

  // A pointer dismissal leaves `closing` true after the fold plays out and the
  // sheet unmounts (see `dismiss` below). If the map is opened again later —
  // Tab, the hamburger menu, a new day — that stale flag would apply the
  // FOLD-CLOSE animation to the freshly mounted sheet instead of the unfold,
  // rendering it invisible on arrival. Clear it the instant the map opens.
  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cvs = canvas.current;
    if (!cvs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = SIZE * dpr;
    cvs.height = SIZE * dpr;
    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);
    drawParchmentMap(ctx, SIZE);
  }, [open]);

  const dismiss = () => {
    // Let it fold away before it goes, rather than blinking out.
    setClosing(true);
    window.setTimeout(() => closeMapScreen(), 340);
  };

  if (!open) return null;
  const touch = isTouchDevice();

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={styles.backdrop} onPointerDown={dismiss}>
        <div
          style={{
            ...styles.stage,
            // Landscape phone: the sheet goes BESIDE the words instead of above
            // them. Stacked, a square map plus four lines of caption plus the
            // button needs ~700px of height, and a phone on its side has 393 —
            // so "Enter the village" sat below the fold, unreachable, and the
            // game could not be started in the one orientation it should be
            // played in.
            flexDirection: landscape ? "row" : "column",
            gap: landscape ? 22 : 0,
            maxWidth: landscape ? 900 : 560,
            animation: closing ? "fg-fold 0.34s ease-in forwards" : undefined,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={styles.sheet}>
            <canvas ref={canvas} style={styles.paper} />
            {/* Soft shading along the creases, so the fold reads as a physical
                bend in paper rather than a rectangle sliding open. */}
            <div style={styles.creaseV} />
            <div style={styles.creaseH} />
          </div>

          <div
            style={{
              ...styles.caption,
              marginTop: landscape ? 0 : 18,
              textAlign: landscape ? "left" : "center",
              flex: landscape ? "1 1 0" : undefined,
              minWidth: 0,
            }}
          >
            <div style={{ ...styles.title, fontSize: landscape ? 24 : 30 }}>The Village</div>
            <div style={styles.sub}>
              Find treasure, carry it to the vault, spend at the market. Night ends the day.
            </div>
            <div style={styles.note}>
              The treasure is not marked here. A guardian will tell you where it lies,{" "}
              <b>once</b>. Others will tell you different, and some of them lie. Send your
              fox and follow it, though a young one can be wrong.
            </div>
            <div style={styles.keys}>
              {touch ? (
                <>Left thumb to move · drag the right side to look · <b>FOX</b> sends your fox · the round button is your action</>
              ) : (
                <>
                  <b>WASD</b> move · <b>Mouse</b> look · <b>Left-click</b> shoot · <b>Right-click</b> aim ·{" "}
                  <b>R</b> reload · <b>Q</b> send fox · <b>E</b> grab / bank / shop · <b>Space</b> vault · <b>Tab</b> map
                </>
              )}
            </div>
            <button type="button" style={styles.enter} onClick={dismiss}>
              Enter the village
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The unfold. `clip-path` reveals the sheet a panel at a time while the
 * transform swings it — right half first, then the bottom — which is the order
 * you'd actually open a folded map in. A slight over-rotation on each stage
 * gives the paper some weight as it drops.
 */
const KEYFRAMES = `
@keyframes fg-unfold {
  0%   { clip-path: inset(0 50% 50% 0); transform: perspective(1400px) rotateY(-52deg) rotateX(8deg) scale(0.94); }
  38%  { clip-path: inset(0 0 50% 0);   transform: perspective(1400px) rotateY(0deg)   rotateX(16deg) scale(0.97); }
  72%  { clip-path: inset(0 0 0 0);     transform: perspective(1400px) rotateY(0deg)   rotateX(-5deg) scale(1.01); }
  100% { clip-path: inset(0 0 0 0);     transform: perspective(1400px) rotateY(0deg)   rotateX(0deg)  scale(1); }
}
@keyframes fg-creaseV {
  0%, 30% { opacity: 0.85; }
  100%    { opacity: 0.18; }
}
@keyframes fg-creaseH {
  0%, 62% { opacity: 0.85; }
  100%    { opacity: 0.18; }
}
@keyframes fg-caption {
  0%, 55% { opacity: 0; transform: translateY(6px); }
  100%    { opacity: 1; transform: translateY(0); }
}
@keyframes fg-fold {
  0%   { clip-path: inset(0 0 0 0);     transform: perspective(1400px) rotateY(0deg) scale(1); opacity: 1; }
  100% { clip-path: inset(0 50% 50% 0); transform: perspective(1400px) rotateY(-45deg) scale(0.92); opacity: 0; }
}
@keyframes fg-fade { from { opacity: 0; } to { opacity: 1; } }
`;

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    // Warm, low light — a map read by candle, not a modal scrim.
    background:
      "radial-gradient(ellipse at 50% 42%, rgba(60,42,22,0.72) 0%, rgba(10,7,4,0.93) 70%)",
    display: "flex",
    padding: 16,
    // `margin: auto` on the stage centres it when it fits and lets it scroll when
    // it doesn't. `alignItems: center` cannot do both — it pins the overflow off
    // the top of the scroll box, which is unreachable.
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    animation: "fg-fade 0.25s ease-out",
  },
  stage: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "auto",
    width: "100%",
  },
  sheet: {
    position: "relative",
    // Bound by BOTH axes. The sheet is square, so on a short viewport it has to
    // be sized off the height or it pushes everything below it off screen.
    width: `min(${SIZE}px, 88vw, 62vh)`,
    flexShrink: 0,
    aspectRatio: "1 / 1",
    transformOrigin: "left top",
    animation: "fg-unfold 0.95s cubic-bezier(.22,.9,.24,1) both",
    // The paper sits above the table, slightly askew, as if just laid down.
    rotate: "-1.1deg",
    filter: "drop-shadow(0 24px 42px rgba(0,0,0,0.65))",
  },
  paper: { width: "100%", height: "100%", display: "block" },
  creaseV: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 16,
    marginLeft: -8,
    background:
      "linear-gradient(to right, rgba(60,40,18,0) 0%, rgba(60,40,18,0.28) 45%, rgba(255,246,225,0.35) 55%, rgba(60,40,18,0) 100%)",
    pointerEvents: "none",
    animation: "fg-creaseV 0.95s ease-out both",
  },
  creaseH: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 16,
    marginTop: -8,
    background:
      "linear-gradient(to bottom, rgba(60,40,18,0) 0%, rgba(60,40,18,0.28) 45%, rgba(255,246,225,0.35) 55%, rgba(60,40,18,0) 100%)",
    pointerEvents: "none",
    animation: "fg-creaseH 0.95s ease-out both",
  },
  caption: {
    marginTop: 18,
    textAlign: "center",
    color: "#e9d6ae",
    fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
    animation: "fg-caption 1.1s ease-out both",
    maxWidth: 520,
  },
  title: { fontSize: 30, fontWeight: 700, letterSpacing: 2, color: "#f5e3bd" },
  sub: { fontSize: 14, opacity: 0.75, marginTop: 3, fontStyle: "italic" },
  note: {
    marginTop: 12,
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "rgba(233,214,174,0.9)",
    borderTop: "1px solid rgba(214,168,74,0.28)",
    paddingTop: 10,
  },
  keys: {
    marginTop: 10,
    fontSize: 12,
    color: "rgba(233,214,174,0.55)",
    lineHeight: 1.7,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  enter: {
    marginTop: 16,
    padding: "10px 30px",
    borderRadius: 2,
    border: "1px solid rgba(214,168,74,0.75)",
    background: "linear-gradient(180deg, rgba(214,168,74,0.26), rgba(214,168,74,0.12))",
    color: "#ffe9bd",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1.2,
    fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
    cursor: "pointer",
  },
};
