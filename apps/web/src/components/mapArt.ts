import { VILLAGE, BUILDINGS, ENTERABLES } from "@/engine/world/village";

/**
 * Draws the village as a hand-inked parchment map.
 *
 * The first version was a flat dark UI card with grey rectangles on it — correct
 * information, completely wrong object. A player in a walled medieval village
 * should be looking at a piece of paper someone drew, not a dashboard. So this
 * renders an actual artefact: aged vellum with blotching and fibre, buildings as
 * ink blocks with hatched shading and cast shadow, ramparts with battlement
 * ticks, a drawn compass rose, fold creases worn through from being carried, and
 * ragged scorched edges.
 *
 * It's still generated from the same BUILDINGS data the world is built from, so
 * an artefact it may be, but it cannot lie about the geography.
 */

const HALF = VILLAGE.half;

const INK = "#4a3520";
const INK_SOFT = "rgba(74,53,32,0.55)";
const PAPER = "#e8d7b0";

/** Deterministic pseudo-random so the parchment looks identical every open. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function drawParchmentMap(ctx: CanvasRenderingContext2D, size: number) {
  const margin = size * 0.085;
  const scale = (size - margin * 2) / (HALF * 2);
  const mx = (x: number) => margin + (x + HALF) * scale;
  const mz = (z: number) => margin + (z + HALF) * scale;
  const rand = rng(20260802);

  ctx.clearRect(0, 0, size, size);

  // ── Vellum ────────────────────────────────────────────────────────────────
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);

  // Blotching: soft irregular stains, denser toward the edges where a carried
  // map gets handled and damp.
  for (let i = 0; i < 220; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const edge = Math.max(
      0,
      1 - Math.min(x, y, size - x, size - y) / (size * 0.42)
    );
    const r = (6 + rand() * 46) * (0.5 + edge);
    const a = (0.012 + rand() * 0.05) * (0.45 + edge * 1.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(122,92,52,${a})`);
    g.addColorStop(1, "rgba(122,92,52,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Paper fibre.
  ctx.strokeStyle = "rgba(120,95,60,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 8 + rand() * 40;
    const ang = rand() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // ── Terrain wash inside the walls ─────────────────────────────────────────
  ctx.fillStyle = "rgba(196,178,138,0.5)";
  ctx.fillRect(mx(-HALF), mz(-HALF), HALF * 2 * scale, HALF * 2 * scale);

  // ── Ramparts: double line with battlement ticks ───────────────────────────
  const w0 = mx(-HALF);
  const w1 = mx(HALF);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.strokeRect(w0, w0, w1 - w0, w1 - w0);
  ctx.lineWidth = 1.1;
  ctx.strokeRect(w0 + 5, w0 + 5, w1 - w0 - 10, w1 - w0 - 10);
  ctx.lineWidth = 1.4;
  const step = (w1 - w0) / 26;
  for (let i = 0; i <= 26; i++) {
    const p = w0 + i * step;
    ctx.beginPath();
    ctx.moveTo(p, w0); ctx.lineTo(p, w0 + 5);
    ctx.moveTo(p, w1); ctx.lineTo(p, w1 - 5);
    ctx.moveTo(w0, p); ctx.lineTo(w0 + 5, p);
    ctx.moveTo(w1, p); ctx.lineTo(w1 - 5, p);
    ctx.stroke();
  }
  // Corner towers.
  for (const [cx, cz] of [[w0, w0], [w1, w0], [w0, w1], [w1, w1]]) {
    ctx.beginPath();
    ctx.arc(cx, cz, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  // ── Buildings: ink blocks, hatched, with a cast shadow ────────────────────
  const enterable = new Set(ENTERABLES);
  for (const b of BUILDINGS) {
    if (b.w <= 2.5 && b.d <= 2.5) continue; // crates aren't worth mapping
    const x = mx(b.x - b.w / 2);
    const y = mz(b.z - b.d / 2);
    const w = b.w * scale;
    const h = b.d * scale;

    // Shadow to the south-east, as if lit from the top-left of the page.
    ctx.fillStyle = "rgba(74,53,32,0.20)";
    ctx.fillRect(x + 3, y + 3, w, h);

    // A safe house is left pale and marked; everything else is filled ink.
    ctx.fillStyle = enterable.has(b) ? "rgba(232,215,176,0.95)" : "rgba(96,72,44,0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);

    if (enterable.has(b)) {
      // Hatching for the open (enterable) ones so they read differently without
      // needing a colour key.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = "rgba(74,53,32,0.35)";
      ctx.lineWidth = 1;
      for (let d = -h; d < w; d += 5) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Landmarks ─────────────────────────────────────────────────────────────
  const label = (x: number, y: number, text: string, dy: number) => {
    ctx.font = `600 ${Math.round(size * 0.031)}px "Iowan Old Style", Palatino, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(232,215,176,0.95)";
    ctx.strokeText(text, x, y + dy);
    ctx.fillStyle = INK;
    ctx.fillText(text, x, y + dy);
  };

  // Vault — a drawn coin stack.
  const bx = mx(VILLAGE.bank.x);
  const bz = mz(VILLAGE.bank.z);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(bx, bz + 3 - i * 3.2, 7, 2.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(214,168,74,0.9)";
    ctx.fill();
    ctx.stroke();
  }
  label(bx, bz, "The Vault", -14);

  // Market — a drawn awning.
  const kx = mx(VILLAGE.market.x);
  const kz = mz(VILLAGE.market.z);
  ctx.beginPath();
  ctx.moveTo(kx - 9, kz + 4);
  ctx.lineTo(kx, kz - 6);
  ctx.lineTo(kx + 9, kz + 4);
  ctx.closePath();
  ctx.fillStyle = "rgba(120,150,190,0.75)";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  label(kx, kz, "Market", -14);

  // Home — a little drawn roof + door, the only house marked on the map.
  const hx = mx(VILLAGE.home.x);
  const hz = mz(VILLAGE.home.z);
  ctx.beginPath();
  ctx.moveTo(hx - 8, hz + 2);
  ctx.lineTo(hx, hz - 7);
  ctx.lineTo(hx + 8, hz + 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(120,160,110,0.75)";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(hx - 2, hz - 1, 4, 6);
  label(hx, hz, "Home", -14);

  // Gate — an arch in the south wall.
  const gx = mx(VILLAGE.spawn.x);
  const gz = mz(VILLAGE.spawn.z);
  ctx.beginPath();
  ctx.arc(gx, gz, 7, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = "rgba(232,215,176,0.95)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  label(gx, gz, "The Gate", 20);

  // ── Compass rose ──────────────────────────────────────────────────────────
  const rx = size - margin - size * 0.075;
  const ry = margin + size * 0.075;
  const R = size * 0.055;
  ctx.save();
  ctx.translate(rx, ry);
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  // Four-point star.
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.lineTo(R * 0.2, 0);
    ctx.lineTo(0, R * 0.2);
    ctx.lineTo(-R * 0.2, 0);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? INK : "rgba(74,53,32,0.45)";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.font = `700 ${Math.round(size * 0.03)}px "Iowan Old Style", Palatino, Georgia, serif`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -R - 5);
  ctx.restore();

  // ── Fold creases: worn pale lines where the paper has been folded ─────────
  const crease = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,250,235,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,95,60,0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  crease(size / 2, 0, size / 2, size);
  crease(0, size / 2, size, size / 2);

  // ── Ragged, scorched edge ─────────────────────────────────────────────────
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  const pts = 72;
  for (let i = 0; i <= pts; i++) {
    const t = (i / pts) * Math.PI * 2;
    const wobble = 1 - (0.008 + rand() * 0.02);
    // Square-ish outline with a torn wobble.
    const cx = Math.cos(t);
    const cy = Math.sin(t);
    const m = Math.max(Math.abs(cx), Math.abs(cy));
    const px = size / 2 + (cx / m) * (size / 2) * wobble;
    const py = size / 2 + (cy / m) * (size / 2) * wobble;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Scorch/handling darkening right at the torn edge.
  const edge = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.34,
    size / 2, size / 2, size * 0.72
  );
  edge.addColorStop(0, "rgba(90,64,32,0)");
  edge.addColorStop(1, "rgba(78,52,24,0.5)");
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
}
