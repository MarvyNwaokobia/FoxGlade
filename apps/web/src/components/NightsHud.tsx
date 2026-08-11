"use client";

import { useEffect, useRef } from "react";
import { clock, NIGHTS, type RunState } from "@/engine/nights/run";
import { nightsRuntime } from "@/engine/nights/runtime";

/**
 * The Nights overlay.
 *
 * Reads the run on its own rAF rather than re-rendering from the frame loop.
 * Deliberately sparse: in a survivor-like the screen belongs to the crowd, and
 * every pixel of chrome is a pixel you cannot read a gap through.
 */
export function NightsHud({ run, onRetry }: { run: RunState; onRetry: () => void }) {
  const hpFill = useRef<HTMLDivElement>(null);
  const xpFill = useRef<HTMLDivElement>(null);
  const timeEl = useRef<HTMLDivElement>(null);
  const levelEl = useRef<HTMLDivElement>(null);
  const killsEl = useRef<HTMLDivElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const overEl = useRef<HTMLDivElement>(null);
  const statsEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (hpFill.current) {
        const f = Math.max(0, run.hp / run.maxHp);
        hpFill.current.style.width = `${f * 100}%`;
        hpFill.current.style.background = f > 0.5 ? "#5ad17a" : f > 0.22 ? "#f2c14e" : "#e8563f";
      }
      if (xpFill.current) xpFill.current.style.width = `${(run.xp / run.xpToNext) * 100}%`;
      // The clock counts UP to dawn: it is a thing you are surviving toward.
      if (timeEl.current) timeEl.current.textContent = clock(run.t);
      if (levelEl.current) levelEl.current.textContent = `LV ${run.level}`;
      if (killsEl.current) killsEl.current.textContent = `${run.kills}`;
      if (statsEl.current) {
        statsEl.current.textContent = `${nightsRuntime.alive} walkers · ${nightsRuntime.motes} motes`;
      }
      if (flashEl.current) {
        const age = now - nightsRuntime.hitAt;
        flashEl.current.style.opacity =
          nightsRuntime.hitAt > 0 && age < 320 ? String(0.5 * (1 - age / 320)) : "0";
      }
      if (overEl.current) overEl.current.style.opacity = run.over ? "1" : "0";
      if (overEl.current) overEl.current.style.pointerEvents = run.over ? "auto" : "none";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyR" && run.over) onRetry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, onRetry]);

  return (
    <>
      <div ref={flashEl} style={S.flash} />

      <div style={S.topBar}>
        <div ref={timeEl} style={S.time}>
          0:00
        </div>
        <div style={S.untilDawn}>UNTIL DAWN {clock(NIGHTS.runSeconds)}</div>
      </div>

      <div style={S.left}>
        <div ref={levelEl} style={S.level}>
          LV 1
        </div>
        <div style={S.killsRow}>
          <span style={S.killsLabel}>KILLS</span>
          <span ref={killsEl} style={S.kills}>
            0
          </span>
        </div>
        <div ref={statsEl} style={S.debug} />
      </div>

      <div style={S.bottom}>
        <div style={S.xpTrack}>
          <div ref={xpFill} style={S.xpFill} />
        </div>
        <div style={S.hpTrack}>
          <div ref={hpFill} style={S.hpFill} />
        </div>
      </div>

      <div ref={overEl} style={S.over}>
        <div style={S.overCard}>
          <div style={S.overTitle}>{run.won ? "Dawn" : "The dark took you"}</div>
          <div style={S.overLine}>
            {run.won
              ? "You held until morning."
              : `You lasted ${clock(run.t)}, and put down ${run.kills}.`}
          </div>
          <div style={S.overHint}>
            press <b>R</b> to go again
          </div>
        </div>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  flash: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at center, rgba(255,40,40,0) 45%, rgba(200,20,20,0.95) 100%)",
    opacity: 0,
    pointerEvents: "none",
  },
  topBar: {
    position: "absolute",
    top: 18,
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  time: { fontSize: 40, fontWeight: 800, color: "#e8eef2", letterSpacing: 1, lineHeight: 1 },
  untilDawn: { fontSize: 10, letterSpacing: 3, color: "rgba(232,238,242,0.45)", marginTop: 3 },
  left: {
    position: "absolute",
    top: 18,
    left: 20,
    pointerEvents: "none",
    userSelect: "none",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  level: { fontSize: 20, fontWeight: 800, color: "#f2c14e", letterSpacing: 1 },
  killsRow: { display: "flex", alignItems: "baseline", gap: 7, marginTop: 4 },
  killsLabel: { fontSize: 10, letterSpacing: 2, color: "rgba(232,238,242,0.4)" },
  kills: { fontSize: 15, fontWeight: 700, color: "#e8eef2" },
  debug: { fontSize: 10, color: "rgba(232,238,242,0.25)", marginTop: 6, letterSpacing: 0.5 },
  bottom: {
    position: "absolute",
    left: "50%",
    bottom: 26,
    transform: "translateX(-50%)",
    width: "min(560px, 74vw)",
    pointerEvents: "none",
    userSelect: "none",
  },
  xpTrack: {
    height: 7,
    borderRadius: 4,
    background: "rgba(11,13,16,0.72)",
    border: "1px solid rgba(143,208,224,0.3)",
    overflow: "hidden",
  },
  xpFill: { height: "100%", width: "0%", background: "#8fd0e0", transition: "width 0.12s linear" },
  hpTrack: {
    height: 12,
    marginTop: 6,
    borderRadius: 6,
    background: "rgba(11,13,16,0.72)",
    border: "1px solid rgba(232,238,242,0.22)",
    overflow: "hidden",
  },
  hpFill: { height: "100%", width: "100%", background: "#5ad17a", transition: "width 0.15s ease" },
  over: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(6,8,12,0.72)",
    opacity: 0,
    transition: "opacity 0.35s ease",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  overCard: { textAlign: "center", padding: 30 },
  overTitle: { fontSize: 40, fontWeight: 800, color: "#f2c14e", letterSpacing: 1 },
  overLine: { fontSize: 15, color: "#dfe8ee", marginTop: 10 },
  overHint: { fontSize: 13, color: "rgba(232,238,242,0.55)", marginTop: 22 },
};
