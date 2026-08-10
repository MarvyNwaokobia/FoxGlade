"use client";

import { useEffect, useRef, useState } from "react";
import { touch } from "@/engine/input/touch";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { gameMode } from "@/engine/config/mode";

// Synthesize a key event so the PlayerController's existing keydown/keyup
// handlers drive discrete actions (crouch, sniff, claim, bomb, rest, restart).
function key(code: string, type: "keydown" | "keyup") {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

const JOY_R = 56; // joystick base radius (px)
/** Raw stick magnitude past which we run. Above 1 on purpose: 1.0 is the ring
 *  edge, so running means pushing meaningfully BEYOND it, not just reaching it. */
const RUN_AT = 1.45;
const LOOK_SENS = 0.0055; // rad per screen px
/** Fraction of the screen width that belongs to the move thumb. */
const STICK_ZONE = 0.44;

/**
 * On-screen touch controls, rendered only on touch devices.
 *
 * Two things about the first version made the game genuinely hard to play with
 * thumbs, and both are fixed here.
 *
 * **The stick was pinned to a fixed spot.** A 112 px circle at a fixed offset off
 * the bottom-left corner, which your thumb has to find without looking — and
 * miss it by 20 px and you swing the camera instead of walking. Every shipped
 * mobile shooter uses a floating stick: put your thumb down anywhere in the left
 * zone and the stick appears under it. That's what happens now; the ring is
 * drawn where you touched, not where the CSS said.
 *
 * **The look layer covered the whole screen and only honoured one finger.** So a
 * left thumb landing off-stick claimed the look pointer, and the right thumb —
 * the one actually trying to aim — was then ignored until the left one lifted.
 * Look is now the right zone only, and the two zones track independent pointers.
 */
export function MobileControls() {
  const isDead = useGame((s) => s.isDead);
  const roundState = useGame((s) => s.roundState);

  const eBtn = useRef<HTMLButtonElement>(null); // context label: GRAB / BANK / CLAIM
  const knob = useRef<HTMLDivElement>(null);
  const joyRing = useRef<HTMLDivElement>(null); // follows the thumb (floating stick)
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

  // The action button is fully contextual: GRAB a treasure, BANK it at the vault,
  // SHOP at the stall, REST in a safe house, else nothing. Folding rest into it
  // removes a dedicated button — on a phone you get about four comfortable thumb
  // targets, and every one spent on a rarely-valid verb is one you can't spare.
  // `actionKey` tracks which key the tap should send.
  /** Phone on its side: only ~393pt of height, so the action cluster goes into a
   *  single row along the bottom instead of a stack that reaches up into the
   *  clock and the minimap. */
  const [shortScreen, setShortScreen] = useState(false);
  useEffect(() => {
    const measure = () => setShortScreen(window.innerHeight < 460);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const actionKey = useRef("KeyE");
  /** Which key the in-flight press is holding down (so the release matches it,
   *  even if the context changed mid-press). */
  const heldAction = useRef<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const btn = eBtn.current;
      if (btn) {
        const g = useGame.getState();
        const idx = runtime.nearHintIndex;
        const canGrab = runtime.nearHintIsReal && idx >= 0 && !runtime.hintClaimed[idx];
        const canBank = runtime.nearBank && g.villeCarrying > 0;
        const canShop = runtime.nearMarket;
        const canRest =
          runtime.sheltered && g.restoresLeft > 0 && g.playerHealth < g.maxPlayerHealth * 0.7;
        // VAULT ranks below the economy verbs but above resting: if you're stood
        // on the bank pad you want BANK, but out in the street with a crate in
        // front of you the only thing this button could usefully be is the hurdle.
        const canVault = runtime.canVault && !runtime.sheltered;
        // ROLL sits at the bottom of the priority list but above the dead "—":
        // out in the open, moving, with nothing to interact with, the useful
        // thing this button can be is the dodge. Same Space binding as VAULT —
        // the controller already picks between them by context.
        const canRoll = runtime.playerMoving && !runtime.sheltered && !runtime.crouching;
        const label = canBank
          ? "BANK"
          : canGrab
            ? "GRAB"
            : canShop
              ? "SHOP"
              : canVault
                ? "VAULT"
                : canRest
                  ? "REST"
                  : runtime.resting
                    ? "STAND"
                    : canRoll
                      ? "ROLL"
                      : "—";
        btn.textContent = label;
        actionKey.current =
          canBank || canGrab || canShop ? "KeyE" : canVault || (canRoll && !canRest) ? "Space" : "KeyX";
        const hot = canBank || canGrab || canShop || canVault || canRest || runtime.resting || canRoll;
        btn.style.borderColor = hot ? "rgba(242,193,78,0.95)" : "rgba(255,255,255,0.35)";
        btn.style.background = hot ? "rgba(242,193,78,0.42)" : "rgba(20,20,24,0.42)";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Left thumb: a FLOATING stick ──
  // The ring is positioned where the thumb lands, so there is nothing to find.
  const onJoyDown = (e: React.PointerEvent) => {
    if (joyId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyId.current = e.pointerId;
    joyCenter.current = { x: e.clientX, y: e.clientY };
    const ring = joyRing.current;
    if (ring) {
      ring.style.left = `${e.clientX - JOY_R}px`;
      ring.style.top = `${e.clientY - JOY_R}px`;
      ring.style.opacity = "1";
    }
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
    // Fade the ring out rather than leaving a dot where your thumb used to be.
    if (joyRing.current) joyRing.current.style.opacity = "0";
  };
  function moveJoy(px: number, py: number) {
    let dx = (px - joyCenter.current.x) / JOY_R;
    let dy = (py - joyCenter.current.y) / JOY_R;
    const m = Math.hypot(dx, dy);
    // Keep the RAW magnitude before clamping — that's what tells run from walk.
    // The old test was `min(m,1) >= 0.9`, and m hits 1 the moment your thumb
    // reaches the ring edge, which is where it sits during any normal drag. So
    // mobile was effectively always sprinting. Running now needs a deliberate
    // push PAST the ring, which is a gesture you can't make by accident.
    const raw = m;
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    touch.moveX = dx; // right +
    touch.moveY = -dy; // up = forward +
    touch.run = raw >= RUN_AT;
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

  /** A press-and-HOLD button that mirrors a keyboard key's down/up (aim, bomb). */
  const holdKey = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      key(code, "keydown");
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      key(code, "keyup");
    },
    onPointerCancel: () => key(code, "keyup"),
  });

  // Bomb: hold to aim, release to throw (matches desktop G).
  const bomb = holdKey("KeyG");

  return (
    <div style={styles.root}>
      {/* LEFT zone — move. A thumb down anywhere in here raises the stick. */}
      <div
        style={styles.stickZone}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      />
      {/* RIGHT zone — look. Separate element and separate pointer, so the two
          thumbs never contend for each other's finger. */}
      <div
        style={styles.lookZone}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* The floating stick itself — drawn wherever the thumb went down. */}
      <div ref={joyRing} style={styles.joyRing}>
        <div ref={knob} style={styles.joyKnob} />
      </div>

      {/* Right action cluster. FIRE sits proud of the rest; the verbs are one
          row beneath it. This used to be three stacked rows that reached far
          enough up and left to sit on top of the ammo counter, the health bar
          and whatever toast was showing — see `styles.right` for the budget. */}
      <div
        style={{
          ...styles.right,
          flexDirection: shortScreen ? "row" : "column",
          alignItems: shortScreen ? "flex-end" : "flex-end",
          bottom: shortScreen
            ? "calc(env(safe-area-inset-bottom, 0px) + 74px)"
            : "calc(env(safe-area-inset-bottom, 0px) + 92px)",
        }}
      >
        {shortScreen ? (
          <>
            {/* Hold to aim, like the desktop right-mouse. */}
            <button style={styles.btn} {...holdKey("KeyV")}>
              AIM
            </button>
            <button style={styles.btn} {...bomb}>
              BOMB
            </button>
            <button style={{ ...styles.btn, ...styles.fire }} {...hold((v) => (touch.fire = v))}>
              FIRE
            </button>
          </>
        ) : (
          <>
            <button style={{ ...styles.btn, ...styles.fire }} {...hold((v) => (touch.fire = v))}>
              FIRE
            </button>
            <div style={styles.row}>
              <button style={styles.btn} {...holdKey("KeyV")}>
                AIM
              </button>
              <button style={styles.btn} {...bomb}>
                BOMB
              </button>
            </div>
          </>
        )}
      </div>

      {/* Left verb cluster, above the stick zone and clear of the HUD strip.
          JUMP is gone as a button: the arena is flat with nothing to platform
          over, and its one real use — hurdling cover — is now folded into the
          contextual action so it costs no thumb space. */}
      <div
        style={{
          ...styles.left,
          // Portrait is only ~393pt wide: a row of three here and a cluster of
          // three on the right add up to more than the screen, and they met in
          // the middle. Stacked, the left verbs occupy one button's width.
          flexDirection: shortScreen ? "row" : "column-reverse",
          bottom: shortScreen
            ? "calc(env(safe-area-inset-bottom, 0px) + 74px)"
            : "calc(env(safe-area-inset-bottom, 0px) + 92px)",
        }}
      >
        {/* Nighthaul has no companion, so the button would command nothing. */}
        {gameMode().fox && (
          <button style={styles.btnSm} {...tap("KeyQ")}>
            FOX
          </button>
        )}
        {/* A real press-and-release, not a tap: VAULT rides on Space, and a
            keydown/keyup fired in the same microsecond is gone before the next
            frame ever samples it. */}
        <button
          ref={eBtn}
          style={styles.btnSm}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            heldAction.current = actionKey.current;
            key(heldAction.current, "keydown");
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (heldAction.current) key(heldAction.current, "keyup");
            heldAction.current = null;
          }}
          onPointerCancel={() => {
            if (heldAction.current) key(heldAction.current, "keyup");
            heldAction.current = null;
          }}
        >
          —
        </button>
        <button style={styles.btnSm} {...tap("KeyC")}>
          CROUCH
        </button>
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
  // The two thumb zones. They tile the screen with no overlap, so a finger
  // belongs to exactly one of them and the other thumb is never locked out.
  stickZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: `${STICK_ZONE * 100}%`,
    pointerEvents: "auto",
    touchAction: "none",
  },
  lookZone: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: `${(1 - STICK_ZONE) * 100}%`,
    pointerEvents: "auto",
    touchAction: "none",
  },
  // Positioned in JS wherever the thumb lands; hidden until then.
  joyRing: {
    position: "absolute",
    left: 0,
    top: 0,
    width: JOY_R * 2,
    height: JOY_R * 2,
    borderRadius: 999,
    background: "rgba(20,20,24,0.28)",
    border: "1.5px solid rgba(255,255,255,0.28)",
    pointerEvents: "none",
    opacity: 0,
    transition: "opacity 0.14s ease-out",
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
  // The HUD strip (ammo, health, status) owns the bottom ~86px of the screen.
  // Both clusters clear it — the buttons used to sit right on top of the ammo
  // counter and the health bar, and on a 393pt phone nothing was legible.
  right: {
    position: "absolute",
    right: "calc(env(safe-area-inset-right, 0px) + 18px)",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
  },
  left: {
    position: "absolute",
    left: "calc(env(safe-area-inset-left, 0px) + 16px)",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
    display: "flex",
    gap: 8,
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
