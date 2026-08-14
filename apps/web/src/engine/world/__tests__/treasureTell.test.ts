import { describe, expect, it } from "vitest";
import { TELL_NEAR, TELL_FAR, tellProximity, moundOpacity, glintOpacity, clodLayout, coinLayout } from "../treasureTell";

/**
 * The proximity curve that makes a tell readable as "walk up and check", not
 * "spot it across the village" (DESIGN §14.10 slice 5). The load-bearing
 * invariant is the RANGE: full strength inside TELL_NEAR, gone past TELL_FAR.
 */
describe("tellProximity", () => {
  it("is 1 at zero distance and anywhere inside TELL_NEAR", () => {
    expect(tellProximity(0)).toBe(1);
    expect(tellProximity(TELL_NEAR)).toBe(1);
    expect(tellProximity(TELL_NEAR - 0.01)).toBe(1);
  });

  it("is 0 at or beyond TELL_FAR", () => {
    expect(tellProximity(TELL_FAR)).toBe(0);
    expect(tellProximity(TELL_FAR + 5)).toBe(0);
    expect(tellProximity(1000)).toBe(0);
  });

  it("falls off monotonically between TELL_NEAR and TELL_FAR", () => {
    const mid = tellProximity((TELL_NEAR + TELL_FAR) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(tellProximity(TELL_NEAR + 1)).toBeGreaterThan(tellProximity(TELL_FAR - 1));
  });
});

describe("moundOpacity / glintOpacity", () => {
  it("the mound is always faintly visible, even at t=0 — only the glint is a hard gate", () => {
    expect(moundOpacity(0)).toBeCloseTo(0.12);
    expect(glintOpacity(0)).toBe(0);
  });

  it("both reach their legible maximum at t=1", () => {
    expect(moundOpacity(1)).toBeCloseTo(0.8);
    expect(glintOpacity(1)).toBeCloseTo(0.9);
  });

  it("the glint comes up faster than the mound near t=1 (squared curve) — the payoff for closing the distance", () => {
    const t = 0.5;
    const moundFraction = (moundOpacity(t) - moundOpacity(0)) / (moundOpacity(1) - moundOpacity(0));
    const glintFraction = glintOpacity(t) / glintOpacity(1);
    expect(glintFraction).toBeLessThan(moundFraction); // at half distance-closed, the glint has barely started
  });
});

describe("clodLayout", () => {
  it("is deterministic — the same slot always scatters the same way", () => {
    expect(clodLayout(2)).toEqual(clodLayout(2));
  });

  it("gives every hint slot its own scatter, so decoys don't all look identical to each other", () => {
    const a = clodLayout(0);
    const b = clodLayout(1);
    expect(a).not.toEqual(b);
  });

  it("keeps every clod inside a small radius of the tell centre", () => {
    for (const c of clodLayout(3)) {
      expect(Math.hypot(c.x, c.z)).toBeLessThan(1);
      expect(c.s).toBeGreaterThan(0);
    }
  });
});

describe("coinLayout", () => {
  it("is deterministic — the same slot always scatters the same way", () => {
    expect(coinLayout(2)).toEqual(coinLayout(2));
  });

  it("gives every hint slot its own scatter", () => {
    const a = coinLayout(0);
    const b = coinLayout(1);
    expect(a).not.toEqual(b);
  });

  it("sits tighter to the tell centre than the dirt clods do", () => {
    for (const c of coinLayout(3)) {
      expect(Math.hypot(c.x, c.z)).toBeLessThan(0.3);
      expect(c.s).toBeGreaterThan(0);
    }
  });
});
