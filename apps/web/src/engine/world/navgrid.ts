import * as THREE from "three";
import { COLLIDERS, VILLAGE } from "./village";

/**
 * A coarse navigation grid + A* over the walled village.
 *
 * Why this exists: local steering (probe a fan of headings, take the one that
 * makes most progress) is fine for nudging around a corner, but it cannot solve
 * a concave obstacle. Send the fox to a treasure with a building between them and
 * it walks to the wall, slides along it until sliding stops paying, and then
 * stands there — every direction available now increases the distance to the
 * goal, so a greedy agent is at a local minimum with no way out. Measured exactly
 * that: the fox pinned against a house 20m from where it was going.
 *
 * The fox physically running to the treasure is the whole point of the scout
 * mechanic, so it has to be reliable across the map, not usually-reliable. A grid
 * this small (72×72 cells) makes A* essentially free, and the path is only
 * recomputed when the goal changes or the route runs out.
 *
 * Steering still does the fine work BETWEEN waypoints — this just guarantees the
 * sequence of waypoints exists.
 */

const CELL = 1.0; // metres per cell
const HALF = VILLAGE.half;
const W = Math.ceil((HALF * 2) / CELL); // cells per axis
/** Agent clearance baked into the blocked map, so paths never hug a wall. */
const CLEARANCE = 0.45;

function toCell(v: number): number {
  return Math.floor((v + HALF) / CELL);
}
function toWorld(c: number): number {
  return c * CELL - HALF + CELL / 2;
}
function inBounds(ix: number, iz: number): boolean {
  return ix >= 0 && iz >= 0 && ix < W && iz < W;
}

/** Static blocked map, built once from the same colliders movement uses. */
const blocked: Uint8Array = (() => {
  const b = new Uint8Array(W * W);
  for (const c of COLLIDERS) {
    const minX = toCell(c.minX - CLEARANCE);
    const maxX = toCell(c.maxX + CLEARANCE);
    const minZ = toCell(c.minZ - CLEARANCE);
    const maxZ = toCell(c.maxZ + CLEARANCE);
    for (let iz = Math.max(0, minZ); iz <= Math.min(W - 1, maxZ); iz++) {
      for (let ix = Math.max(0, minX); ix <= Math.min(W - 1, maxX); ix++) {
        b[iz * W + ix] = 1;
      }
    }
  }
  return b;
})();

export function cellBlocked(ix: number, iz: number): boolean {
  return !inBounds(ix, iz) || blocked[iz * W + ix] === 1;
}

/** Nearest open cell to a world point (goals sometimes sit inside clearance). */
function nearestOpen(ix: number, iz: number): [number, number] | null {
  if (!cellBlocked(ix, iz)) return [ix, iz];
  for (let r = 1; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // ring only
        const nx = ix + dx;
        const nz = iz + dz;
        if (!cellBlocked(nx, nz)) return [nx, nz];
      }
    }
  }
  return null;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* between two world positions. Returns waypoints (world space, y=0) from the
 * step after `from` through to `to`, or null if there's no route.
 */
export function findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const start = nearestOpen(toCell(from.x), toCell(from.z));
  const goal = nearestOpen(toCell(to.x), toCell(to.z));
  if (!start || !goal) return null;
  const startIdx = start[1] * W + start[0];
  const goalIdx = goal[1] * W + goal[0];
  if (startIdx === goalIdx) return [to.clone()];

  const g = new Float32Array(W * W).fill(Infinity);
  const f = new Float32Array(W * W).fill(Infinity);
  const cameFrom = new Int32Array(W * W).fill(-1);
  const open: number[] = [startIdx];
  const inOpen = new Uint8Array(W * W);
  const closed = new Uint8Array(W * W);

  const h = (idx: number) => {
    const dx = Math.abs((idx % W) - goal[0]);
    const dz = Math.abs(Math.floor(idx / W) - goal[1]);
    // Octile distance — admissible for 8-way movement.
    return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };

  g[startIdx] = 0;
  f[startIdx] = h(startIdx);
  inOpen[startIdx] = 1;

  while (open.length) {
    // Small grid: a linear scan for the best node beats the complexity of a heap.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === goalIdx) break;
    closed[cur] = 1;

    const cx = cur % W;
    const cz = Math.floor(cur / W);
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (cellBlocked(nx, nz)) continue;
      // Don't cut a diagonal through a wall corner.
      if (dx !== 0 && dz !== 0 && (cellBlocked(cx + dx, cz) || cellBlocked(cx, cz + dz))) continue;
      const ni = nz * W + nx;
      if (closed[ni]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[ni]) {
        cameFrom[ni] = cur;
        g[ni] = tentative;
        f[ni] = tentative + h(ni);
        if (!inOpen[ni]) {
          open.push(ni);
          inOpen[ni] = 1;
        }
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && goalIdx !== startIdx) return null;

  const out: THREE.Vector3[] = [];
  let node = goalIdx;
  while (node !== -1 && node !== startIdx) {
    out.push(new THREE.Vector3(toWorld(node % W), 0, toWorld(Math.floor(node / W))));
    node = cameFrom[node];
  }
  out.reverse();
  if (out.length) out[out.length - 1].copy(to).setY(0); // finish exactly on the goal
  return out.length ? out : [to.clone()];
}
