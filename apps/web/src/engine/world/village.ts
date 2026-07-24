import * as THREE from "three";

/**
 * The walled village layout — data-driven so the space is easy to retune without
 * touching render code. Coordinates are metres; the player spawns at the south
 * edge and the treasure sits deep north (depth ≈ rarity, DESIGN §7). Buildings
 * are axis-aligned boxes, which keeps collision trivial (circle-vs-AABB).
 */

/** Which face of a building its door opening is on (N = -Z, S = +Z, E = +X, W = -X). */
export interface Door {
  side: "N" | "S" | "E" | "W";
  width?: number; // opening width (metres), default DOOR_W
}

export interface Building {
  x: number;
  z: number;
  w: number; // size along X
  d: number; // size along Z
  h: number; // height
  /** A doored building is ENTERABLE: hollow, four walls with a gap (§14.2). */
  door?: Door;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Box3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export const VILLAGE = {
  /** Half-extent of the square walled bounds (metres). */
  half: 36,
  spawn: new THREE.Vector3(0, 0, 30),
  spawnYaw: 0 as number, // 0 = facing north (-Z), into the village
  market: new THREE.Vector3(-22, 0, 5),
} as const;

/**
 * ORGANIC layout (§14.1): buildings scattered at irregular spacings and sizes —
 * alleys, nooks, and dead-ends rather than neat rows. A loose main route winds
 * north from the gate, a market plaza sits west, a shallow treasure courtyard
 * hides east, and the deep-north cluster guards the rare treasure nook.
 * (Boxes stay axis-aligned so collision remains trivial; rotated buildings come
 * with the art pass.) Five houses are enterable.
 */
export const BUILDINGS: Building[] = [
  // South cluster around the gate — staggered, not mirrored
  { x: -18, z: 24, w: 9, d: 7, h: 5 },
  { x: -7, z: 20, w: 6, d: 9, h: 6, door: { side: "E" } },
  { x: 9, z: 25, w: 12, d: 6, h: 4 },
  { x: 17, z: 15, w: 7, d: 7, h: 6 },

  // West market district (plaza stays open around [-22, 5])
  { x: -28, z: 14, w: 6, d: 10, h: 5 },
  { x: -26, z: -3, w: 9, d: 7, h: 6, door: { side: "S" } },
  { x: -14, z: 6, w: 7, d: 6, h: 5 },

  // Central weave — tight alleys and a bent main route
  { x: -3, z: 12, w: 8, d: 5, h: 6 },
  { x: 6, z: 6, w: 5, d: 8, h: 7 },
  { x: -6, z: -1, w: 6, d: 7, h: 4, door: { side: "E" } },
  { x: 3, z: -7, w: 9, d: 5, h: 5 },
  { x: 14, z: 1, w: 6, d: 6, h: 5 },

  // East courtyard hiding the shallow (common) treasure pocket
  { x: 23, z: -7, w: 8, d: 7, h: 6, door: { side: "W" } },
  { x: 28, z: -15, w: 6, d: 8, h: 5 },
  { x: 15, z: -16, w: 6, d: 6, h: 5 },

  // Deep-north cluster guarding the rare treasure nook, plus a backdrop wall
  { x: -12, z: -18, w: 8, d: 8, h: 6, door: { side: "S" } },
  { x: -2, z: -25, w: 7, d: 6, h: 7 },
  { x: 8, z: -27, w: 8, d: 7, h: 5 },
  { x: -20, z: -28, w: 9, d: 6, h: 5 },
  { x: 3, z: -33.5, w: 12, d: 3, h: 8 },

  // Micro-cover crates scattered along the routes
  { x: 0, z: 17, w: 2, d: 2, h: 1.5 },
  { x: -12, z: 12, w: 2, d: 2, h: 1.5 },
  { x: 10, z: -12, w: 2, d: 2, h: 1.5 },
  { x: -18, z: -10, w: 2, d: 2, h: 1.5 },
  { x: 25, z: 6, w: 2, d: 2, h: 1.5 },
  { x: -25, z: -14, w: 2, d: 2, h: 1.5 },
];

export const WALL_T = 0.35; // enterable-building wall thickness
export const DOOR_W = 2.0; // default door opening width

/** Enterable buildings (have a door) vs plain solid blocks. */
export const ENTERABLES: Building[] = BUILDINGS.filter((b) => b.door);
export const SOLIDS: Building[] = BUILDINGS.filter((b) => !b.door);

/**
 * The four wall strips of an enterable building, with the doored face split in
 * two around a centred opening. One data source drives render, movement
 * collision, projectile/LOS blocking, and camera collision — walls can't lie.
 */
export function wallSegments(b: Building): Box3[] {
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  const dw = b.door?.width ?? DOOR_W;
  const side = b.door?.side;
  const segs: Box3[] = [];

  const strip = (sMinX: number, sMaxX: number, sMinZ: number, sMaxZ: number) => {
    segs.push({ minX: sMinX, maxX: sMaxX, minY: 0, maxY: b.h, minZ: sMinZ, maxZ: sMaxZ });
  };
  const facedX = (sMinZ: number, sMaxZ: number, doored: boolean) => {
    // A wall running along X (N/S face).
    if (!doored) return strip(minX, maxX, sMinZ, sMaxZ);
    strip(minX, b.x - dw / 2, sMinZ, sMaxZ);
    strip(b.x + dw / 2, maxX, sMinZ, sMaxZ);
  };
  const facedZ = (sMinX: number, sMaxX: number, doored: boolean) => {
    // A wall running along Z (E/W face).
    if (!doored) return strip(sMinX, sMaxX, minZ, maxZ);
    strip(sMinX, sMaxX, minZ, b.z - dw / 2);
    strip(sMinX, sMaxX, b.z + dw / 2, maxZ);
  };
  facedX(minZ, minZ + WALL_T, side === "N");
  facedX(maxZ - WALL_T, maxZ, side === "S");
  facedZ(minX, minX + WALL_T, side === "W");
  facedZ(maxX - WALL_T, maxX, side === "E");
  return segs;
}

/**
 * World-space centre + outward normal of an enterable building's door opening,
 * for rendering doorway markers (frame, threshold, glow). Null if no door.
 */
export function doorOpening(b: Building): { cx: number; cz: number; nx: number; nz: number; width: number } | null {
  if (!b.door) return null;
  const width = b.door.width ?? DOOR_W;
  switch (b.door.side) {
    case "N":
      return { cx: b.x, cz: b.z - b.d / 2 + WALL_T / 2, nx: 0, nz: -1, width };
    case "S":
      return { cx: b.x, cz: b.z + b.d / 2 - WALL_T / 2, nx: 0, nz: 1, width };
    case "W":
      return { cx: b.x - b.w / 2 + WALL_T / 2, cz: b.z, nx: -1, nz: 0, width };
    case "E":
      return { cx: b.x + b.w / 2 - WALL_T / 2, cz: b.z, nx: 1, nz: 0, width };
  }
}

/** Roof slab of an enterable building — blocks sight/camera/bombs from above. */
export function roofBox(b: Building): Box3 {
  return {
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minY: b.h,
    maxY: b.h + 0.4,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  };
}

const ENTERABLE_WALLS: Box3[] = ENTERABLES.flatMap(wallSegments);

/** Interior footprints of the enterable buildings (inside the walls). */
export const INTERIORS: Rect[] = ENTERABLES.map((b) => ({
  minX: b.x - b.w / 2 + WALL_T,
  maxX: b.x + b.w / 2 - WALL_T,
  minZ: b.z - b.d / 2 + WALL_T,
  maxZ: b.z + b.d / 2 - WALL_T,
}));

/** Is this ground position inside any enterable building (sheltered)? */
export function insideInterior(x: number, z: number): boolean {
  for (const r of INTERIORS) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
  }
  return false;
}

/**
 * AABB colliders for movement (perimeter is handled by bounds clamp): solid
 * buildings as whole footprints, enterable ones as their wall strips so you can
 * walk in through the door.
 */
export const COLLIDERS: Rect[] = [
  ...SOLIDS.map((b) => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  })),
  ...ENTERABLE_WALLS.map((s) => ({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ })),
];

const H = VILLAGE.half;
const WALL_H = 3;

/**
 * 3D boxes (buildings + perimeter walls) for the camera-collision raycast,
 * projectile blocking, and NPC line-of-sight. Enterable buildings contribute
 * their wall strips + roof slab, so ducking inside genuinely breaks LOS.
 */
export const BOXES3D: Box3[] = [
  ...SOLIDS.map((b) => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minY: 0,
    maxY: b.h,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  })),
  ...ENTERABLE_WALLS,
  ...ENTERABLES.map(roofBox),
  { minX: -H, maxX: H, minY: 0, maxY: WALL_H, minZ: -H - 0.3, maxZ: -H + 0.3 },
  { minX: -H, maxX: H, minY: 0, maxY: WALL_H, minZ: H - 0.3, maxZ: H + 0.3 },
  { minX: -H - 0.3, maxX: -H + 0.3, minY: 0, maxY: WALL_H, minZ: -H, maxZ: H },
  { minX: H - 0.3, maxX: H + 0.3, minY: 0, maxY: WALL_H, minZ: -H, maxZ: H },
];
