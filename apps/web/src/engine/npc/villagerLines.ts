import * as THREE from "three";
import { HINTS } from "@/engine/world/hints";
import { CHAPTERS, periodQuotas } from "@/engine/config/day";

/**
 * What a villager tells you, and whether it's true.
 *
 * The old distractors were pure liars — one per decoy, every one of them wrong.
 * Once you learned that rule the whole system collapsed into "ignore anyone who
 * talks", which is the opposite of a deduction mechanic. Roughly one in three now
 * tells the truth, so you actually have to judge rather than apply a rule.
 *
 * Lines name a DIRECTION rather than a landmark, because the village has no
 * distinctive landmarks yet (every building is the same model — see the Phase 8
 * art notes). A bearing is information the player can act on immediately, and it
 * stays correct when the art pass replaces the buildings.
 */

const COMPASS = [
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west",
] as const;

/** Bearing from `from` to `to`, as a compass word. */
export function bearingWord(from: THREE.Vector3, to: THREE.Vector3): string {
  // World is -Z north, +X east. atan2(x, -z) gives clockwise-from-north.
  const a = Math.atan2(to.x - from.x, -(to.z - from.z));
  const idx = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return COMPASS[idx];
}

const TRUE_FORMS = [
  (d: string) => `It's ${d} of here. I saw them bury it.`,
  (d: string) => `Go ${d}. I'd not lie to a stranger.`,
  (d: string) => `${d[0].toUpperCase()}${d.slice(1)}, past the houses. Quickly now.`,
];
const LIE_FORMS = [
  (d: string) => `The treasure's ${d}, friend! Trust me.`,
  (d: string) => `I saw it glint ${d}. Go, before someone else does!`,
  (d: string) => `Everyone knows it's ${d}. Everyone.`,
];

export interface VillagerClaim {
  /** Where this villager points you. */
  target: THREE.Vector3;
  truthful: boolean;
  line: string;
}

/**
 * Lines that explicitly CONTRADICT the guardian. These only get used once a
 * guardian has actually briefed you, and they're the sharp end of the whole
 * design: a liar isn't just wrong, it's actively trying to overwrite something
 * you were told by someone you trust. That's what makes remembering the briefing
 * a skill rather than a formality.
 */
const CONTRADICT_FORMS = [
  (d: string) => `That guard? Old fool. It's ${d}, and I'd stake my hands on it.`,
  (d: string) => `Whatever the guardian told you, forget it. ${d[0].toUpperCase()}${d.slice(1)}.`,
  (d: string) => `The guard sent you wrong. It's ${d}. I watched them carry it.`,
];

/**
 * The guardian's briefing, said once each morning and never written down.
 *
 * It carries the shape of the whole day — where the treasure is, then what
 * changes as the day turns, chapter by chapter — which is why the first one
 * is a short SEQUENCE of pages rather than one paragraph (Marvy's call,
 * 2026-08-14: a wall of text "doesn't make sense," and a real morning
 * briefing is said a line at a time, not read off in one breath). Every
 * later morning gets the short one-page version: the day's shape is already
 * known, only the treasure moved.
 *
 * It stops short of promising the fox is right, because a kit is honestly
 * and confidently wrong a good deal of the time (fox/foxBrain.findScoutTarget),
 * and overselling it on the one occasion the player is guaranteed to be
 * listening teaches exactly the wrong lesson.
 */
export function guardianBriefPages(
  at: THREE.Vector3,
  target: THREE.Vector3,
  first: boolean,
  day: number
): string[] {
  const d = bearingWord(at, target);
  if (!first) {
    return [`New light, new prize. This one lies ${d} of here. Go, before the village wakes.`];
  }

  const [morningQ, afternoonQ, duskQ] = periodQuotas(day);
  const plural = (n: number) => `${n} treasure${n === 1 ? "" : "s"}`;
  return [
    `Listen well, for I will not repeat it. The treasure lies ${d} of here.`,
    `It is dawn, and the village still sleeps. ${CHAPTERS[1].brief} ` +
      (morningQ > 0 ? `Find ${plural(morningQ)} by midday.` : `Move quickly, while the streets are quiet.`),
    `Comes afternoon, and ${CHAPTERS[2].brief.charAt(0).toLowerCase()}${CHAPTERS[2].brief.slice(1)} ` +
      `Trust what I have told you over any claim you hear after this. ` +
      (afternoonQ > 0 ? `Find ${plural(afternoonQ)} more by dusk.` : ``),
    `By dusk, ${CHAPTERS[3].brief.charAt(0).toLowerCase()}${CHAPTERS[3].brief.slice(1)} ` +
      (duskQ > 0 ? `Find ${plural(duskQ)} more before nightfall. ` : ``) +
      `Bank what you carry before the light fails, and send the kit if your memory does.`,
  ];
}

/**
 * Build a claim for a villager standing at `at`. `truthful` villagers point at a
 * real, unstolen treasure; liars point at a decoy (or, failing that, anywhere
 * that isn't the truth).
 */
export function makeClaim(
  at: THREE.Vector3,
  truthful: boolean,
  seed: number,
  briefed = false
): VillagerClaim {
  const reals = HINTS.filter((h) => h.real);
  const fakes = HINTS.filter((h) => !h.real);
  const pool = truthful ? reals : fakes.length ? fakes : reals;
  const target = pool[seed % pool.length].pos;
  const dir = bearingWord(at, target);
  // Once you've been briefed, liars go after the briefing directly rather than
  // just offering a competing rumour.
  const forms = truthful ? TRUE_FORMS : briefed ? CONTRADICT_FORMS : LIE_FORMS;
  return { target, truthful, line: forms[seed % forms.length](dir) };
}
