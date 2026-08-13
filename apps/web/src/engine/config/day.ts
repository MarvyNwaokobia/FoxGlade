/**
 * The run as a DAY, not a stopwatch (Marvy's call, Phase 5).
 *
 * There used to be a 150-second countdown. A countdown is a punishment you read
 * off a number; a sun going down is a journey you feel. Replacing one with the
 * other fixes the structural problem flagged back in the first review — five
 * systems all shouting at a new player inside two and a half minutes — because
 * the day can be divided into CHAPTERS that each introduce exactly one thing.
 *
 * The clock is driven mostly by YOU: banking a treasure advances the day. So the
 * pacing is a decision, not a timer. Push for one more treasure before banking
 * and you keep the light; bank often and night comes quickly but you keep what
 * you've earned. Time also creeps forward on its own so dawdling isn't free.
 */

export interface Chapter {
  /** Shown on the HUD. */
  name: string;
  /** One-line brief — what this stretch of the day is teaching. */
  brief: string;
  /** Where the sun sits when this chapter begins (0 = dawn, 1 = full night). */
  dayAt: number;
  /** Are any villagers lying yet? Early chapters are honest on purpose: you learn
   *  to trust people, and only then does the game start betraying that. */
  liars: boolean;
  /** Are thieves racing you for the treasure? */
  thieves: boolean;
}

/**
 * One new system per chapter. Dawn has no combat at all — it exists purely so
 * a first-time player can find their footing, get the guardian's briefing, and
 * take their first few steps without being shot at. That breather is
 * deliberately BRIEF now (Marvy's call, 2026-08-13): a few seconds of real
 * time or your first bank, not the better part of a chapter — blockers should
 * feel like they're already out there the moment you're properly moving, not
 * something that shows up long after you've started exploring.
 */
export const CHAPTERS: Chapter[] = [
  { name: "Dawn",      brief: "Find the first treasure. Bank it at the vault.", dayAt: 0.00, liars: false, thieves: false },
  { name: "Morning",   brief: "Armed blockers are awake now.",                   dayAt: 0.02, liars: false, thieves: false },
  { name: "Afternoon", brief: "Not everyone in the village tells the truth.",    dayAt: 0.40, liars: true,  thieves: false },
  { name: "Dusk",      brief: "Thieves are racing you for what's left.",         dayAt: 0.62, liars: true,  thieves: true },
  { name: "Night",     brief: "Last of the light. Take what you can.",           dayAt: 0.82, liars: true,  thieves: true },
];

export const DAY = {
  /** Seconds of real time for the sun to cross the whole sky UNAIDED. Long: the
   *  day is meant to be pushed along by banking, with idle drift as a backstop
   *  so standing still still costs you light. */
  driftSeconds: 420,
  /** How much of the day a single banked treasure burns. Roughly a chapter. */
  bankAdvance: 0.2,
  /** How much of the day a thief costs you when it gets clean away. Less than a
   *  bank (you gained nothing), but enough that losing one hurts. */
  theftPenalty: 0.09,
  /** Past this the run is over — the light has gone. */
  nightfall: 1.0,
} as const;

/**
 * How many treasures must be RESOLVED — banked by you, or lost to a thief —
 * before the day is spent (DESIGN §14.10). This is the difficulty curve now,
 * not just more blockers.
 *
 * Day 1 used to ask for a single treasure, which meant the day was over the
 * instant you banked it — no room for a chapter to actually turn over, for
 * blockers or thieves to contest anything, or even for the chapter-change
 * instruction banner to be read before the day-over overlay buried it
 * (Marvy's call, 2026-08-13: the day was ending before anything had a chance
 * to happen). Starting at 3 and climbing to a cap of 8 gives every day enough
 * runway to actually pass through Morning → Afternoon → Dusk.
 */
export function treasuresForDay(day: number): number {
  return Math.min(day + 2, 8);
}

/**
 * Splits the day's total quota across the three chapters that actually ask you
 * to go find something — Morning, Afternoon, Dusk (CHAPTERS indices 1–3).
 * Informational only (Marvy's call, DESIGN §14.10 addendum): it doesn't gate
 * spawning or hold back the clock, same as the day-wide quota already
 * doesn't — it exists purely so the chapter banner can tell a player how many
 * treasures THIS stretch of the day is asking for, the way a good HUD narrates
 * "3 to find this morning" instead of leaving them to infer it. Remainder goes
 * to the earlier periods first, so a light day (1–2 treasures) doesn't spread
 * a single treasure's "find 1" instruction across all three chapters.
 */
export function periodQuotas(day: number): [number, number, number] {
  const total = treasuresForDay(day);
  const base = Math.floor(total / 3);
  const extra = total % 3;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base];
}

const PERIOD_DEADLINE: Record<number, string> = {
  1: "by midday",
  2: "by dusk",
  3: "before nightfall",
};

/**
 * The chapter banner's brief line, with the period's treasure count folded in
 * for Morning/Afternoon/Dusk, and an explicit "bank up and head home" nudge
 * for Night — the "it's nighttime now, go bank and rest" instruction Marvy
 * asked for. Dawn keeps its own tutorial-specific brief untouched.
 */
export function chapterBriefFor(day: number, chapter: number): string {
  const base = CHAPTERS[chapter].brief;
  if (chapter >= 1 && chapter <= 3) {
    const q = periodQuotas(day)[chapter - 1];
    if (q > 0) return `${base} Find ${q} treasure${q === 1 ? "" : "s"} ${PERIOD_DEADLINE[chapter]}.`;
  }
  if (chapter === 4) return `${base} Bank what you're carrying, then head home to rest.`;
  return base;
}

/** Which chapter a given day-progress falls in. */
export function chapterAt(day: number): number {
  let idx = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (day >= CHAPTERS[i].dayAt) idx = i;
  return idx;
}

/**
 * Sun + sky for a point in the day. Hand-authored keys rather than a physical
 * model — this is a mood curve, and it wants to be tuned by eye.
 */
export interface SkyState {
  /** Sun direction (it swings from east, overhead, to west and below). */
  sunAzimuth: number;
  sunHeight: number;
  sunColor: string;
  sunIntensity: number;
  ambient: number;
  hemi: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  /** Overall sky brightness multiplier. Stays near 1 now that each stage of the
   *  day has its OWN sky texture — this is a trim, not the day/night control. */
  skyIntensity: number;
  /** How much of the DUSK sky is blended over the day sky (0–1). */
  duskMix: number;
  /** How much of the NIGHT sky is blended over that (0–1). Wins over dusk. */
  nightMix: number;
  /** 0 → 1 as the street lanterns take over from the sun. */
  lanternMix: number;
}

// Three real skies, cross-faded (see world/SkyDome.tsx).
//
// This used to be ONE daytime HDRI with its brightness pulled down, and it did
// not work: dimming a blue sky with white cumulus in it gives you an
// underexposed afternoon, not a night. At 19:00 the HUD said NIGHT, the fog went
// brown-grey, the street went dark — and overhead it was still bright blue with
// puffy clouds. It was the single worst immersion break in the build. Each stage
// now has its own sky and they blend, so the sky actually goes out.
const KEYS: { at: number; s: SkyState }[] = [
  { at: 0.0,  s: { sunAzimuth: -1.2, sunHeight: 0.20, sunColor: "#ffd2a1", sunIntensity: 1.5, ambient: 0.40, hemi: 0.85, fog: "#d8c4ae", fogNear: 45, fogFar: 165, skyIntensity: 0.90, duskMix: 0.55, nightMix: 0.0,  lanternMix: 0.25 } },
  { at: 0.3,  s: { sunAzimuth: -0.3, sunHeight: 0.85, sunColor: "#fff4e0", sunIntensity: 2.4, ambient: 0.45, hemi: 1.00, fog: "#c3ccd6", fogNear: 55, fogFar: 175, skyIntensity: 1.00, duskMix: 0.0,  nightMix: 0.0,  lanternMix: 0.0 } },
  { at: 0.62, s: { sunAzimuth: 0.7,  sunHeight: 0.45, sunColor: "#ffc98a", sunIntensity: 1.9, ambient: 0.38, hemi: 0.80, fog: "#c9a98c", fogNear: 45, fogFar: 150, skyIntensity: 0.95, duskMix: 0.70, nightMix: 0.0,  lanternMix: 0.35 } },
  { at: 0.82, s: { sunAzimuth: 1.3,  sunHeight: 0.10, sunColor: "#e08a52", sunIntensity: 0.9, ambient: 0.24, hemi: 0.45, fog: "#4a3b3a", fogNear: 30, fogFar: 110, skyIntensity: 0.85, duskMix: 1.0,  nightMix: 0.60, lanternMix: 0.8 } },
  // The last stretch goes fully over to the night sky well before the run ends —
  // "Night" on the HUD has to mean night out of the window, not 3/4 of the way there.
  { at: 0.90, s: { sunAzimuth: 1.55, sunHeight: 0.00, sunColor: "#a080a8", sunIntensity: 0.55, ambient: 0.19, hemi: 0.36, fog: "#2b2836", fogNear: 24, fogFar: 92, skyIntensity: 0.80, duskMix: 1.0,  nightMix: 0.95, lanternMix: 0.92 } },
  { at: 1.0,  s: { sunAzimuth: 1.8,  sunHeight: -0.10, sunColor: "#7f8fc0", sunIntensity: 0.30, ambient: 0.15, hemi: 0.28, fog: "#141a28", fogNear: 18, fogFar: 78, skyIntensity: 0.70, duskMix: 1.0,  nightMix: 1.0,  lanternMix: 1.0 } },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/** Interpolated sky for a day position (0..1). */
export function skyAt(day: number): SkyState {
  const d = Math.max(0, Math.min(1, day));
  let i = 0;
  for (let k = 0; k < KEYS.length - 1; k++) if (d >= KEYS[k].at) i = k;
  const a = KEYS[i];
  const b = KEYS[Math.min(KEYS.length - 1, i + 1)];
  const span = b.at - a.at;
  const t = span > 1e-6 ? (d - a.at) / span : 0;
  return {
    sunAzimuth: lerp(a.s.sunAzimuth, b.s.sunAzimuth, t),
    sunHeight: lerp(a.s.sunHeight, b.s.sunHeight, t),
    sunColor: lerpHex(a.s.sunColor, b.s.sunColor, t),
    sunIntensity: lerp(a.s.sunIntensity, b.s.sunIntensity, t),
    ambient: lerp(a.s.ambient, b.s.ambient, t),
    hemi: lerp(a.s.hemi, b.s.hemi, t),
    fog: lerpHex(a.s.fog, b.s.fog, t),
    fogNear: lerp(a.s.fogNear, b.s.fogNear, t),
    fogFar: lerp(a.s.fogFar, b.s.fogFar, t),
    skyIntensity: lerp(a.s.skyIntensity, b.s.skyIntensity, t),
    duskMix: lerp(a.s.duskMix, b.s.duskMix, t),
    nightMix: lerp(a.s.nightMix, b.s.nightMix, t),
    lanternMix: lerp(a.s.lanternMix, b.s.lanternMix, t),
  };
}

/** Time-of-day label for the HUD (a clock face, not a countdown). */
export function clockLabel(day: number): string {
  // Dawn ≈ 06:00, nightfall ≈ 21:00.
  const mins = 6 * 60 + day * 15 * 60;
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60 / 5) * 5;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
