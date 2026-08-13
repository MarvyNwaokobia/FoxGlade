import * as THREE from "three";

/**
 * Blood pools left on the ground — same pooled/ring-buffer shape as
 * decals.ts's bullet holes, but flat (always normal-up; NPCs die standing on
 * roughly flat ground here, so a wall-orientation field would be dead weight)
 * and it FADES: unlike a bullet hole (evidence you were here, meant to
 * persist), a pool left mid-village during a still-running day shouldn't
 * outlive the scene forever. See bloodStainTexture() for the shape.
 */
export interface BloodStain {
  pos: THREE.Vector3; // world position, on the ground
  scale: number; // metres across
  twist: number; // random rotation, so pools aren't identical
  at: number; // performance.now spawned (very negative = unused)
}

export const MAX_BLOOD_STAINS = 20;

export const bloodStainPool: BloodStain[] = Array.from({ length: MAX_BLOOD_STAINS }, () => ({
  pos: new THREE.Vector3(),
  scale: 0.5,
  twist: 0,
  at: -1e9,
}));

let cursor = 0;

/** How long a pool lingers before it's fully faded (seconds). */
export const BLOOD_STAIN_LIFE_S = 22;
/** How much of that lifetime, at the tail, is spent fading out. */
export const BLOOD_STAIN_FADE_S = 4;

/** Record a blood pool — a big one on a kill, a smaller satellite splat otherwise. */
export function spawnBloodStain(pos: THREE.Vector3, scale: number) {
  const d = bloodStainPool[cursor];
  cursor = (cursor + 1) % MAX_BLOOD_STAINS;
  d.pos.copy(pos).setY(pos.y + 0.012); // clear the ground plane, no z-fight
  d.scale = scale;
  d.twist = Math.random() * Math.PI * 2;
  d.at = performance.now();
}

/**
 * An irregular dark-red pool, generated once and shared — a soft core with a
 * ragged edge (several overlapping off-centre blobs, not a clean circle: a
 * real spill isn't radially symmetric) fading fully transparent at the rim.
 * Same lazy-CanvasTexture technique as decals.ts's bullet hole.
 */
let _tex: THREE.CanvasTexture | null = null;
export function bloodStainTexture(): THREE.CanvasTexture {
  if (_tex) return _tex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2;
  const cy = s / 2;

  let seed = 7331;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };

  ctx.globalCompositeOperation = "source-over";
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const ang = (i / blobs) * Math.PI * 2 + rnd() * 0.8;
    const off = i === 0 ? 0 : s * 0.1 * rnd();
    const bx = cx + Math.cos(ang) * off;
    const by = cy + Math.sin(ang) * off;
    const r = s * (i === 0 ? 0.4 : 0.16 + rnd() * 0.16);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, "rgba(58,6,6,0.92)");
    g.addColorStop(0.5, "rgba(74,9,8,0.75)");
    g.addColorStop(0.8, "rgba(74,9,8,0.35)");
    g.addColorStop(1, "rgba(74,9,8,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A darker, glossier centre so it reads as liquid rather than a stain sticker.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.18);
  core.addColorStop(0, "rgba(30,3,3,0.85)");
  core.addColorStop(1, "rgba(30,3,3,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
  ctx.fill();

  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}
