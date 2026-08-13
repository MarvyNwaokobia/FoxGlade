import { describe, it, expect } from "vitest";
import { periodQuotas, chapterBriefFor, treasuresForDay } from "../day";

describe("periodQuotas", () => {
  it("sums to the day's total quota", () => {
    for (let day = 1; day <= 10; day++) {
      const [m, a, d] = periodQuotas(day);
      expect(m + a + d).toBe(treasuresForDay(day));
    }
  });

  it("gives the remainder to earlier periods first", () => {
    expect(periodQuotas(1)).toEqual([1, 0, 0]); // total 1
    expect(periodQuotas(2)).toEqual([1, 1, 0]); // total 2
    expect(periodQuotas(3)).toEqual([1, 1, 1]); // total 3
    expect(periodQuotas(4)).toEqual([2, 1, 1]); // total 4
    expect(periodQuotas(6)).toEqual([2, 2, 2]); // total 6
  });
});

describe("chapterBriefFor", () => {
  it("leaves Dawn's tutorial brief untouched", () => {
    expect(chapterBriefFor(1, 0)).toBe("Find the first treasure. Bank it at the vault.");
  });

  it("folds the period's treasure count into Morning/Afternoon/Dusk", () => {
    expect(chapterBriefFor(6, 1)).toContain("Find 2 treasures by midday.");
    expect(chapterBriefFor(6, 2)).toContain("Find 2 treasures by dusk.");
    expect(chapterBriefFor(6, 3)).toContain("Find 2 treasures before nightfall.");
  });

  it("uses singular phrasing for a quota of one", () => {
    expect(chapterBriefFor(1, 1)).toContain("Find 1 treasure by midday.");
  });

  it("skips the sentence when that period has nothing left to allocate", () => {
    const brief = chapterBriefFor(1, 3); // day 1 total is 1, all in Morning
    expect(brief).toBe("Thieves are racing you for what's left.");
  });

  it("tells Night to bank up and head home", () => {
    expect(chapterBriefFor(3, 4)).toContain("Bank what you're carrying, then head home to rest.");
  });
});
