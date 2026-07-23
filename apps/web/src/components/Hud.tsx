"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";

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
  const [locked, setLocked] = useState(false);

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
      if (treasureEl.current) {
        if (runtime.treasureClaimed) {
          treasureEl.current.style.opacity = "1";
          treasureEl.current.textContent = "Treasure claimed  ·  on-chain mint arrives at M3";
        } else if (runtime.nearTreasure) {
          treasureEl.current.style.opacity = "1";
          treasureEl.current.textContent = "Treasure — press E to claim";
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

      {/* Run indicator — fades in while Shift-running so the state is visible */}
      <div ref={runEl} style={styles.runPill}>
        running
      </div>

      {/* Treasure prompt — proximity claim (placeholder for the M3 mint) */}
      <div ref={treasureEl} style={styles.treasurePrompt} />

      {/* Controls, bottom-left */}
      <div style={styles.controls}>
        <div style={styles.row}>
          <b>WASD</b> move
        </div>
        <div style={styles.row}>
          <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> jump
        </div>
        <div style={styles.row}>
          <b>Mouse</b> look &nbsp;·&nbsp; <b>Esc</b> release
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
    top: "38%",
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
