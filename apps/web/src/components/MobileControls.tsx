"use client";

import { useEffect, useRef } from "react";
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
/** Where the stick lives — always, never wherever a thumb happens to land
 *  (see the MobileControls doc comment for why the earlier floating version
 *  got replaced). `bottom:0` lines its base up with FIRE's own bottom edge
 *  (Marvy's call, 2026-08-17) — both thumbs rest on the same line now. */
const JOY_HOME = { left: 30, bottom: 0 };

/**
 * Place a round control at a fixed offset from a bottom corner.
 *
 * This replaced a geometric arc. Putting every button on one radius sounds fair
 * — equal reach for all of them — and in practice means nothing is where the
 * thumb already is. A shooter's pad is not a curve: one large primary under the
 * thumb in the corner, the verbs you press mid-fight in a row beside it, and the
 * occasional ones stacked up the edge, reachable but never underfoot.
 *
 * Offsets run from the screen edge to the button's own edge, not to its centre,
 * so a row of different-sized buttons still lines up along the bottom — which is
 * what the eye reads as "these belong together".
 */
function at(side: "left" | "right", x: number, y: number, size: number): React.CSSProperties {
  return {
    position: "absolute",
    [side]: `calc(env(safe-area-inset-${side}, 0px) + ${x}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${y}px)`,
    width: size,
    height: size,
  };
}
/**
 * On-screen touch controls, rendered only on touch devices.
 *
 * **The stick is FIXED, not floating.** An earlier version spawned the ring
 * wherever the thumb first touched down, on the theory that a fixed 112px
 * target is hard to find blind. In practice (Marvy's own playtest) it read as
 * broken instead: the "joystick" visibly relocating itself to whatever you
 * touched didn't look like a control, and there was nothing to glance at
 * before touching to know where movement even lived. It's drawn at one place
 * now (JOY_HOME) with four tick marks so it reads as a real d-pad at a
 * glance — but the touch-capture ZONE is still the whole left `STICK_ZONE` of
 * the screen, so you don't need pixel accuracy to use it: the drag vector is
 * just always measured from the fixed ring's centre instead of from wherever
 * you happened to put your thumb down (see `moveJoy`).
 *
 * **The look layer covered the whole screen and only honoured one finger.** So a
 * left thumb landing off-stick claimed the look pointer, and the right thumb —
 * the one actually trying to aim — was then ignored until the left one lifted.
 * Look is now the right zone only, and the two zones track independent pointers.
 */
export function MobileControls() {
  const isDead = useGame((s) => s.isDead);
  const roundState = useGame((s) => s.roundState);
  const dayOver = useGame((s) => s.dayOver);

  const eBtn = useRef<HTMLButtonElement>(null); // context label: GRAB / BANK / CLAIM
  const knob = useRef<HTMLDivElement>(null);
  const joyRing = useRef<HTMLDivElement>(null); // fixed at JOY_HOME, never moves
  const joyId = useRef<number | null>(null);
  // The ring's actual on-screen centre. Measured from the DOM element rather
  // than recomputed from JOY_HOME + env(safe-area-inset-*) by hand, so it's
  // exactly right on a notched phone without duplicating CSS's own env() math
  // in JS. Fixed once per layout (mount + resize/orientationchange) — NOT
  // per touch, which is the whole point: every drag, wherever in the zone it
  // starts, is measured from this same point.
  const joyCenter = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    touch.enabled = true;
    const measure = () => {
      const r = joyRing.current?.getBoundingClientRect();
      if (r) joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      touch.enabled = false;
      touch.moveX = touch.moveY = touch.lookDX = touch.lookDY = 0;
      touch.run = touch.fire = touch.jump = false;
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
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
                      // Standing still with nothing to interact with, this used
                      // to show a dead "—" — a button occupying thumb space and
                      // doing nothing. Space always jumps, so say so.
                      : "JUMP";
        btn.textContent = label;
        actionKey.current =
          canBank || canGrab || canShop ? "KeyE" : canRest || runtime.resting ? "KeyX" : "Space";
        const hot = canBank || canGrab || canShop || canVault || canRest || runtime.resting || canRoll;
        btn.style.borderColor = hot ? "rgba(242,193,78,0.95)" : "rgba(255,255,255,0.35)";
        btn.style.background = hot ? "rgba(242,193,78,0.42)" : "rgba(20,20,24,0.42)";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Left thumb: a FIXED stick ──
  // The ring never moves — only the knob inside it does, clamped to the ring's
  // own radius. A touch anywhere in the left zone still drives it (no need to
  // land pixel-precisely on a 112px target), but the drag is always measured
  // from the ring's real, fixed centre, not from wherever the thumb first
  // touched — that's the difference from the old floating version.
  const onJoyDown = (e: React.PointerEvent) => {
    if (joyId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyId.current = e.pointerId;
    if (knob.current) knob.current.style.transition = ""; // instant tracking during drag
    if (joyRing.current) joyRing.current.style.borderColor = "rgba(242,193,78,0.75)";
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
    if (knob.current) {
      knob.current.style.transition = "transform 0.12s ease-out"; // spring back
      knob.current.style.transform = "translate(0px, 0px)";
    }
    if (joyRing.current) joyRing.current.style.borderColor = "rgba(255,255,255,0.32)";
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

      {/* The stick — fixed at JOY_HOME, always visible, never relocates. Four
          tick marks read as a d-pad at a glance, which a bare dashed circle
          didn't: there was nothing on it to say "this moves in 4 directions"
          before you'd already touched it and watched it react. */}
      <div ref={joyRing} style={styles.joyRing}>
        <div style={{ ...styles.joyTick, top: 6, left: "50%", transform: "translateX(-50%)" }} />
        <div style={{ ...styles.joyTick, bottom: 6, left: "50%", transform: "translateX(-50%)" }} />
        <div style={{ ...styles.joyTick, left: 6, top: "50%", transform: "translateY(-50%) rotate(90deg)" }} />
        <div style={{ ...styles.joyTick, right: 6, top: "50%", transform: "translateY(-50%) rotate(90deg)" }} />
        <div ref={knob} style={styles.joyKnob} />
      </div>

      {/* FOX, back on the left above the stick (Marvy's call, 2026-08-17 —
          reverses the 2026-08-16 move to the right pad). Centred over the
          ring horizontally, clear of its top edge — dropped from 150 to 124
          to follow the ring's own move down to bottom:0. */}
      {gameMode().fox && (
        <button style={{ ...styles.btnRound, ...styles.btnSmall, ...at("left", 59, 124, 52) }} {...tap("KeyQ")}>
          FOX
        </button>
      )}

      {/* ── The right thumb ──
          FIRE anchors the corner; JUMP/AIM/CROUCH/BOMB wrap around its top
          and left edges instead of sitting in rows beside it (Marvy's call,
          2026-08-17) — the corner means there's no room to surround it on
          all four sides, so the wrap covers the two it has room on. Whole
          cluster sits flush against the bottom edge, as low as it goes. */}
      <button style={{ ...styles.btnRound, ...styles.fire, ...at("right", 16, 0, 90) }} {...hold((v) => (touch.fire = v))}>
        FIRE
      </button>

      {/* Left of FIRE — CROUCH nearer it, BOMB further out. */}
      <button style={{ ...styles.btnRound, ...styles.btnSmall, ...styles.crouchLabel, ...at("right", 112, 4, 52) }} {...tap("KeyC")}>
        CROUCH
      </button>
      {/* BOMB gets the gold accent: the one situational, high-impact verb in
          the wrap, same as CROUCH getting none marks it as the plain,
          low-stakes one beside it. */}
      <button style={{ ...styles.btnRound, ...styles.btnSmall, ...styles.accent, ...at("right", 170, 4, 52) }} {...bomb}>
        BOMB
      </button>

      {/* Above FIRE — the contextual verb (closest to it, the one you press
          under pressure — BANK, GRAB, ROLL, VAULT are all the same key) and
          AIM. */}
      <button
        ref={eBtn}
        style={{ ...styles.btnRound, ...styles.action, ...at("right", 16, 92, 62) }}
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
        JUMP
      </button>

      {/* Hold to aim, like the desktop right-mouse. Brighter than the plain
          secondary buttons so it still reads as one of the buttons you press
          mid-fight, not a background utility. */}
      <button style={{ ...styles.btnRound, ...styles.primary, ...at("right", 84, 92, 62) }} {...holdKey("KeyV")}>
        AIM
      </button>

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
      {/* Day-over (Hud.tsx's dedicated overlay, not the round-over one above):
          the desktop path is two keys, E (sleep) or R (retry), and neither has
          a touch equivalent anywhere else on the pad. Without these two, a
          touch player whose day ends somewhere other than the vault/market
          tile has no way to proceed at all — a real soft-lock, not just a
          missing hint. */}
      {!isDead && roundState === "playing" && dayOver && (
        <>
          <button style={{ ...styles.center, ...styles.centerLeft, background: "#2e7d46" }} {...tap("KeyE")}>
            SLEEP
          </button>
          <button style={{ ...styles.center, ...styles.centerRight, background: "#8a6a2f" }} {...tap("KeyR")}>
            RETRY DAY
          </button>
        </>
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
  // Fixed at JOY_HOME — always the same spot, never repositioned in JS. The
  // border brightens on press (onJoyDown/onJoyUp) as the only "you're on it"
  // feedback, since the ring itself no longer moves to show that.
  joyRing: {
    position: "absolute",
    left: `calc(env(safe-area-inset-left, 0px) + ${JOY_HOME.left}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${JOY_HOME.bottom}px)`,
    width: JOY_R * 2,
    height: JOY_R * 2,
    borderRadius: 999,
    background: "rgba(20,20,24,0.3)",
    border: "1.5px solid rgba(255,255,255,0.32)",
    pointerEvents: "none",
    transition: "border-color 0.1s ease-out",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  /** One of 4 short marks on the ring's rim (N/E/S/W) — reads as "this is a
   *  d-pad" at a glance, before a thumb ever touches it. */
  joyTick: {
    position: "absolute",
    width: 3,
    height: 10,
    borderRadius: 2,
    background: "rgba(255,255,255,0.4)",
  },
  joyKnob: {
    width: JOY_R,
    height: JOY_R,
    borderRadius: 999,
    background: "rgba(242,193,78,0.75)",
    border: "1.5px solid rgba(255,255,255,0.5)",
    pointerEvents: "none",
    // No transition here on purpose — during a drag (moveJoy, every pointer
    // move) the knob has to track the thumb instantly, not ease toward it.
    // onJoyUp turns a transition on just for the release-to-centre spring,
    // then clears it before the next press.
  },
  /** Every control on the pad is a circle. One shape is one language, and a
   *  circle is the shape a thumb actually lands on — a rounded rectangle has
   *  corners you keep missing. Size comes from `at()`, so these carry no
   *  dimensions of their own. */
  btnRound: { ...btnBase, borderRadius: 999, fontSize: 12, padding: 0 },
  btnSmall: { fontSize: 11 },
  /** CROUCH is the longest label on the pad — btnSmall's 11px ran edge to
   *  edge on a 52px circle. Tighter size and letter-spacing so it clears the
   *  rim with room to spare. */
  crouchLabel: { fontSize: 9.5, letterSpacing: 0.3 },
  /** The contextual verb. Its colour is set live, because its meaning changes. */
  action: { fontSize: 12 },
  /** A bottom-row combat verb, not a background utility — brighter than the
   *  plain dark buttons so it visually pairs with FIRE/action instead of
   *  reading as the same weight as CROUCH/BOMB above it. */
  primary: {
    background: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.5)",
  },
  /** The one situational, high-impact secondary verb — gold like the rest of
   *  the game's accent colour (the joystick knob, VILLE, a hot action
   *  button), so it stands out from CROUCH beside it the same way Valor's
   *  lock button stands out from its own plain neighbours. */
  accent: {
    background: "rgba(242,193,78,0.32)",
    borderColor: "rgba(242,193,78,0.75)",
  },
  /** FIRE. The one control that must be findable without looking, so it's the
   *  only red thing on the pad and the only one this size. */
  fire: {
    fontSize: 15,
    fontWeight: 700,
    background: "rgba(178,59,59,0.55)",
    borderColor: "rgba(255,255,255,0.55)",
  },
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
  // A day-over choice is two buttons, not one — override `center`'s single
  // horizontal anchor so they sit side by side instead of stacked on top of
  // each other at the same 50% point.
  centerLeft: { left: "calc(50% - 100px)", width: 150, fontSize: 15 },
  centerRight: { left: "calc(50% + 100px)", width: 150, fontSize: 15 },
};
