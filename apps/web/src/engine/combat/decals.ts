import * as THREE from "three";

/**
 * Bullet-hole decals: a small scorched mark left on a wall you shot, flush
 * against the surface. Pooled + ring-buffered exactly like shotfx.ts's Shot
 * pool — DecalFX reads this array and poses a fixed set of planes, no
 * per-decal mounts. Unlike a shot, a decal is meant to persist (that's the
 * point — it's evidence you were here), so slots are only ever reclaimed by
 * the ring buffer wrapping, not by age.
 */
export interface Decal {
  pos: THREE.Vector3; // world position, ON the surface
  normal: THREE.Vector3; // outward face normal — orients the billboard flush
  twist: number; // random rotation around the normal, so marks aren't identical
  at: number; // performance.now spawned (very negative = unused) — drives the fade-in pop
}

export const MAX_DECALS = 24;

export const decalPool: Decal[] = Array.from({ length: MAX_DECALS }, () => ({
  pos: new THREE.Vector3(),
  normal: new THREE.Vector3(0, 0, 1),
  twist: 0,
  at: -1e9,
}));

let cursor = 0;

/** Record a wall hit for the DecalFX layer to draw from this frame onward. */
export function spawnDecal(pos: THREE.Vector3, normal: THREE.Vector3) {
  const d = decalPool[cursor];
  cursor = (cursor + 1) % MAX_DECALS;
  // Nudge off the surface so the plane never z-fights the wall it's stuck to.
  d.pos.copy(pos).addScaledVector(normal, 0.015);
  d.normal.copy(normal);
  d.twist = Math.random() * Math.PI * 2;
  d.at = performance.now();
}

/**
 * A scorched bullet-hole mark, generated once and shared — dark crater centre,
 * a singed halo, and a few radiating crack lines, fading to fully transparent
 * at the rim. Same CanvasTexture technique softShadow.ts already uses for the
 * player's contact shadow; no image asset, no license, no download.
 */
let _tex: THREE.CanvasTexture | null = null;
export function bulletHoleTexture(): THREE.CanvasTexture {
  if (_tex) return _tex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2;
  const cy = s / 2;

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  g.addColorStop(0, "rgba(12,9,7,0.95)");
  g.addColorStop(0.22, "rgba(20,14,10,0.85)");
  g.addColorStop(0.45, "rgba(40,26,17,0.55)");
  g.addColorStop(0.75, "rgba(40,26,17,0.18)");
  g.addColorStop(1, "rgba(40,26,17,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  // A few short radiating fractures cracking out from the crater, deterministic
  // so the texture is stable across rebuilds.
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };
  ctx.strokeStyle = "rgba(15,10,7,0.5)";
  ctx.lineWidth = 1.4;
  const cracks = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < cracks; i++) {
    const ang = (i / cracks) * Math.PI * 2 + rnd() * 0.6;
    const len = s * (0.16 + rnd() * 0.22);
    const x0 = cx + Math.cos(ang) * s * 0.08;
    const y0 = cy + Math.sin(ang) * s * 0.08;
    const midAng = ang + (rnd() - 0.5) * 0.5;
    const x1 = cx + Math.cos(midAng) * len * 0.6;
    const y1 = cy + Math.sin(midAng) * len * 0.6;
    const x2 = cx + Math.cos(ang) * len;
    const y2 = cy + Math.sin(ang) * len;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.stroke();
  }

  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}
