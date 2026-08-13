import { buildItemModel } from "./itemModels";
import { renderThumb } from "./renderThumb";

/**
 * Renders each non-weapon shop item to an image once, through the same
 * studio pipeline as weaponThumb.ts. Replaces the earlier flat SVG icon
 * set — those read as illustrated/cartoonish next to the real gun renders;
 * these are the same kind of PBR-lit 3D object, just leather and brass
 * instead of steel and polymer.
 */
const cache = new Map<string, string>();

/** A data-URL PNG for `itemId`, or null (no model for this item, or no WebGL). */
export function itemThumb(itemId: string): string | null {
  // Check the cache ourselves before building — buildItemModel() constructs
  // fresh geometry every call, and renderThumb's own cache check happens
  // after its `build` callback would already need one to pass in.
  const hit = cache.get(itemId);
  if (hit) return hit;
  const model = buildItemModel(itemId);
  if (!model) return null;
  return renderThumb(cache, itemId, () => model, { reachScale: 0.58 });
}
