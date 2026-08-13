import * as THREE from "three";
import type { Rect, Box3 } from "./village";

/**
 * Resolve a circle (the player, radius `r`) out of any axis-aligned box it
 * overlaps, mutating `p` in place. Uses the closest-point-on-AABB method; when
 * the centre is inside a box it ejects along the nearest edge. Called every
 * frame after integration, so the player slides along walls rather than passing
 * through them.
 *
 * Runs the push-out pass several times rather than once. A single pass corrects
 * against each collider independently, so near a building CORNER — where two
 * wall segments or two building boxes sit close together, which is every corner
 * in the village and especially the deliberately tight alleys — resolving out of
 * box A can push the circle back into box B and vice versa, leaving it straddling
 * both. That reads as "half in the building, half out." Repeating the pass lets
 * the position converge to a spot clear of every box; it stops early once a full
 * pass makes no correction, so the common case (nothing nearby) stays one pass.
 */
export function resolveColliders(p: THREE.Vector3, r: number, colliders: Rect[]) {
  const ITERATIONS = 4;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let corrected = false;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;

      corrected = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = r - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
      } else {
        // Centre inside the box — eject along the shallowest edge.
        const toLeft = p.x - c.minX;
        const toRight = c.maxX - p.x;
        const toBack = p.z - c.minZ;
        const toFront = c.maxZ - p.z;
        const minPen = Math.min(toLeft, toRight, toBack, toFront);
        if (minPen === toLeft) p.x = c.minX - r;
        else if (minPen === toRight) p.x = c.maxX + r;
        else if (minPen === toBack) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      }
    }
    if (!corrected) break;
  }
}

/**
 * Cast the segment origin→target against the boxes and return the fraction
 * (0..1) of the earliest entry, or 1 if the segment is clear. Slab method.
 * Used for camera collision: if something is between the player and the camera,
 * the camera is pulled in to that fraction so it never sits inside a wall.
 *
 * `outNormal`, if given, is set to the outward face normal of whichever box
 * produced the nearest entry (a bullet-impact decal needs this to sit flush
 * against the wall it hit) — untouched when nothing is hit. Optional and
 * unused by the existing camera-collision callers, so this stays a pure
 * addition to the one function rather than a second near-duplicate.
 */
export function raycastBoxes(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  boxes: Box3[],
  outNormal?: THREE.Vector3
): number {
  const d = [target.x - origin.x, target.y - origin.y, target.z - origin.z];
  const o = [origin.x, origin.y, origin.z];
  let nearest = 1;
  let nearestAxis = -1;
  let nearestSign = 0;

  for (const b of boxes) {
    const lo = [b.minX, b.minY, b.minZ];
    const hi = [b.maxX, b.maxY, b.maxZ];
    let tmin = 0;
    let tmax = 1;
    let hit = true;
    let entryAxis = -1;
    let entrySign = 0;

    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
        if (o[a] < lo[a] || o[a] > hi[a]) {
          hit = false;
          break;
        }
      } else {
        let t1 = (lo[a] - o[a]) / d[a];
        let t2 = (hi[a] - o[a]) / d[a];
        // Entering through the lo face means d[a] > 0 (t1 kept its lo-face
        // formula); entering through hi means d[a] < 0 (t1/t2 got swapped) —
        // either way the outward normal opposes the travel direction on axis a.
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) {
          tmin = t1;
          entryAxis = a;
          entrySign = d[a] > 0 ? -1 : 1;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
    }

    if (hit && tmin >= 0 && tmin < nearest) {
      nearest = tmin;
      nearestAxis = entryAxis;
      nearestSign = entrySign;
    }
  }

  if (outNormal && nearestAxis >= 0) {
    outNormal.set(0, 0, 0);
    if (nearestAxis === 0) outNormal.x = nearestSign;
    else if (nearestAxis === 1) outNormal.y = nearestSign;
    else outNormal.z = nearestSign;
  }

  return nearest;
}
