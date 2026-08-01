import * as THREE from "three";

/**
 * A soft radial-gradient blob texture for character/fox contact shadows — dark in
 * the middle, fading to transparent at the edge, so the shadow reads as a soft
 * pool instead of a hard black disc. Built once, lazily (needs the DOM), and shared.
 */
let _tex: THREE.CanvasTexture | null = null;
export function softShadowTexture(): THREE.CanvasTexture {
  if (_tex) return _tex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.32)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

/**
 * A soft-circle ALPHA mask (opaque centre → transparent rim) so ground decals like
 * dirt patches fade into the surrounding cobblestone instead of ending in a hard
 * circle edge (which read as artificial "sandboxes"). three's alphaMap samples the
 * green channel, so this is white→black, not white→transparent.
 */
let _alpha: THREE.CanvasTexture | null = null;
export function softCircleAlpha(): THREE.CanvasTexture {
  if (_alpha) return _alpha;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _alpha = new THREE.CanvasTexture(c);
  _alpha.colorSpace = THREE.NoColorSpace; // data, not colour — clean alpha falloff
  return _alpha;
}
