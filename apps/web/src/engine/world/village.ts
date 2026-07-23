import * as THREE from "three";

/**
 * The walled village layout — data-driven so the space is easy to retune without
 * touching render code. Coordinates are metres; the player spawns at the south
 * edge and the treasure sits deep north (depth ≈ rarity, DESIGN §7). Buildings
 * are axis-aligned boxes, which keeps collision trivial (circle-vs-AABB).
 */

export interface Building {
  x: number;
  z: number;
  w: number; // size along X
  d: number; // size along Z
  h: number; // height
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
  treasure: new THREE.Vector3(0, 0, -28),
  market: new THREE.Vector3(-24, 0, 6),
} as const;

/**
 * Buildings laid out to form a central approach from spawn to the treasure with
 * side streets and a western market plaza — so there's more than one route and
 * plenty of chokepoints/sightlines for NPCs to occupy later (M2).
 */
export const BUILDINGS: Building[] = [
  // Spawn-side flanks (leave a central corridor)
  { x: -16, z: 22, w: 12, d: 8, h: 5 },
  { x: 16, z: 22, w: 12, d: 8, h: 5 },

  // Second ring with a small central blocker to force an early weave
  { x: -13, z: 10, w: 8, d: 8, h: 6 },
  { x: 13, z: 10, w: 10, d: 8, h: 6 },
  { x: 0, z: 13, w: 6, d: 4, h: 4 },

  // Western market district (frames the open market plaza at [-24, 6])
  { x: -24, z: -5, w: 10, d: 8, h: 6 },
  { x: -31, z: 13, w: 6, d: 12, h: 5 },

  // Mid blocks (central gap ~9m wide stays walkable)
  { x: -8, z: -2, w: 8, d: 8, h: 5 },
  { x: 11, z: -4, w: 10, d: 9, h: 7 },

  // Deep ring guarding the treasure, plus a backdrop wall behind it
  { x: -14, z: -20, w: 9, d: 8, h: 6 },
  { x: 14, z: -20, w: 9, d: 8, h: 6 },
  { x: 0, z: -33, w: 16, d: 6, h: 8 },

  // Micro-cover crates near chokepoints
  { x: 0, z: 1, w: 2, d: 2, h: 1.5 },
  { x: -4, z: -13, w: 2, d: 2, h: 1.5 },
  { x: 6, z: -12, w: 2, d: 2, h: 1.5 },
];

/** AABB colliders derived from the buildings (perimeter is handled by bounds clamp). */
export const COLLIDERS: Rect[] = BUILDINGS.map((b) => ({
  minX: b.x - b.w / 2,
  maxX: b.x + b.w / 2,
  minZ: b.z - b.d / 2,
  maxZ: b.z + b.d / 2,
}));

const H = VILLAGE.half;
const WALL_H = 3;

/**
 * 3D boxes (buildings + perimeter walls) for the camera-collision raycast, so
 * the camera pulls in when a wall comes between it and the player instead of
 * clipping inside geometry.
 */
export const BOXES3D: Box3[] = [
  ...BUILDINGS.map((b) => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minY: 0,
    maxY: b.h,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  })),
  { minX: -H, maxX: H, minY: 0, maxY: WALL_H, minZ: -H - 0.3, maxZ: -H + 0.3 },
  { minX: -H, maxX: H, minY: 0, maxY: WALL_H, minZ: H - 0.3, maxZ: H + 0.3 },
  { minX: -H - 0.3, maxX: -H + 0.3, minY: 0, maxY: WALL_H, minZ: -H, maxZ: H },
  { minX: H - 0.3, maxX: H + 0.3, minY: 0, maxY: WALL_H, minZ: -H, maxZ: H },
];
