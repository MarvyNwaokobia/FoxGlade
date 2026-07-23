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
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onLockChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onLockChange);

    let raf = 0;
    const tick = () => {
      const dx = runtime.treasurePos.x - runtime.playerPos.x;
      const dz = runtime.treasurePos.z - runtime.playerPos.z;
      // Bearing to treasure in world space, minus camera yaw = screen-relative angle.
      const worldAngle = Math.atan2(dx, dz);
      const rel = worldAngle - runtime.yaw;
      if (arrow.current) arrow.current.style.transform = `rotate(${-rel}rad)`;
      if (distEl.current) distEl.current.textContent = `${Math.round(Math.hypot(dx, dz))}m`;
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
          treasure&nbsp;·&nbsp;<span ref={distEl}>—</span>
        </div>
      </div>

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
