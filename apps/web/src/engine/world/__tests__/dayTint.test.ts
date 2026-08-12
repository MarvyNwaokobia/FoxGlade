import { describe, expect, it } from "vitest";
import { TINTS, dayTintIndex } from "../dayTint";

/**
 * The per-day weathering index (DESIGN §14.10 slice 4). The one invariant that
 * actually matters: day 1 must resolve to the neutral tint (index 0), so the
 * very first day a player ever sees is pixel-identical to before this feature
 * existed — everything from day 2 on is where the village is allowed to drift.
 */
describe("dayTintIndex", () => {
  it("day 1 is the neutral tint — the established baseline look, untouched", () => {
    expect(dayTintIndex(1)).toBe(0);
    expect(TINTS[dayTintIndex(1)]).toBe(0xffffff);
  });

  it("advances by one each day", () => {
    expect(dayTintIndex(2)).toBe(1);
    expect(dayTintIndex(3)).toBe(2);
  });

  it("wraps around rather than running off the end of the palette", () => {
    expect(dayTintIndex(TINTS.length)).toBe(TINTS.length - 1);
    expect(dayTintIndex(TINTS.length + 1)).toBe(0); // back to neutral
    expect(dayTintIndex(TINTS.length * 3 + 2)).toBe(1);
  });

  it("always lands inside the palette, even for day 0 or a negative day", () => {
    for (const day of [0, -1, -5]) {
      const i = dayTintIndex(day);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(TINTS.length);
    }
  });
});
