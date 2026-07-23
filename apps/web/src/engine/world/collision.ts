import * as THREE from "three";
import type { Rect } from "./village";

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
