import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import {
  LEAD,
  bearingTo,
  clearLeads,
  compassAngle,
  leadView,
  leads,
  makeLead,
  setLead,
  setRumour,
} from "../leads";
import { bearingWord } from "@/engine/npc/villagerLines";

const COMPASS_WORDS = [
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west",
];

/**
 * The compass is the game's only nav affordance now that the candidate dots are
 * gone, so the decay curve is load-bearing: too generous and the deduction layer
 * is solved again, too harsh and the player is lost in a 72m maze. These lock the
 * shape of it.
 */
describe("bearingTo", () => {
  it("agrees with the villagers: north is -Z, east is +X, clockwise", () => {
    expect(bearingTo(0, 0, 0, -10)).toBeCloseTo(0); // due north
    expect(bearingTo(0, 0, 10, 0)).toBeCloseTo(Math.PI / 2); // due east
    expect(bearingTo(0, 0, 0, 10)).toBeCloseTo(Math.PI); // due south
    expect(bearingTo(0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2); // due west
  });

  it("is the same bearing the guardian speaks aloud", () => {
    // If these two ever diverge, the guardian says "north-east" while the wedge
    // points somewhere else, and the memory mechanic becomes unplayable noise.
    const from = new THREE.Vector3(0, 0, 0);
    for (const [x, z, word] of [
      [0, -10, "north"],
      [10, 0, "east"],
      [0, 10, "south"],
      [-10, 0, "west"],
      [10, -10, "north-east"],
    ] as [number, number, string][]) {
      expect(bearingWord(from, new THREE.Vector3(x, 0, z))).toBe(word);
      const idx = Math.round(((bearingTo(0, 0, x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      expect(COMPASS_WORDS[idx]).toBe(word);
    }
  });
});

describe("compassAngle", () => {
  // Ground truth, derived from the player's own basis vectors:
  //   forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  // Screen angle 0 = top of the ring, +pi/2 = right edge.
  const truth = (dx: number, dz: number, yaw: number) =>
    Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw));
  const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it("places a blip where the player actually sees it", () => {
    const cases: [number, number, number][] = [
      [0, -10, 0], // dead ahead, facing north
      [10, 0, 0], // to the right
      [0, 10, 0], // behind
      [-10, 0, 0], // to the left
      [10, 0, -Math.PI / 2], // east, after turning right (yaw DECREASES turning right)
      [0, -10, -Math.PI / 2],
      [-7, 4, 1.1],
    ];
    for (const [dx, dz, yaw] of cases) {
      const got = compassAngle(bearingTo(0, 0, dx, dz), yaw);
      expect(norm(got - truth(dx, dz, yaw))).toBeCloseTo(0);
    }
  });
});

describe("leadView decay", () => {
  const at = 1_000;

  it("is exact while it's fresh", () => {
    const lead = makeLead("guardian", 1.2, at);
    const v = leadView(lead, at)!;
    expect(v.alpha).toBe(1);
    expect(v.spread).toBeCloseTo(LEAD.guardian.spread);
    expect(v.bearing).toBe(1.2);
  });

  it("holds full strength through the grace window, then starts to go", () => {
    const lead = makeLead("guardian", 0, at);
    const holdEnd = at + LEAD.guardian.ttl * LEAD.holdFraction;
    expect(leadView(lead, holdEnd)!.alpha).toBeCloseTo(1);
    expect(leadView(lead, holdEnd)!.spread).toBeCloseTo(LEAD.guardian.spread);

    const later = leadView(lead, at + LEAD.guardian.ttl * 0.8)!;
    expect(later.alpha).toBeLessThan(1);
    expect(later.spread).toBeGreaterThan(LEAD.guardian.spread);
  });

  it("widens monotonically and never wraps the ring", () => {
    const lead = makeLead("villager", 0, at);
    let prev = 0;
    for (let t = 0; t < 1; t += 0.05) {
      const v = leadView(lead, at + LEAD.villager.ttl * t)!;
      expect(v.spread).toBeGreaterThanOrEqual(prev);
      // A wedge wider than a half-turn would break the HUD's large-arc
      // assumption AND would stop meaning "that way".
      expect(v.spread).toBeLessThan(Math.PI / 2);
      prev = v.spread;
    }
  });

  it("is forgotten entirely at the end of its life", () => {
    const lead = makeLead("guardian", 0, at);
    expect(leadView(lead, at + LEAD.guardian.ttl)).toBeNull();
    expect(leadView(lead, at + LEAD.guardian.ttl + 5_000)).toBeNull();
  });

  it("ranks sources by how much they should be trusted", () => {
    // The fox is the tightest read in the game; a villager the vaguest. If this
    // inverts, raising the fox stops paying and the liars stop mattering.
    expect(LEAD.fox.spread).toBeLessThan(LEAD.chart.spread);
    expect(LEAD.chart.spread).toBeLessThan(LEAD.guardian.spread);
    expect(LEAD.guardian.spread).toBeLessThan(LEAD.villager.spread);
  });

  it("handles a null lead", () => {
    expect(leadView(null, at)).toBeNull();
  });
});

describe("the two slots", () => {
  beforeEach(clearLeads);

  it("keeps a rumour beside the lead rather than overwriting it", () => {
    // This is the mechanic: a liar cannot delete what the guardian told you, it
    // can only offer a competing bearing and let you choose.
    setLead("guardian", 0.5, 1_000);
    setRumour(2.5, 1_100);
    expect(leads.lead?.bearing).toBe(0.5);
    expect(leads.rumour?.bearing).toBe(2.5);
  });

  it("lets a trusted source re-sharpen the lead", () => {
    setLead("guardian", 0.5, 1_000);
    setLead("fox", 0.9, 9_000);
    expect(leads.lead?.source).toBe("fox");
    expect(leadView(leads.lead, 9_000)!.spread).toBeCloseTo(LEAD.fox.spread);
  });

  it("clears both, because a new board makes old directions worse than nothing", () => {
    setLead("guardian", 0.5, 1_000);
    setRumour(2.5, 1_000);
    clearLeads();
    expect(leads.lead).toBeNull();
    expect(leads.rumour).toBeNull();
  });
});
