"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { VILLAGE, BUILDINGS, doorOpening } from "@/engine/world/village";
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
  const menuOpen = useGame((s) => s.menuOpen);
  const profileOpen = useGame((s) => s.profileOpen);
  const bankOpen = useGame((s) => s.bankOpen);
  const [narrow, setNarrow] = useState(false);
  // Separately from the width-based shrink below: on short HEIGHT (a
  // landscape phone), the map needs to shrink MORE — at a common landscape
  // height (~375px) even the 0.72 scale only opens a ~15px gap to CROUCH's
  // top edge, not enough room for WalletButton to sit between them either.
  const [short, setShort] = useState(false);
  useEffect(() => {
    // Also shrink on short HEIGHT, not just narrow width — a landscape phone
    // (wide, short) never tripped the width check, so at full size the map's
    // lower-right corner overlapped the CROUCH button (MobileControls.tsx's
    // right-edge stack reaches ~232px up from the bottom, more than half of a
    // ~375-430px-tall landscape screen).
    const measure = () => {
      setNarrow(window.innerWidth < 520 || window.innerHeight < 440);
      setShort(window.innerHeight < 440);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

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

      // ── The town, not a scatter of boxes ────────────────────────────────────
      //
      // This drew flat grey rectangles on a flat grey plate, so the map read as
      // abstract blocks with no sense of place. It's still a plan view — that's
      // what a map is — but everything now matches what you actually see out
      // there: grass beyond the walls, cobbled streets inside them, roofs with a
      // ridge and a cast shadow so buildings read as VOLUMES, ramparts with
      // corner towers, and the marketplace as the open courtyard it is.
      const TOWN = HALF * 2 * SCALE;

      // Grass beyond the ramparts.
      ctx.fillStyle = "#2f3a26";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // The cobbled town floor inside the walls.
      roundRect(ctx, mx(-HALF), mz(-HALF), TOWN, TOWN, 6);
      ctx.fillStyle = "#4a453f";
      ctx.fill();

      // Worn dirt through the middle of the streets — the routes between the
      // gate, the plaza and the deep north, drawn as one soft spine so the map
      // suggests where people walk rather than only where they can't.
      ctx.save();
      roundRect(ctx, mx(-HALF), mz(-HALF), TOWN, TOWN, 6);
      ctx.clip();
      ctx.strokeStyle = "rgba(122,104,80,0.55)";
      ctx.lineCap = "round";
      ctx.lineWidth = 7 * SCALE;
      ctx.beginPath();
      ctx.moveTo(mx(0), mz(HALF));
      ctx.lineTo(mx(0), mz(14));
      ctx.lineTo(mx(-6), mz(2));
      ctx.lineTo(mx(-2), mz(-14));
      ctx.lineTo(mx(2), mz(-30));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx(-6), mz(2));
      ctx.lineTo(mx(-22), mz(4)); // west, to the market and the vault
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx(-2), mz(-14));
      ctx.lineTo(mx(18), mz(-10)); // east courtyard
      ctx.stroke();
      ctx.restore();

      // Ramparts + corner towers.
      roundRect(ctx, mx(-HALF), mz(-HALF), TOWN, TOWN, 6);
      ctx.strokeStyle = "#6b6155";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(242,193,78,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const [cx, cz] of [
        [-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF],
      ] as [number, number][]) {
        ctx.beginPath();
        ctx.arc(mx(cx), mz(cz), 4, 0, Math.PI * 2);
        ctx.fillStyle = "#6b6155";
        ctx.strokeStyle = "rgba(18,16,14,0.9)";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }

      for (const b of BUILDINGS) {
        const crate = b.w <= 2.5 && b.d <= 2.5;
        const x = mx(b.x - b.w / 2);
        const y = mz(b.z - b.d / 2);
        const w = b.w * SCALE;
        const h = b.d * SCALE;

        if (crate) {
          ctx.fillStyle = "rgba(120,108,92,0.5)";
          ctx.fillRect(x, y, w, h);
          continue;
        }

        // The marketplace is a walled courtyard with no roof — drawn hollow, so
        // it reads as somewhere you go INTO rather than another solid block.
        if (b.kind === "market") {
          ctx.fillStyle = "rgba(90,78,60,0.55)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#8a7a5e";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          continue;
        }

        // Cast shadow to the south-east, as if the sun were off the top-left.
        ctx.fillStyle = "rgba(12,10,9,0.45)";
        ctx.fillRect(x + 2, y + 2, w, h);

        // Roof, with a lighter ridge along its LONG axis — two tones is all it
        // takes for a rectangle to read as a pitched roof seen from above.
        ctx.fillStyle = b.door ? "#8d7b5c" : "#7a6a55";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(18,16,14,0.85)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgba(232,214,180,0.32)";
        if (w >= h) ctx.fillRect(x, y + h / 2 - 0.9, w, 1.8);
        else ctx.fillRect(x + w / 2 - 0.9, y, 1.8, h);

        // A doored building is one you can walk into: mark the opening.
        if (b.door) {
          const o = doorOpening(b);
          if (o) {
            ctx.fillStyle = "#f2c14e";
            ctx.beginPath();
            ctx.arc(mx(o.cx), mz(o.cz), 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Bank + Market landmarks.
      const t = performance.now() / 1000;
      // The bank labels ABOVE its pin and the market BELOW: they sit ~11 map-px
      // apart vertically, so with both labels underneath, "BANK" landed directly
      // on the market's marker and the two were unreadable together.
      marker(ctx, mx(VILLAGE.bank.x), mz(VILLAGE.bank.z), "#ffd873", "🏦", "BANK", false, t, true);
      marker(ctx, mx(VILLAGE.market.x), mz(VILLAGE.market.z), "#4e93f2", "🛒", "MARKET", true, t, false);
      marker(ctx, mx(VILLAGE.home.x), mz(VILLAGE.home.z), "#7cce6b", "🏠", "HOME", false, t, false);

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
    <div
      style={{
        ...styles.wrap,
        opacity: shopOpen || menuOpen || profileOpen || bankOpen ? 0 : 1,
        // 158px is 40% of a portrait phone's width, and it was reaching far
        // enough left to clip the fox pill in half. Scaled down rather than
        // re-laid-out, so the canvas keeps its full drawing resolution. Short
        // (landscape) needs a bigger reduction than narrow (portrait) to
        // actually open a usable gap above CROUCH — see the `short` note above.
        transform: short ? "scale(0.6)" : narrow ? "scale(0.72)" : undefined,
        transformOrigin: "top right",
      }}
    >
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
  t: number,
  labelAbove = false
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
  // Label clear of the pin, on the side that isn't occupied.
  ctx.font = "700 8px system-ui, sans-serif";
  // A dark halo, so a label crossing a pale building footprint stays readable.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(16,14,12,0.9)";
  ctx.strokeText(label, x, y + (labelAbove ? -9 : 15));
  ctx.fillStyle = color;
  ctx.fillText(label, x, y + (labelAbove ? -9 : 15));
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
    // Opaque, and NO backdrop blur. The blur was smearing the village through a
    // 62%-transparent panel, which is most of why the map looked like a foggy
    // grey mess in play — and on mobile it is an expensive per-frame filter for
    // an effect that actively hurt legibility.
    background: "rgba(16,14,12,0.94)",
    border: "1px solid rgba(242,193,78,0.4)",
    boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
    overflow: "hidden",
    zIndex: 30,
    pointerEvents: "none",
    transition: "opacity 0.2s",
  },
};
