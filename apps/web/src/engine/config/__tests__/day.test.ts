import { describe, it, expect } from "vitest";
import { periodQuotas, chapterBriefFor, treasuresForDay, DAWN_QUOTA } from "../day";

describe("periodQuotas", () => {
  it("sums to the day's total quota, after Dawn's own one", () => {
    for (let day = 1; day <= 10; day++) {
      const [m, a, d, n] = periodQuotas(day);
      expect(m + a + d + n).toBe(treasuresForDay(day) - DAWN_QUOTA);
    }
  });

  it("gives the remainder to earlier periods first", () => {
    // treasuresForDay is day+2 capped at 8; Dawn always claims one of those first.
    expect(periodQuotas(1)).toEqual([1, 1, 0, 0]); // total 3, minus Dawn's 1 = 2
    expect(periodQuotas(2)).toEqual([1, 1, 1, 0]); // total 4, minus 1 = 3
    expect(periodQuotas(3)).toEqual([1, 1, 1, 1]); // total 5, minus 1 = 4
    expect(periodQuotas(4)).toEqual([2, 1, 1, 1]); // total 6, minus 1 = 5
    expect(periodQuotas(6)).toEqual([2, 2, 2, 1]); // total 8 (capped), minus 1 = 7
  });
});

describe("chapterBriefFor", () => {
  it("leaves Dawn's tutorial brief untouched", () => {
    expect(chapterBriefFor(1, 0)).toBe("Find the first treasure. Bank it at the vault.");
  });

  it("folds the period's treasure count into Morning/Afternoon/Dusk/Night", () => {
    expect(chapterBriefFor(6, 1)).toContain("Find 2 treasures by midday.");
    expect(chapterBriefFor(6, 2)).toContain("Find 2 treasures by dusk.");
    expect(chapterBriefFor(6, 3)).toContain("Find 2 treasures before nightfall.");
    expect(chapterBriefFor(6, 4)).toContain("Find 1 treasure before you turn in.");
  });

  it("uses singular phrasing for a quota of one", () => {
    expect(chapterBriefFor(1, 1)).toContain("Find 1 treasure by midday.");
  });

  it("skips the sentence when that period has nothing left to allocate", () => {
    // Not a reachable game day (treasuresForDay never returns 0 for day >= 1
    // now that it starts at 3) — this is a defensive edge case in the pure
    // math, exercised directly rather than through a real day number.
    const brief = chapterBriefFor(-2, 3);
    expect(brief).toBe("Thieves are racing you for what's left.");
  });

  it("tells Night to bank up and head home when there's nothing left to allocate it", () => {
    expect(chapterBriefFor(1, 4)).toContain("Bank what you're carrying, then head home to rest.");
  });
});
