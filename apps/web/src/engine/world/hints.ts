import * as THREE from "three";

/**
 * Treasure hints (DESIGN §2, §14.1) — now RESEEDED each chapter.
 *
 * These used to be four fixed positions baked in at module load: two real, two
 * decoys, in the same places every single run. That's fine for one 150-second
 * round and useless for the long day the game is now, where you bank a treasure
 * and go looking for the next one.
 *
 * So the array is a fixed-length set of SLOTS whose contents are rewritten by
 * `reseedHints()` between chapters. Keeping the length constant matters: the
 * per-hint arrays in `runtime` and the compass dots in the HUD are all sized to
 * it, and rewriting in place means none of that has to know reseeding happens.
 */
export type Rarity = "common" | "rare";

export interface Hint {
  pos: THREE.Vector3;
  real: boolean;
  rarity?: Rarity;
}

/**
 * Candidate treasure spots, hand-placed in nooks, courtyards and dead-ends right
 * across the village. Depth from the spawn gate ≈ rarity (DESIGN §7), so the
 * far-flung ones pay more.
 */
const SPOTS: { pos: [number, number]; rarity: Rarity }[] = [
  // Shallow / south — commons
  { pos: [12, 18], rarity: "common" },
  { pos: [-13, 17], rarity: "common" },
  { pos: [21.5, -15], rarity: "common" },
  { pos: [-24, 12], rarity: "common" },
  { pos: [6, 12], rarity: "common" },
  // Mid
  { pos: [23, 5], rarity: "common" },
  { pos: [-10, 3], rarity: "common" },
  { pos: [16, -8], rarity: "rare" },
  // Deep / north — rares
  { pos: [-9, -31], rarity: "rare" },
  { pos: [8, -33], rarity: "rare" },
  { pos: [-27, -20], rarity: "rare" },
  { pos: [28, -25], rarity: "rare" },
  { pos: [-20, -33], rarity: "rare" },
];

/** How many candidate pings are on the board at once (1 real + the rest decoys). */
export const HINT_SLOTS = 4;

/** The live board. Mutated in place by reseedHints — never reassigned. */
export const HINTS: Hint[] = Array.from({ length: HINT_SLOTS }, () => ({
  pos: new THREE.Vector3(),
  real: false,
  rarity: "common" as Rarity,
}));

/** Spots used recently, so consecutive chapters don't reuse the same nook. */
const recent: number[] = [];

/**
 * Lay out a fresh board. One slot is the real treasure; the rest are decoys.
 * `deep` biases toward the far (rare) spots — later chapters send you further
 * out, which is what makes pushing on before banking a real gamble.
 */
export function reseedHints(deep = false): void {
  const pool = SPOTS.map((_, i) => i).filter((i) => !recent.includes(i));
  const pick = (want?: Rarity): number => {
    const matching = pool.filter((i) => (want ? SPOTS[i].rarity === want : true));
    const from = matching.length ? matching : pool.length ? pool : SPOTS.map((_, i) => i);
    const idx = from[Math.floor(Math.random() * from.length)];
    const at = pool.indexOf(idx);
    if (at >= 0) pool.splice(at, 1);
    return idx;
  };

  const realIdx = pick(deep ? "rare" : undefined);
  const chosen = [realIdx];
  for (let s = 1; s < HINT_SLOTS; s++) chosen.push(pick());

  // Shuffle so the real one isn't always slot 0 (the compass would leak it).
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  for (let s = 0; s < HINT_SLOTS; s++) {
    const spot = SPOTS[chosen[s]];
    HINTS[s].pos.set(spot.pos[0], 0, spot.pos[1]);
    HINTS[s].real = chosen[s] === realIdx;
    HINTS[s].rarity = spot.rarity;
  }

  recent.length = 0;
  recent.push(...chosen);
}

/** Reset the recent-spots memory (new run). */
export function clearHintHistory(): void {
  recent.length = 0;
}

// Seed an opening board at module load so nothing reads empty slots.
reseedHints(false);

/** How close you must be to a hint to trigger its zone (real → claim, fake → dud). */
export const HINT_RADIUS = 3.5;
