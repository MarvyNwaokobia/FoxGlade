"use client";

import { useEffect, useRef } from "react";
import { touch } from "@/engine/input/touch";
import { useGame } from "@/engine/store";

// Synthesize a key event so the PlayerController's existing keydown/keyup
// handlers drive discrete actions (crouch, sniff, claim, bomb, rest, restart).
function key(code: string, type: "keydown" | "keyup") {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

const JOY_R = 56; // joystick base radius (px)
const RUN_AT = 0.72; // stick magnitude past which we run
const LOOK_SENS = 0.0055; // rad per screen px

/**
 * On-screen touch controls, rendered only on touch devices. Left thumb = move
 * stick; anywhere on the right = drag to look; buttons for fire/jump/crouch and
 * the game verbs. Writes analog state into the `touch` singleton and fires
 * synthetic key events for one-shot actions.
 */
export function MobileControls() {
  const isDead = useGame((s) => s.isDead);
  const roundState = useGame((s) => s.roundState);

  const knob = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyCenter = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    touch.enabled = true;
    return () => {
      touch.enabled = false;
      touch.moveX = touch.moveY = touch.lookDX = touch.lookDY = 0;
      touch.run = touch.fire = touch.jump = false;
    };
  }, []);

  // ── Left stick ──
  const onJoyDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    joyId.current = e.pointerId;
    const r = e.currentTarget.getBoundingClientRect();
    joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return;
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyUp = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return;
    joyId.current = null;
    touch.moveX = touch.moveY = 0;
    touch.run = false;
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
  };
  function moveJoy(px: number, py: number) {
    let dx = (px - joyCenter.current.x) / JOY_R;
    let dy = (py - joyCenter.current.y) / JOY_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    touch.moveX = dx; // right +
    touch.moveY = -dy; // up = forward +
    touch.run = Math.min(m, 1) >= RUN_AT;
    if (knob.current) knob.current.style.transform = `translate(${dx * JOY_R}px, ${dy * JOY_R}px)`;
  }

  // ── Look drag (empty screen) ──
  const onLookDown = (e: React.PointerEvent) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookId.current) return;
    touch.lookDX += (e.clientX - lookLast.current.x) * LOOK_SENS;
    touch.lookDY += (e.clientY - lookLast.current.y) * LOOK_SENS;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const onLookUp = (e: React.PointerEvent) => {
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  const hold = (set: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      set(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      set(false);
    },
    onPointerCancel: () => set(false),
  });

  const tap = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      key(code, "keydown");
      key(code, "keyup");
    },
  });

  // Bomb: hold to aim, release to throw (matches desktop G).
  const bomb = {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      key("KeyG", "keydown");
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      key("KeyG", "keyup");
    },
    onPointerCancel: () => key("KeyG", "keyup"),
  };

  return (
    <div style={styles.root}>
      {/* Full-screen look layer (behind the controls) */}
      <div
        style={styles.look}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* Left move stick */}
      <div
        style={styles.joyBase}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      >
        <div ref={knob} style={styles.joyKnob} />
      </div>

      {/* Right action cluster */}
      <div style={styles.right}>
        <button style={{ ...styles.btn, ...styles.fire }} {...hold((v) => (touch.fire = v))}>
          FIRE
        </button>
        <div style={styles.row}>
          <button style={styles.btn} {...hold((v) => (touch.jump = v))}>
            JUMP
          </button>
          <button style={styles.btn} {...tap("KeyC")}>
            CROUCH
          </button>
        </div>
        <div style={styles.row}>
          <button style={styles.btnSm} {...tap("KeyQ")}>
            SNIFF
          </button>
          <button style={styles.btnSm} {...tap("KeyE")}>
            CLAIM
          </button>
          <button style={styles.btnSm} {...bomb}>
            BOMB
          </button>
          <button style={styles.btnSm} {...tap("KeyX")}>
            REST
          </button>
        </div>
      </div>

      {/* Contextual respawn / restart */}
      {isDead && (
        <button style={{ ...styles.center, background: "#b23b3b" }} {...tap("KeyR")}>
          RESPAWN
        </button>
      )}
      {!isDead && roundState !== "playing" && (
        <button style={{ ...styles.center, background: "#2e7d46" }} {...tap("Enter")}>
          PLAY AGAIN
        </button>
      )}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  pointerEvents: "auto",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  color: "#fff",
  fontFamily: "system-ui, sans-serif",
  fontWeight: 700,
  letterSpacing: 1,
  border: "1.5px solid rgba(255,255,255,0.35)",
  background: "rgba(20,20,24,0.42)",
  backdropFilter: "blur(2px)",
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    pointerEvents: "none",
    touchAction: "none",
  },
  look: { position: "absolute", inset: 0, pointerEvents: "auto", touchAction: "none" },
  joyBase: {
    position: "absolute",
    left: "calc(env(safe-area-inset-left, 0px) + 26px)",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
    width: JOY_R * 2,
    height: JOY_R * 2,
    borderRadius: 999,
    background: "rgba(20,20,24,0.3)",
    border: "1.5px solid rgba(255,255,255,0.3)",
    pointerEvents: "auto",
    touchAction: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  joyKnob: {
    width: JOY_R,
    height: JOY_R,
    borderRadius: 999,
    background: "rgba(242,193,78,0.75)",
    border: "1.5px solid rgba(255,255,255,0.5)",
    pointerEvents: "none",
  },
  right: {
    position: "absolute",
    right: "calc(env(safe-area-inset-right, 0px) + 22px)",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 12,
  },
  row: { display: "flex", gap: 10 },
  fire: {
    width: 92,
    height: 92,
    fontSize: 16,
    background: "rgba(178,59,59,0.5)",
    alignSelf: "center",
  },
  btn: { ...btnBase, width: 78, height: 58, fontSize: 13 },
  btnSm: { ...btnBase, width: 62, height: 46, fontSize: 11 },
  center: {
    ...btnBase,
    position: "absolute",
    left: "50%",
    top: "58%",
    transform: "translate(-50%,-50%)",
    width: 180,
    height: 64,
    fontSize: 18,
  },
};
