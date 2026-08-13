import { makeGunMesh } from "@/engine/character/GunMesh";
import type { WeaponId } from "@/engine/config/shop";
import { renderThumb } from "./renderThumb";

/**
 * Renders each gun to an image once, for the shop cards.
 *
 * The armoury shipped with emoji: the Sidearm, the SMG and the Assault Rifle all
 * used the same green water-pistol glyph, so the one screen in the game whose
 * entire job is "choose between these weapons" showed three identical pictures.
 * Meanwhile the engine already builds every one of these guns procedurally, with
 * its own silhouette and its own accent colour, for the character to hold.
 *
 * So the cards just show the actual gun, shot through the shared studio
 * renderer (renderThumb.ts) — no per-card WebGL context, no live canvases in
 * the overlay, and the cost is a handful of one-off draws the first time the
 * market is opened.
 */
const cache = new Map<string, string>();

/**
 * A data-URL PNG of `gunId`, or null if WebGL isn't available. Cached, so
 * repeated calls (re-renders, reopening the shop) are free.
 */
export function weaponThumb(gunId: WeaponId): string | null {
  return renderThumb(cache, gunId, () => makeGunMesh(gunId));
}
