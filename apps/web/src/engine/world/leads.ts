/**
 * Leads — what you've been TOLD about where the treasure is.
 *
 * This replaces the compass hint dots, and it is the point of the whole
 * deception layer.
 *
 * The compass used to draw one blip per candidate, at true bearing, always, all
 * four of them. That handed you the answer set for free: walk to the nearest
 * blip, and if it's a dud walk to the next one. Four short walks on a 72m map and
 * the board is solved. Everything built on top of it — the guardian's one-time
 * briefing, the villagers who lie to you, the fox that physically runs to the
 * real one — was decoration on a solved problem, because none of it told you
 * anything the ring wasn't already showing.
 *
 * So the ring no longer knows anything. It only shows what somebody SAID, as a
 * sector rather than a point, and that sector FADES: sharp in the moment you're
 * told, vague a minute later, gone. That is what puts the memory pressure back
 * without leaving you lost on a map with thirteen possible nooks.
 *
 * Two slots, deliberately:
 *
 *  - `lead` — a source you have reason to trust: the guardian's briefing, or the
 *    fox, which cannot lie. Refreshing it re-sharpens the wedge.
 *  - `rumour` — the last thing a villager told you. It does NOT overwrite the
 *    lead; it sits beside it. That's the decision the liars exist to create — a
 *    fresh, confident bearing next to the fading one you were given at dawn —
 *    and it stays YOUR call which to walk toward.
 */

/** Who told you. Drives the wedge's colour, and nothing else. */
export type LeadSource = "guardian" | "fox" | "chart" | "villager";

export interface Lead {
  /** World bearing, radians, atan2(dx, dz) — the same convention as `runtime.yaw`. */
  bearing: number;
  /** Half-width of the sector at the moment it was given. */
  spread: number;
  /** performance.now when it was given. */
  setAt: number;
  /** Milliseconds until it's forgotten entirely. */
  ttl: number;
  source: LeadSource;
}

/** How a lead reads RIGHT NOW: wider and fainter than when you got it. */
export interface LeadView {
  bearing: number;
  spread: number;
  /** 0..1 — drives opacity. */
  alpha: number;
  source: LeadSource;
}

/** Per-source defaults. Tune the trustworthiness of the HUD from here. */
export const LEAD = {
  /** The guardian names a compass point, so the wedge is one compass point wide. */
  guardian: { spread: Math.PI / 8, ttl: 52_000 },
  /** The fox took you there itself — that's the tightest information in the game,
   *  and the reason raising it matters. */
  fox: { spread: Math.PI / 18, ttl: 40_000 },
  /** A chart bought at the market. Wider than the fox — a chart is a drawing,
   *  not a nose — but it lasts, because you're holding it while you read it. */
  chart: { spread: Math.PI / 12, ttl: 70_000 },
  /** A villager is vaguer than a guardian, and you forget them sooner. */
  villager: { spread: Math.PI / 6, ttl: 26_000 },
  /** Fraction of its life a lead stays at full strength before it starts fading. */
  holdFraction: 0.3,
  /** How much wider the sector gets over its full life (1 = doubles). */
  widen: 1.9,
  /** Hard cap on half-width, so a stale wedge can't wrap the whole ring and
   *  stop meaning "over there". */
  maxSpread: (75 * Math.PI) / 180,
} as const;

/**
 * Compass bearing from one ground position to another: 0 = north, +π/2 = east,
 * measured clockwise. The world's north is -Z.
 *
 * This is the SAME convention as `villagerLines.bearingWord`, and that is not
 * optional: the guardian says "north-east" out loud and the wedge has to point
 * at the same piece of sky, or the whole memory mechanic is unplayable.
 */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, -(toZ - fromZ));
}

/**
 * Where a world bearing sits on the compass ring: 0 = straight ahead (top of the
 * ring), +π/2 = the right edge.
 *
 * It ADDS the yaw rather than subtracting it, because `runtime.yaw` runs
 * counter-clockwise (turning right DECREASES it — see PlayerController's
 * `yaw.current -= movementX`) while a compass bearing runs clockwise.
 *
 * Every blip on the ring must go through here. The old code open-coded
 * `Math.atan2(dx, dz) - yaw` in four separate places, which is both the wrong
 * north (it mirrored north and south) and the wrong turn direction — the two
 * errors cancelled for a target due east while the player faced due north, which
 * is exactly the case you'd eyeball first when checking whether a compass works.
 */
export function compassAngle(bearing: number, yaw: number): number {
  return bearing + yaw;
}

/**
 * Build a lead. Kept separate from the slots below so the decay can be tested
 * without a running game.
 */
export function makeLead(source: LeadSource, bearing: number, now: number): Lead {
  const d = LEAD[source];
  return { bearing, spread: d.spread, setAt: now, ttl: d.ttl, source };
}

/**
 * How a lead reads at `now`, or null once it's been forgotten.
 *
 * It holds sharp for the first slice of its life — you were just told, you
 * remember it exactly — then widens and fades away. The fade is eased rather
 * than linear so it doesn't wink out at the edge of usefulness.
 */
export function leadView(lead: Lead | null, now: number): LeadView | null {
  if (!lead) return null;
  const age = (now - lead.setAt) / lead.ttl;
  if (age >= 1 || age < 0) return null;
  const decay = age <= LEAD.holdFraction ? 0 : (age - LEAD.holdFraction) / (1 - LEAD.holdFraction);
  return {
    bearing: lead.bearing,
    spread: Math.min(LEAD.maxSpread, lead.spread * (1 + LEAD.widen * decay)),
    alpha: 1 - decay * decay,
    source: lead.source,
  };
}

// ── The two live slots ────────────────────────────────────────────────────────
//
// Module singletons for the same reason `runtime` is one: the HUD reads these on
// its own rAF and must never re-render React from inside the frame loop.

export const leads: { lead: Lead | null; rumour: Lead | null } = { lead: null, rumour: null };

/** A trusted source pointed you somewhere: the briefing, the fox, or a chart. */
export function setLead(source: "guardian" | "fox" | "chart", bearing: number, now: number): void {
  leads.lead = makeLead(source, bearing, now);
}

/** A villager told you something. True or not — the wedge looks the same either
 *  way, which is the entire point. */
export function setRumour(bearing: number, now: number): void {
  leads.rumour = makeLead("villager", bearing, now);
}

/** Wipe both slots — a new chapter moves the treasure, so everything you were
 *  told about the last one is worse than useless. */
export function clearLeads(): void {
  leads.lead = null;
  leads.rumour = null;
}
