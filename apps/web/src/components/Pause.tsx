"use client";

import { useEffect, useState } from "react";
import { useGame, anyOverlayOpen } from "@/engine/store";
import { audio } from "@/engine/audio/audio";

const GOLD = "#f2c14e";
const INK = "#e8eef2";

/**
 * A real pause, reachable from anywhere in the world — not the old "walk
 * indoors and wait it out" trick (store.ts's damagePlayer comment on why
 * shelter alone was deliberately made NOT to freeze anything). `pauseOpen`
 * is just one more member of `anyOverlayOpen`, so it gets everything every
 * other overlay already gets for free: NPCs/projectiles/the day clock freeze
 * (PlayerController.tsx reads `runtime.paused` from this), and pointer lock
 * releases and reacquires on its own.
 */
export function Pause() {
  const roundState = useGame((s) => s.roundState);
  const pauseOpen = useGame((s) => s.pauseOpen);
  const openPause = useGame((s) => s.openPause);
  const closePause = useGame((s) => s.closePause);
  const openMenu = useGame((s) => s.openMenu);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (pauseOpen && document.pointerLockElement) document.exitPointerLock();
    if (!pauseOpen) setConfirmQuit(false);
  }, [pauseOpen]);

  // Sound toggle: reflect the persisted mute state and stay in sync with it
  // (M on desktop, or a mute button elsewhere, can flip it while this is
  // closed) — same subscription Hud.tsx uses for its own speaker icon.
  useEffect(() => {
    setMuted(audio.muted);
    const off = audio.onMuteChange(setMuted);
    return () => {
      off();
    };
  }, []);

  // Escape both opens and closes pause, the usual game convention. Capture
  // phase (not bubble) is what makes this order-safe: every other overlay's
  // own Escape handler is a bubble-phase `window` listener, so this one
  // — registered with `true` — always sees pre-keypress state, never a
  // sibling overlay's just-applied close. Without that, Escape-closing e.g.
  // the bank could read the map/tutorial as pause opening in the same tick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      const gs = useGame.getState();
      if (gs.pauseOpen) {
        e.preventDefault();
        closePause();
      } else if (gs.roundState === "playing" && !gs.isDead && !anyOverlayOpen(gs)) {
        e.preventDefault();
        openPause();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closePause, openPause]);

  if (roundState !== "playing") return null;

  return (
    <>
      <button className="fg-btn fg-icon-btn" style={styles.trigger} onClick={openPause} aria-label="Pause">
        ⏸
      </button>
      {pauseOpen && (
        <div style={styles.root} onClick={closePause}>
          <div className="fg-scroll" style={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.title}>PAUSED</div>
            <div style={styles.sub}>The village is holding still. Take your time.</div>
            <div style={styles.list}>
              <button className="fg-btn fg-btn-primary" style={styles.primary} onClick={closePause}>
                Resume
              </button>
              <button
                className="fg-btn fg-menu-item"
                style={styles.item}
                onClick={() => {
                  audio.unlock();
                  audio.toggleMute();
                }}
              >
                {muted ? "🔇 Sound: Off" : "🔊 Sound: On"}
              </button>
              <button
                className="fg-btn fg-menu-item"
                style={styles.item}
                onClick={() => {
                  closePause();
                  openMenu();
                }}
              >
                Menu
              </button>
              {!confirmQuit ? (
                <button className="fg-btn fg-btn-quit" style={styles.itemQuit} onClick={() => setConfirmQuit(true)}>
                  Quit
                </button>
              ) : (
                <div style={styles.confirmBox}>
                  <div style={styles.confirmText}>
                    Banked progress saves on its own. Anything you're carrying right now doesn't — leave anyway?
                  </div>
                  <div style={styles.confirmRow}>
                    <button className="fg-btn fg-menu-item" style={styles.item} onClick={() => setConfirmQuit(false)}>
                      Cancel
                    </button>
                    <button
                      className="fg-btn fg-btn-quit"
                      style={styles.itemQuit}
                      onClick={() => window.location.reload()}
                    >
                      Leave
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    left: "calc(env(safe-area-inset-left, 0px) + 62px)",
    // See the identical comment on HamburgerMenu.tsx's trigger — same fix,
    // same cause: MobileControls' stickZone (zIndex 40) sat above this
    // button's old zIndex 30 and silently ate every tap meant for it.
    zIndex: 45,
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "rgba(20,16,12,0.72)",
    border: "1px solid rgba(242,193,78,0.35)",
    color: GOLD,
    fontSize: 16,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
  },
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 65,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(6,7,9,0.68)",
    backdropFilter: "blur(4px)",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  panel: {
    width: "min(340px, 92vw)",
    maxHeight: "86vh",
    overflowY: "auto",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    padding: "24px 22px",
    textAlign: "center",
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 22, letterSpacing: 3 },
  sub: { color: "rgba(232,238,242,0.55)", fontSize: 12.5, marginTop: 6, marginBottom: 18 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  primary: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 10,
    padding: "13px 16px",
    fontSize: 14.5,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  item: {
    color: INK,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    flex: 1,
  },
  itemQuit: {
    color: "#f5a3a3",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,120,120,0.25)",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    flex: 1,
  },
  confirmBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "10px 2px 0",
  },
  confirmText: { color: "rgba(232,238,242,0.7)", fontSize: 12.5, lineHeight: 1.55 },
  confirmRow: { display: "flex", gap: 8 },
};
