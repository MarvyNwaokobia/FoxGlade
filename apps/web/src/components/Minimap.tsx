"use client";

import { useEffect, useRef } from "react";
import { runtime } from "@/engine/runtime";
import { VILLAGE, BUILDINGS } from "@/engine/world/village";
import { useGame } from "@/engine/store";

/**
 * A small north-up town map (top-right). Draws the walled bounds + building
 * footprints for orientation, with clear markers for the BANK and the MARKET —
 * so the stall is easy to find — and the player as a heading arrow. Reads the
 * per-frame `runtime` singleton on its own rAF loop (no React re-renders).
 */
const SIZE = 158; // css px (square)
const MARGIN = 9; // inner padding so edge markers aren't clipped
const HALF = VILLAGE.half;
const SCALE = (SIZE - MARGIN * 2) / (HALF * 2);

// world → map px (north = -Z is up; east = +X is right)
function mx(x: number) {
  return MARGIN + (x + HALF) * SCALE;
}
function mz(z: number) {
  return MARGIN + (z + HALF) * SCALE;
}

export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shopOpen = useGame((s) => s.shopOpen);

  useEffect(() => {
    const cvs = canvas.current;
    if (!cvs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = SIZE * dpr;
    cvs.height = SIZE * dpr;
    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Walled bounds (the town square).
      ctx.strokeStyle = "rgba(232,238,242,0.28)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, mx(-HALF), mz(-HALF), HALF * 2 * SCALE, HALF * 2 * SCALE, 6);
      ctx.stroke();

      // Building footprints — solids brighter, micro-cover crates dimmer.
      for (const b of BUILDINGS) {
        const crate = b.w <= 2.5 && b.d <= 2.5;
        ctx.fillStyle = crate ? "rgba(232,238,242,0.10)" : "rgba(232,238,242,0.20)";
        ctx.fillRect(mx(b.x - b.w / 2), mz(b.z - b.d / 2), b.w * SCALE, b.d * SCALE);
      }

      // Bank + Market landmarks.
      const t = performance.now() / 1000;
      marker(ctx, mx(VILLAGE.bank.x), mz(VILLAGE.bank.z), "#ffd873", "🏦", "BANK", false, t);
      marker(ctx, mx(VILLAGE.market.x), mz(VILLAGE.market.z), "#4e93f2", "🛒", "MARKET", true, t);

      // Player heading arrow.
      const px = mx(runtime.playerPos.x);
      const pz = mz(runtime.playerPos.z);
      const fx = -Math.sin(runtime.yaw); // world forward, mapped: +x right / +z down
      const fz = -Math.cos(runtime.yaw);
      const ux = fz; // perpendicular
      const uz = -fx;
      const L = 6;
      const W = 3.6;
      ctx.beginPath();
      ctx.moveTo(px + fx * L, pz + fz * L);
      ctx.lineTo(px - fx * 3 + ux * W, pz - fz * 3 + uz * W);
      ctx.lineTo(px - fx * 3 - ux * W, pz - fz * 3 - uz * W);
      ctx.closePath();
      ctx.fillStyle = "#f2c14e";
      ctx.strokeStyle = "rgba(20,16,12,0.9)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      // North tick.
      ctx.fillStyle = "rgba(232,238,242,0.55)";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", SIZE / 2, 11);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ ...styles.wrap, opacity: shopOpen ? 0 : 1 }}>
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE, display: "block" }} />
    </div>
  );
}

function marker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  icon: string,
  label: string,
  pulse: boolean,
  t: number
) {
  if (pulse) {
    const r = 7 + Math.sin(t * 3) * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(color, 0.18);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(20,16,12,0.85)";
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.font = "8px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(icon, x, y + 2.7);
  // Label just below.
  ctx.font = "700 8px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(label, x, y + 15);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** hex "#rrggbb" + alpha → rgba() string. */
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    right: "calc(env(safe-area-inset-right, 0px) + 14px)",
    width: SIZE,
    height: SIZE,
    padding: 0,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(24,20,15,0.62), rgba(14,12,10,0.62))",
    border: "1px solid rgba(242,193,78,0.28)",
    boxShadow: "0 6px 22px rgba(0,0,0,0.4)",
    backdropFilter: "blur(3px)",
    overflow: "hidden",
    zIndex: 30,
    pointerEvents: "none",
    transition: "opacity 0.2s",
  },
};
