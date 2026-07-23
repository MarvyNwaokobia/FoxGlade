import * as THREE from "three";
import type { Rect, Box3 } from "./village";

/**
 * Resolve a circle (the player, radius `r`) out of any axis-aligned box it
 * overlaps, mutating `p` in place. Uses the closest-point-on-AABB method; when
 * the centre is inside a box it ejects along the nearest edge. Called every
 * frame after integration, so the player slides along walls rather than passing
 * through them.
 */
export function resolveColliders(p: THREE.Vector3, r: number, colliders: Rect[]) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;

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
}

/**
 * Cast the segment origin→target against the boxes and return the fraction
 * (0..1) of the earliest entry, or 1 if the segment is clear. Slab method.
 * Used for camera collision: if something is between the player and the camera,
 * the camera is pulled in to that fraction so it never sits inside a wall.
 */
export function raycastBoxes(origin: THREE.Vector3, target: THREE.Vector3, boxes: Box3[]): number {
  const d = [target.x - origin.x, target.y - origin.y, target.z - origin.z];
  const o = [origin.x, origin.y, origin.z];
  let nearest = 1;

  for (const b of boxes) {
    const lo = [b.minX, b.minY, b.minZ];
    const hi = [b.maxX, b.maxY, b.maxZ];
    let tmin = 0;
    let tmax = 1;
    let hit = true;

    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
        if (o[a] < lo[a] || o[a] > hi[a]) {
          hit = false;
          break;
        }
      } else {
        let t1 = (lo[a] - o[a]) / d[a];
        let t2 = (hi[a] - o[a]) / d[a];
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
    }

    if (hit && tmin >= 0 && tmin < nearest) nearest = tmin;
  }

  return nearest;
}
