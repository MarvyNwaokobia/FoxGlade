"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";

/**
 * DOM overlay: control hints + a rough treasure-zone compass. The compass reads
 * `runtime` on its own rAF (never re-rendering from the game loop) and shows a
 * bearing, not a pin — matching the design's "rough zone" hint (DESIGN §2).
 */
export function Hud() {
  const arrow = useRef<HTMLDivElement>(null);
  const distEl = useRef<HTMLSpanElement>(null);
  const runEl = useRef<HTMLDivElement>(null);
  const treasureEl = useRef<HTMLDivElement>(null);
  const crossEl = useRef<HTMLDivElement>(null);
  const dmgEl = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const claimed = useGame((s) => s.treasureClaimed);
  const health = useGame((s) => s.playerHealth);
  const maxHealth = useGame((s) => s.maxPlayerHealth);
  const isDead = useGame((s) => s.isDead);
  const [showClaimed, setShowClaimed] = useState(false);

  // Show a brief confirmation toast when the treasure is claimed, then fade it.
  useEffect(() => {
    if (!claimed) return;
    setShowClaimed(true);
    const id = setTimeout(() => setShowClaimed(false), 3500);
    return () => clearTimeout(id);
  }, [claimed]);

  useEffect(() => {
    const onLockChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onLockChange);

    let raf = 0;
    const tick = () => {
      const dx = runtime.treasurePos.x - runtime.playerPos.x;
      const dz = runtime.treasurePos.z - runtime.playerPos.z;
      // Bearing to treasure in world space, minus camera yaw = screen-relative angle.
      // Quantized to 45° and shown as a coarse near/mid/far band so it reads as a
      // ROUGH hint, not a GPS pin. Placeholder until the M3 hint system replaces
      // it with real + decoy hints the fox can help disambiguate (DESIGN §2/§3).
      const worldAngle = Math.atan2(dx, dz);
      const step = Math.PI / 4;
      const rel = Math.round((worldAngle - runtime.yaw) / step) * step;
      if (arrow.current) arrow.current.style.transform = `rotate(${-rel}rad)`;
      if (distEl.current) {
        const d = Math.hypot(dx, dz);
        distEl.current.textContent = d < 12 ? "near" : d < 30 ? "mid" : "far";
      }
      if (runEl.current) runEl.current.style.opacity = runtime.running ? "1" : "0";
      if (dmgEl.current) {
        const since = performance.now() - runtime.damageAt;
        dmgEl.current.style.opacity = since < 450 ? String(0.55 * (1 - since / 450)) : "0";
      }
      if (crossEl.current) {
        const now = performance.now();
        const firing = now - runtime.fireAt < 90;
        const hitting = now - runtime.hitAt < 160;
        crossEl.current.style.transform = `translate(-50%, -50%) scale(${firing ? 1.4 : 1})`;
        crossEl.current.style.background = hitting ? "#ff5a5a" : "#e8eef2";
        crossEl.current.style.boxShadow = hitting ? "0 0 0 3px rgba(255,90,90,0.35)" : "none";
      }
      if (treasureEl.current) {
        if (runtime.nearTreasure && !useGame.getState().treasureClaimed) {
          treasureEl.current.style.opacity = "1";
        } else {
          treasureEl.current.style.opacity = "0";
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

      {/* Downed overlay */}
      {isDead && (
        <div style={styles.deathOverlay}>
          <div style={styles.deathTitle}>You were downed</div>
          <div style={styles.deathHint}>
            press <b>R</b> to respawn at the gate
          </div>
        </div>
      )}

      {/* Compass, top-center */}
      <div style={styles.compassWrap}>
        <div style={styles.compass}>
          <div ref={arrow} style={styles.arrow}>
            ▲
          </div>
        </div>
        <div style={styles.compassLabel}>
          hint&nbsp;·&nbsp;<span ref={distEl}>—</span>
        </div>
      </div>

      {/* Crosshair — only while the mouse is captured (aiming) */}
      {locked && <div ref={crossEl} style={styles.crosshair} />}

      {/* Run indicator — fades in while Shift-running so the state is visible */}
      <div ref={runEl} style={styles.runPill}>
        running
      </div>

      {/* Treasure prompt — proximity claim (placeholder for the M3 mint) */}
      <div ref={treasureEl} style={styles.treasurePrompt}>
        Treasure — press <b>E</b> to claim
      </div>

      {/* Brief confirmation toast after claiming */}
      {showClaimed && (
        <div style={styles.claimedToast}>Treasure claimed&nbsp;·&nbsp;on-chain mint arrives at M3</div>
      )}

      {/* Controls, bottom-left */}
      <div style={styles.controls}>
        <div style={styles.row}>
          <b>WASD</b> move
        </div>
        <div style={styles.row}>
          <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> jump
        </div>
        <div style={styles.row}>
          <b>Mouse</b> look &nbsp;·&nbsp; <b>Left-click</b> shoot
        </div>
        <div style={styles.row}>
          <b>Esc</b> release mouse
        </div>
      </div>

      {/* Click-to-play prompt when the mouse isn't captured */}
      {!locked && (
        <div style={styles.prompt}>
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
    width: 54,
    height: 54,
    borderRadius: "50%",
    border: "2px solid rgba(232,238,242,0.35)",
    background: "rgba(11,13,16,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
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
  healthFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    transition: "width 0.15s ease, background 0.2s ease",
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
  crosshair: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#e8eef2",
    transition: "transform 0.06s ease, background 0.06s ease",
    pointerEvents: "none",
  },
  arrow: { color: "#f2c14e", fontSize: 22, lineHeight: 1, transformOrigin: "50% 50%" },
  compassLabel: { marginTop: 6, fontSize: 12, color: "rgba(232,238,242,0.7)", letterSpacing: 0.3 },
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
  treasurePrompt: {
    position: "absolute",
    left: "50%",
    top: "40%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(242,193,78,0.14)",
    border: "1px solid rgba(242,193,78,0.6)",
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
  row: {},
  prompt: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  promptCard: {
    padding: "10px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.2)",
    fontSize: 14,
    letterSpacing: 0.4,
  },
};
