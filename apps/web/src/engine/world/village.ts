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
  /** "market" = the open-air marketplace enclosure (walls + gate, no roof, stalls
   *  inside). Rendered specially and a no-combat safe zone like any interior. */
  kind?: "market";
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
  market: new THREE.Vector3(-19, 0, 7), // shop trigger inside the market enclosure
  /** Vault pad inside the bank building (the enterable house on the plaza). */
  bank: new THREE.Vector3(-26, 0, -4.5),
  /**
   * HOME. Every day starts here, in this room, rather than out at the gate.
   *
   * The day is a loop now — go out, find treasure, bank it, come back and sleep
   * — and a loop wants a place you return TO. Waking in a room you recognise and
   * stepping out of your own door is what makes the morning read as a morning
   * instead of a respawn.
   *
   * It's the house just inside the south gate, whose door faces east onto the
   * main street, so the first thing you see on stepping out is the village.
   */
  home: new THREE.Vector3(-6.6, 0, 20),
  /** Facing the door (east, +X) on waking, so the way out is already in view. */
  homeYaw: -Math.PI / 2,
  /**
   * Where the guardian waits, a couple of metres out from your door and off to
   * one side of it. Not a spawn point — it stands here from the first frame of
   * the day, so stepping outside is meeting someone who was already there.
   */
  guardianPost: new THREE.Vector3(-0.5, 0, 21.2),
} as const;

/**
 * ORGANIC layout (§14.1): buildings scattered at irregular spacings and sizes —
 * alleys, nooks, and dead-ends rather than neat rows. A loose main route winds
 * north from the gate, a market plaza sits west, a shallow treasure courtyard
 * hides east, and the deep-north cluster guards the rare treasure nook.
 * (Boxes stay axis-aligned so collision remains trivial; rotated buildings come
 * with the art pass.)
 *
 * Only three buildings are enterable, and only one is a furnished "house":
 * HOME (your bedroom), the bank (the vault), and the market (an open-air
 * enclosure, not a room). Every other building is a solid block — a village
 * of identical walk-in houses read as a maze of empty rooms, not a home you
 * come back to.
 */
export const BUILDINGS: Building[] = [
  // South cluster around the gate — staggered, not mirrored
  { x: -18, z: 24, w: 9, d: 7, h: 5 },
  { x: -7, z: 20, w: 6, d: 9, h: 6, door: { side: "E" } },
  { x: 9, z: 25, w: 12, d: 6, h: 4 },
  { x: 17, z: 15, w: 7, d: 7, h: 6 },

  // West district: the BANK (enterable) + the open-air MARKETPLACE enclosure.
  // The market is a big walled square with a wide south gate — impenetrable walls,
  // stalls inside, no roof — and a no-combat safe zone (interior → sheltered).
  { x: -26, z: -3, w: 9, d: 7, h: 6, door: { side: "S" } }, // bank
  { x: -19, z: 9, w: 15, d: 12, h: 3.4, door: { side: "S", width: 4 }, kind: "market" },

  // Central weave — tight alleys and a bent main route
  { x: -3, z: 12, w: 8, d: 5, h: 6 },
  { x: 6, z: 6, w: 5, d: 8, h: 7 },
  { x: -6, z: -1, w: 6, d: 7, h: 4 },
  { x: 3, z: -7, w: 9, d: 5, h: 5 },
  { x: 14, z: 1, w: 6, d: 6, h: 5 },

  // East courtyard hiding the shallow (common) treasure pocket
  { x: 23, z: -7, w: 8, d: 7, h: 6 },
  { x: 28, z: -15, w: 6, d: 8, h: 5 },
  { x: 15, z: -16, w: 6, d: 6, h: 5 },

  // Deep-north cluster guarding the rare treasure nook, plus a backdrop wall
  { x: -12, z: -18, w: 8, d: 8, h: 6 },
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
 * Which enterable is HOME. Derived from the position rather than hard-coded to
 * an index, because ENTERABLES is a filter over BUILDINGS and inserting one
 * doored house above it would silently make somebody else's kitchen your bedroom.
 */
export const HOME_INDEX: number = ENTERABLES.findIndex(
  (b) =>
    Math.abs(b.x - VILLAGE.home.x) <= b.w / 2 && Math.abs(b.z - VILLAGE.home.z) <= b.d / 2
);

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

/** Index (into ENTERABLES/INTERIORS) of the enterable building at this position, or -1. */
export function interiorIndexAt(x: number, z: number): number {
  for (let i = 0; i < INTERIORS.length; i++) {
    const r = INTERIORS[i];
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return i;
  }
  return -1;
}

/** Is this ground position inside any enterable building (sheltered)? */
export function insideInterior(x: number, z: number): boolean {
  return interiorIndexAt(x, z) >= 0;
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

/** Anything shorter than this is chest-high cover: vaultable, and invisible to
 *  the camera's collision ray. */
export const LOW_COVER_H = 1.8;

/**
 * Boxes the CAMERA collides with — the same world MINUS chest-high cover.
 *
 * The camera used to test against every box, so backing up to a 1.5 m crate
 * pulled the lens right against its face and a bright plank slab filled a third
 * of the screen. A camera at eye height has no business being stopped by
 * something it can see over; it rides above the cover instead. Shots, sightlines
 * and movement all still use the full BOXES3D, so cover is still cover.
 */
export const CAMERA_BOXES: Box3[] = BOXES3D.filter((b) => b.maxY >= LOW_COVER_H);

/** Chest-high cover blocks, as footprints — the things you can vault. */
export const LOW_COVER: Building[] = SOLIDS.filter((b) => b.h < LOW_COVER_H);

export interface VaultTarget {
  /** Where the player lands, clear of the far side. */
  landX: number;
  landZ: number;
  /** Apex height of the hurdle arc. */
  peakY: number;
}

/**
 * Is there chest-high cover close enough ahead to hurdle? Returns where you'd
 * land, or null.
 *
 * The obstacle has to be genuinely in front (within a ~50° cone of travel) and
 * within reach, and the landing spot has to be clear — vaulting into a wall, or
 * onto another crate, would be worse than being stopped by it.
 */
export function vaultTarget(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  radius: number,
  reach = 1.15
): VaultTarget | null {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-4) return null;
  const nx = dirX / len;
  const nz = dirZ / len;

  for (const b of LOW_COVER) {
    const halfW = b.w / 2;
    const halfD = b.d / 2;
    // Closest point on the footprint to the player.
    const cx = Math.max(b.x - halfW, Math.min(x, b.x + halfW));
    const cz = Math.max(b.z - halfD, Math.min(z, b.z + halfD));
    const dx = cx - x;
    const dz = cz - z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach + radius) continue;
    // Must be ahead of us, not beside or behind.
    if (dist > 1e-4 && (dx / dist) * nx + (dz / dist) * nz < 0.64) continue;

    // Carry on through the box and out the far side, plus clearance.
    const span = Math.abs(nx) * b.w + Math.abs(nz) * b.d;
    const landX = x + nx * (dist + span + radius + 0.35);
    const landZ = z + nz * (dist + span + radius + 0.35);
    if (Math.abs(landX) > H - radius || Math.abs(landZ) > H - radius) continue;
    // Don't hurdle into something solid.
    let blocked = false;
    for (const c of COLLIDERS) {
      if (
        landX > c.minX - radius &&
        landX < c.maxX + radius &&
        landZ > c.minZ - radius &&
        landZ < c.maxZ + radius
      ) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    return { landX, landZ, peakY: b.h + 0.35 };
  }
  return null;
}
