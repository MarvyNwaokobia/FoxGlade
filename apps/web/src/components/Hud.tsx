"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { HINTS } from "@/engine/world/hints";
import { SESSION_SECONDS } from "@/engine/config/round";
import { thieves, MAX_THIEVES } from "@/engine/npc/thieves";
import { isTouchDevice } from "@/engine/input/touch";

const HINT_DEFAULT = "#8fd0e0"; // pale cyan ping
const HINT_REAL = "#f2c14e"; // gold
const HINT_FAKE = "#7a4a4a"; // dim decoy

/**
 * DOM overlay. Reads `runtime` on its own rAF (never re-rendering from the game
 * loop). The compass shows one arrow PER candidate hint — all identical until the
 * fox's sniff (Q) reveals which is real (DESIGN §2/§3).
 */
export function Hud() {
  const arrows = useRef<(HTMLDivElement | null)[]>([]);
  const thiefBlips = useRef<(HTMLDivElement | null)[]>([]);
  const sniffEl = useRef<HTMLDivElement>(null);
  const promptEl = useRef<HTMLDivElement>(null);
  const timerEl = useRef<HTMLDivElement>(null);
  const runEl = useRef<HTMLDivElement>(null);
  const crouchEl = useRef<HTMLDivElement>(null);
  const shelterEl = useRef<HTMLDivElement>(null);
  const eventEl = useRef<HTMLDivElement>(null);
  const crossEl = useRef<HTMLDivElement>(null); // centre dot
  const crossTop = useRef<HTMLDivElement>(null);
  const crossBottom = useRef<HTMLDivElement>(null);
  const crossLeft = useRef<HTMLDivElement>(null);
  const crossRight = useRef<HTMLDivElement>(null);
  const dmgEl = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const health = useGame((s) => s.playerHealth);
  const maxHealth = useGame((s) => s.maxPlayerHealth);
  const isDead = useGame((s) => s.isDead);
  const roundState = useGame((s) => s.roundState);
  const roundReason = useGame((s) => s.roundReason);
  const bombsLeft = useGame((s) => s.bombsLeft);
  const treasureCracked = useGame((s) => s.treasureCracked);
  const claimedRarity = useGame((s) => s.claimedRarity);
  const villeCarrying = useGame((s) => s.villeCarrying);
  const villeBanked = useGame((s) => s.villeBanked);

  // Mute toggle: reflect the persisted state, keep in sync, and bind M.
  useEffect(() => {
    setMuted(audio.muted);
    const off = audio.onMuteChange(setMuted);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) audio.toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const onLockChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onLockChange);

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const revealed = now < runtime.revealRealUntil;
      const isClaimed = useGame.getState().treasureClaimed;

      // One radar blip per hint, placed AROUND the compass ring at its bearing
      // (top = ahead). Its position around the ring shows direction; color shows
      // whether the fox has revealed it.
      const C = 29; // compass centre (px)
      const R = 20; // ring radius (px)
      for (let i = 0; i < HINTS.length; i++) {
        const el = arrows.current[i];
        if (!el) continue;
        const h = HINTS[i];
        if ((h.real && (isClaimed || runtime.hintStolen[i])) || (!h.real && runtime.hintSilenced[i])) {
          el.style.opacity = "0";
          continue;
        }
        const dx = h.pos.x - runtime.playerPos.x;
        const dz = h.pos.z - runtime.playerPos.z;
        const rel = Math.atan2(dx, dz) - runtime.yaw;
        el.style.left = `${C + Math.sin(rel) * R}px`;
        el.style.top = `${C - Math.cos(rel) * R}px`;
        el.style.background = revealed ? (h.real ? HINT_REAL : HINT_FAKE) : HINT_DEFAULT;
        el.style.opacity = "1";
      }

      // A red blip per live thief on the compass ring.
      const live = isClaimed ? [] : Array.from(thieves);
      for (let i = 0; i < MAX_THIEVES; i++) {
        const el = thiefBlips.current[i];
        if (!el) continue;
        if (i < live.length) {
          const p = live[i].getPos();
          const rel = Math.atan2(p.x - runtime.playerPos.x, p.z - runtime.playerPos.z) - runtime.yaw;
          el.style.left = `${C + Math.sin(rel) * R}px`;
          el.style.top = `${C - Math.cos(rel) * R}px`;
          el.style.opacity = "1";
        } else {
          el.style.opacity = "0";
        }
      }

      // Countdown timer (freezes when the round ends).
      if (timerEl.current && useGame.getState().roundState === "playing") {
        const left = Math.max(0, SESSION_SECONDS - (now - runtime.roundStartAt) / 1000);
        const mm = Math.floor(left / 60);
        const ss = Math.floor(left % 60);
        timerEl.current.textContent = `${mm}:${ss < 10 ? "0" : ""}${ss}`;
        timerEl.current.style.color = left <= 30 ? "#ff6b5a" : "#e8eef2";
      }

      // Fox sniff indicator.
      if (sniffEl.current) {
        const cd = runtime.sniffReadyAt - now;
        if (revealed) {
          sniffEl.current.textContent = "🦊 on the scent!";
          sniffEl.current.style.color = HINT_REAL;
          sniffEl.current.style.borderColor = HINT_REAL;
        } else if (cd > 0) {
          sniffEl.current.textContent = `🦊 sniff ${Math.ceil(cd / 1000)}s`;
          sniffEl.current.style.color = "rgba(232,238,242,0.5)";
          sniffEl.current.style.borderColor = "rgba(232,238,242,0.25)";
        } else {
          sniffEl.current.textContent = "🦊 sniff — Q";
          sniffEl.current.style.color = HINT_DEFAULT;
          sniffEl.current.style.borderColor = HINT_DEFAULT;
        }
      }

      // Proximity prompt: real → claim, fake → dud.
      if (promptEl.current) {
        if (!isClaimed && runtime.nearHintIsReal) {
          promptEl.current.innerHTML = "Treasure — press <b>E</b> to claim";
          promptEl.current.style.color = "#ffdf8f";
          promptEl.current.style.borderColor = "rgba(242,193,78,0.6)";
          promptEl.current.style.opacity = "1";
        } else if (runtime.nearHintIndex >= 0) {
          promptEl.current.innerHTML = "False lead — nothing here";
          promptEl.current.style.color = "rgba(232,238,242,0.7)";
          promptEl.current.style.borderColor = "rgba(232,238,242,0.3)";
          promptEl.current.style.opacity = "1";
        } else {
          promptEl.current.style.opacity = "0";
        }
      }

      if (runEl.current) runEl.current.style.opacity = runtime.running ? "1" : "0";
      if (crouchEl.current) crouchEl.current.style.opacity = runtime.crouching ? "1" : "0";

      // Event toast: a treasure was just stolen or cracked (whichever is fresher).
      if (eventEl.current) {
        const stolenAge = now - runtime.treasureStolenAt;
        const crackedAge = now - runtime.treasureCrackedAt;
        const age = Math.min(
          runtime.treasureStolenAt < 0 ? Infinity : stolenAge,
          runtime.treasureCrackedAt < 0 ? Infinity : crackedAge
        );
        if (age < 3200) {
          const isTheft = age === stolenAge;
          eventEl.current.textContent = isTheft
            ? "A thief made off with a treasure!"
            : "The blast cracked the treasure!";
          eventEl.current.style.color = isTheft ? "#ff8a7a" : "#ffb054";
          eventEl.current.style.borderColor = isTheft ? "rgba(232,86,63,0.6)" : "rgba(255,138,60,0.6)";
          eventEl.current.style.opacity = String(age < 2600 ? 1 : (3200 - age) / 600);
        } else {
          eventEl.current.style.opacity = "0";
        }
      }

      // Shelter / rest prompt while inside a house (the world is paused here).
      if (shelterEl.current) {
        const canBank = runtime.nearBank && useGame.getState().villeCarrying > 0;
        if (canBank) {
          shelterEl.current.innerHTML = "at the vault — press <b>E</b> to deposit your loot";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.resting) {
          shelterEl.current.innerHTML = "resting — world paused · health recovering · <b>X</b> to stand";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.sheltered) {
          shelterEl.current.innerHTML = "indoors — world paused · <b>X</b> to sit and rest";
          shelterEl.current.style.opacity = "1";
        } else {
          shelterEl.current.style.opacity = "0";
        }
      }

      // Dim the countdown while indoors to signal it's frozen.
      if (timerEl.current) {
        timerEl.current.style.opacity = runtime.sheltered ? "0.4" : "1";
      }
      if (dmgEl.current) {
        const since = now - runtime.damageAt;
        dmgEl.current.style.opacity = since < 450 ? String(0.55 * (1 - since / 450)) : "0";
      }
      // Dynamic crosshair: ticks spread while running/firing, tighten when still;
      // whole reticle flashes red on a connecting hit (the hitmarker).
      {
        const firing = now - runtime.fireAt < 90;
        const hitting = now - runtime.hitAt < 160;
        const headshotting = now - runtime.headshotAt < 220;
        const fireAge = (now - runtime.fireAt) / 1000;
        const firePulse = fireAge >= 0 && fireAge < 0.12 ? (1 - fireAge / 0.12) * 6 : 0;
        const gap = 4 + (runtime.running ? 5 : 0) + firePulse; // px from centre to each tick
        const col = headshotting ? "#ffd24a" : hitting ? "#ff5a5a" : "#ffffff"; // gold on a headshot
        if (crossTop.current) {
          crossTop.current.style.transform = `translate(-50%, calc(-100% - ${gap}px))`;
          crossTop.current.style.background = col;
        }
        if (crossBottom.current) {
          crossBottom.current.style.transform = `translate(-50%, ${gap}px)`;
          crossBottom.current.style.background = col;
        }
        if (crossLeft.current) {
          crossLeft.current.style.transform = `translate(calc(-100% - ${gap}px), -50%)`;
          crossLeft.current.style.background = col;
        }
        if (crossRight.current) {
          crossRight.current.style.transform = `translate(${gap}px, -50%)`;
          crossRight.current.style.background = col;
        }
        if (crossEl.current) {
          crossEl.current.style.background = col;
          crossEl.current.style.transform = `translate(-50%, -50%) scale(${firing ? 1.4 : 1})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  return (
    <>
      {/* Red damage flash */}
      <div ref={dmgEl} style={styles.damageFlash} />

      {/* Player health bar, bottom-center */}
      <div style={styles.healthWrap}>
        <div
          style={{
            ...styles.healthFill,
            width: `${(Math.max(0, health) / maxHealth) * 100}%`,
            background: health > maxHealth * 0.3 ? "#5ad17a" : "#e8563f",
          }}
        />
        <div style={styles.healthLabel}>{Math.max(0, Math.round(health))}</div>
      </div>

      {/* Bomb count, beside the health bar */}
      <div style={{ ...styles.bombPill, opacity: bombsLeft > 0 ? 1 : 0.35 }}>💣 ×{bombsLeft}</div>

      {/* Loot wallet, top-left: banked total + what you're carrying (unbanked) */}
      <div style={styles.wallet}>
        <div style={styles.walletBanked}>🏦 {villeBanked} VILLE</div>
        {villeCarrying > 0 && <div style={styles.walletCarry}>◆ carrying {villeCarrying} — bank it</div>}
      </div>

      {/* Countdown timer, top-right */}
      <div style={styles.timer}>
        <div ref={timerEl} style={styles.timerNum}>
          {Math.floor(SESSION_SECONDS / 60)}:{SESSION_SECONDS % 60 < 10 ? "0" : ""}
          {SESSION_SECONDS % 60}
        </div>
        <div style={styles.timerLabel}>time left</div>
      </div>

      {/* Downed overlay (mid-round setback, not round end) */}
      {isDead && roundState === "playing" && (
        <div style={styles.deathOverlay}>
          <div style={styles.deathTitle}>You were downed</div>
          <div style={styles.deathHint}>
            press <b>R</b> to respawn at the gate
          </div>
        </div>
      )}

      {/* Round-over overlay (win / lose) */}
      {roundState !== "playing" && (
        <div style={styles.roundOverlay}>
          <div style={{ ...styles.roundTitle, color: roundState === "won" ? "#ffd873" : "#e8563f" }}>
            {roundState === "won"
              ? treasureCracked
                ? claimedRarity === "rare"
                  ? "Treasure claimed — cracked (rare → common)"
                  : "Treasure claimed — cracked (common → scrap)"
                : `Treasure claimed! · ${(claimedRarity ?? "common").toUpperCase()}`
              : roundReason === "thief"
                ? "Thieves took every treasure"
                : "Time's up"}
          </div>
          {villeCarrying > 0 && (
            <div style={styles.roundLoot}>
              carrying {villeCarrying} VILLE — bank it at the vault next run · {villeBanked} safe
            </div>
          )}
          <div style={styles.roundHint}>
            press <b>Enter</b> to play again
          </div>
        </div>
      )}

      {/* Compass, top-center — one radar blip per candidate hint + the thief */}
      <div style={styles.compassWrap}>
        <div style={styles.compass}>
          <div style={styles.compassCenter} />
          {HINTS.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                arrows.current[i] = el;
              }}
              style={styles.hintDot}
            />
          ))}
          {Array.from({ length: MAX_THIEVES }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                thiefBlips.current[i] = el;
              }}
              style={styles.thiefDot}
            />
          ))}
        </div>
        <div ref={sniffEl} style={styles.sniffPill}>
          🦊 sniff — Q
        </div>
      </div>

      {/* Dynamic crosshair — only while the mouse is captured (aiming) */}
      {locked && (
        <div style={styles.crosshairWrap}>
          <div ref={crossTop} style={styles.crossTickV} />
          <div ref={crossBottom} style={styles.crossTickV} />
          <div ref={crossLeft} style={styles.crossTickH} />
          <div ref={crossRight} style={styles.crossTickH} />
          <div ref={crossEl} style={styles.crossDot} />
        </div>
      )}

      {/* Run indicator */}
      <div ref={runEl} style={styles.runPill}>
        running
      </div>

      {/* Crouch indicator (mutually exclusive with running) */}
      <div ref={crouchEl} style={styles.crouchPill}>
        crouched
      </div>

      {/* Shelter / rest prompt (inside a house) — text set from the game loop */}
      <div ref={shelterEl} style={styles.shelterPill} />

      {/* Event toast (treasure stolen / cracked) — text set from the game loop */}
      <div ref={eventEl} style={styles.eventToast} />

      {/* Proximity prompt (claim / false lead) — text set from the game loop */}
      <div ref={promptEl} style={styles.prompt} />

      {/* Mute toggle, bottom-right (the one interactive HUD element) */}
      <button
        type="button"
        onClick={() => audio.toggleMute()}
        style={{ ...styles.muteBtn, opacity: muted ? 0.6 : 1 }}
        title="Mute / unmute (M)"
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {/* Controls, bottom-left */}
      <div style={styles.controls}>
        <div>
          <b>WASD</b> move &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> jump &nbsp;·&nbsp; <b>C</b> crouch &nbsp;·&nbsp; <b>V</b> view
        </div>
        <div>
          <b>Mouse</b> look &nbsp;·&nbsp; <b>Left-click</b> / <b>F</b> shoot
        </div>
        <div>
          <b>G</b> hold to aim bomb, release to throw
        </div>
        <div>
          <b>Q</b> fox sniff &nbsp;·&nbsp; <b>E</b> claim &nbsp;·&nbsp; <b>X</b> rest (indoors) &nbsp;·&nbsp; <b>Esc</b> release mouse
        </div>
      </div>

      {/* Click-to-play prompt when the mouse isn't captured (desktop only —
          touch devices use on-screen controls, no pointer lock). */}
      {!locked && !isTouchDevice() && (
        <div style={styles.lockPrompt}>
          <div style={styles.promptCard}>click to look around</div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  compassWrap: {
    position: "absolute",
    top: 18,
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
  },
  compass: {
    position: "relative",
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "2px solid rgba(232,238,242,0.35)",
    background: "rgba(11,13,16,0.5)",
    margin: "0 auto",
  },
  hintDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 9,
    height: 9,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: HINT_DEFAULT,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
    transition: "background 0.2s ease",
  },
  compassCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 4,
    height: 4,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(232,238,242,0.5)",
  },
  thiefDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 9,
    height: 9,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "#e8563f",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55), 0 0 6px rgba(232,86,63,0.8)",
    opacity: 0,
  },
  timer: {
    position: "absolute",
    top: 16,
    right: 20,
    textAlign: "right",
    pointerEvents: "none",
    userSelect: "none",
  },
  timerNum: {
    fontSize: 30,
    fontWeight: 700,
    color: "#e8eef2",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
    lineHeight: 1,
  },
  timerLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(232,238,242,0.5)", marginTop: 2 },
  roundOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "rgba(11,13,16,0.7)",
    pointerEvents: "none",
    userSelect: "none",
  },
  roundTitle: { fontSize: 44, fontWeight: 800, letterSpacing: 1, textAlign: "center" },
  roundLoot: { fontSize: 15, color: "#aef2cb", letterSpacing: 0.3 },
  roundHint: { fontSize: 17, color: "rgba(232,238,242,0.85)" },
  sniffPill: {
    marginTop: 8,
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    border: `1px solid ${HINT_DEFAULT}`,
    color: HINT_DEFAULT,
    fontSize: 12,
    letterSpacing: 0.5,
    background: "rgba(11,13,16,0.5)",
  },
  damageFlash: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at center, rgba(255,40,40,0) 45%, rgba(200,20,20,0.9) 100%)",
    opacity: 0,
    pointerEvents: "none",
  },
  healthWrap: {
    position: "absolute",
    left: "50%",
    bottom: 52,
    transform: "translateX(-50%)",
    width: 240,
    height: 16,
    borderRadius: 8,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
  },
  healthFill: { position: "absolute", left: 0, top: 0, bottom: 0, transition: "width 0.15s ease, background 0.2s ease" },
  wallet: {
    position: "absolute",
    top: 16,
    left: 20,
    pointerEvents: "none",
    userSelect: "none",
  },
  walletBanked: {
    fontSize: 16,
    fontWeight: 700,
    color: "#ffd873",
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
  },
  walletCarry: {
    marginTop: 3,
    fontSize: 12,
    color: "#aef2cb",
    letterSpacing: 0.3,
  },
  bombPill: {
    position: "absolute",
    left: "calc(50% + 132px)",
    bottom: 50,
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    color: "#e8eef2",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  healthLabel: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "#0b0d10",
    letterSpacing: 0.5,
  },
  deathOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    background: "rgba(11,13,16,0.55)",
    pointerEvents: "none",
    userSelect: "none",
  },
  deathTitle: { fontSize: 34, fontWeight: 700, letterSpacing: 1, color: "#e8563f" },
  deathHint: { fontSize: 16, color: "rgba(232,238,242,0.85)" },
  crosshairWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 0,
    height: 0,
    pointerEvents: "none",
    userSelect: "none",
  },
  crossDot: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "#ffffff",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
  },
  crossTickV: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2,
    height: 6,
    background: "#ffffff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
  },
  crossTickH: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 6,
    height: 2,
    background: "#ffffff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
  },
  runPill: {
    position: "absolute",
    left: "50%",
    bottom: 26,
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(242,193,78,0.15)",
    border: "1px solid rgba(242,193,78,0.5)",
    color: "#f2c14e",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    opacity: 0,
    transition: "opacity 0.12s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  crouchPill: {
    position: "absolute",
    left: "50%",
    bottom: 26,
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(143,208,224,0.12)",
    border: "1px solid rgba(143,208,224,0.5)",
    color: "#8fd0e0",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    opacity: 0,
    transition: "opacity 0.12s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  eventToast: {
    position: "absolute",
    left: "50%",
    top: "27%",
    transform: "translateX(-50%)",
    padding: "8px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.65)",
    border: "1px solid rgba(232,86,63,0.6)",
    color: "#ff8a7a",
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  shelterPill: {
    position: "absolute",
    left: "50%",
    bottom: 84,
    transform: "translateX(-50%)",
    padding: "5px 14px",
    borderRadius: 999,
    background: "rgba(90,209,122,0.12)",
    border: "1px solid rgba(90,209,122,0.5)",
    color: "#8fe0a8",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.15s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  prompt: {
    position: "absolute",
    left: "50%",
    top: "40%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.55)",
    border: "1px solid rgba(232,238,242,0.3)",
    color: "#ffdf8f",
    fontSize: 16,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.15s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  claimedToast: {
    position: "absolute",
    left: "50%",
    top: "34%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(78,242,142,0.14)",
    border: "1px solid rgba(120,242,170,0.6)",
    color: "#aef2cb",
    fontSize: 15,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
  },
  controls: {
    position: "absolute",
    left: 18,
    bottom: 18,
    fontSize: 13,
    color: "rgba(232,238,242,0.75)",
    lineHeight: 1.7,
    pointerEvents: "none",
    userSelect: "none",
  },
  muteBtn: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    color: "#e8eef2",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    pointerEvents: "auto",
    userSelect: "none",
  },
  lockPrompt: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  promptCard: {
    padding: "10px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.2)",
    fontSize: 14,
    letterSpacing: 0.4,
  },
};
