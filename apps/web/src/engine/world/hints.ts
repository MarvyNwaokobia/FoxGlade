import * as THREE from "three";
import { FLAVOR_COUNT } from "./treasureTell";

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
  /** Which treasure "look" this dig shows (coins/bars/goblets — see
   *  VillageMesh.tsx's HintBeacon). Tied to the SPOT, not to real/decoy — a
   *  fake dig has to look exactly as promising as a real one. */
  flavor: number;
}

/**
 * Candidate treasure spots, hand-placed in nooks, courtyards and dead-ends right
 * across the village. Depth from the spawn gate ≈ rarity (DESIGN §7), so the
 * far-flung ones pay more.
 *
 * Expanded from the original 13 to 34 (Marvy's call, 2026-08-14: with only 13
 * nooks and a "recent" memory of just one board, the same handful of spots —
 * especially the 6 deep/rare ones — cycled back around fast enough to feel
 * static, same place today as yesterday). Every new spot was placed and then
 * verified against the real building footprints in village.ts (≥1.5m
 * clearance), the village walls (≥2.5m), the named triggers (home/bank/
 * market/gate), and every other spot (≥6.5m) — see the generator this list
 * came from if the layout ever needs redoing (not checked in; ask if needed).
 */
const SPOTS: { pos: [number, number]; rarity: Rarity }[] = [
  // Shallow / south — commons (original set, minus one that clipped a building)
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
  { pos: [-27, -20], rarity: "rare" },
  { pos: [28, -25], rarity: "rare" },
  { pos: [-20, -33], rarity: "rare" },

  // New commons
  { pos: [-25, 2.5], rarity: "common" },
  { pos: [25, 14], rarity: "common" },
  { pos: [-30, 27.5], rarity: "common" },
  { pos: [11.5, 30], rarity: "common" },
  { pos: [-15, 7.5], rarity: "common" },
  { pos: [-31, 6], rarity: "common" },
  { pos: [29.5, 5.5], rarity: "common" },
  { pos: [0, 8], rarity: "common" },
  { pos: [4.5, 19], rarity: "common" },
  { pos: [-13.5, 31.5], rarity: "common" },

  // New rares
  { pos: [-14, -12.5], rarity: "rare" },
  { pos: [7, -1], rarity: "rare" },
  { pos: [-23, -7.5], rarity: "rare" },
  { pos: [-3.5, -20.5], rarity: "rare" },
  { pos: [10, -19], rarity: "rare" },
  { pos: [15, -24.5], rarity: "rare" },
  { pos: [20.5, -30], rarity: "rare" },
  { pos: [-27, -27.5], rarity: "rare" },
  { pos: [-0.5, -30], rarity: "rare" },
  { pos: [1, -15], rarity: "rare" },
  { pos: [22, -22], rarity: "rare" },
  { pos: [30.5, -4], rarity: "rare" },
];

/** How many candidate pings are on the board at once (1 real + the rest decoys). */
export const HINT_SLOTS = 4;

/** The live board. Mutated in place by reseedHints — never reassigned. */
export const HINTS: Hint[] = Array.from({ length: HINT_SLOTS }, () => ({
  pos: new THREE.Vector3(),
  real: false,
  rarity: "common" as Rarity,
  flavor: 0,
}));

/**
 * Spots used recently, oldest first, so a reseed doesn't reuse a nook you were
 * just at — a ROLLING window now (Marvy's call, 2026-08-14), not just the last
 * board. One board's worth of memory meant a 13-spot pool cycled back to the
 * same handful within a day or two; keeping the last few boards' worth excluded,
 * against a pool nearly 3x the old size, is what actually makes "not the same
 * place you found it yesterday" true rather than a coin flip.
 */
const recent: number[] = [];
const RECENT_CAP = HINT_SLOTS * 3;

/** Sub-metre scatter so reusing a nook still doesn't look pixel-identical to
 *  last time — a real dig site, not a marker snapping to a grid point. Small
 *  enough to stay inside every spot's verified 1.5m building clearance. */
const JITTER = 0.9;

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
    const jx = (Math.random() * 2 - 1) * JITTER;
    const jz = (Math.random() * 2 - 1) * JITTER;
    HINTS[s].pos.set(spot.pos[0] + jx, 0, spot.pos[1] + jz);
    HINTS[s].real = chosen[s] === realIdx;
    HINTS[s].rarity = spot.rarity;
    // Tied to which SPOT this is (not the roll of real/decoy), so the same
    // nook tends to show the same treasure "look" — real vs decoy stays
    // undecidable by appearance alone.
    HINTS[s].flavor = chosen[s] % FLAVOR_COUNT;
  }

  recent.push(...chosen);
  while (recent.length > RECENT_CAP) recent.shift();
}

/** Reset the recent-spots memory (new run). */
export function clearHintHistory(): void {
  recent.length = 0;
}

// Seed an opening board at module load so nothing reads empty slots.
reseedHints(false);

/** How close you must be to a hint to trigger its zone (real → claim, fake → dud). */
export const HINT_RADIUS = 3.5;
