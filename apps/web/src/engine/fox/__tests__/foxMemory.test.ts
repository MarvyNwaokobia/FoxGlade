import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import {
  forgetEverything,
  isDangerous,
  nearestDanger,
  pickWrongSlot,
  rememberDanger,
  rememberSpot,
  scoutIsCorrect,
  spotFamiliarity,
} from "../foxMemory";
import { foxGrowthFor } from "@/engine/config/fox";

beforeEach(forgetEverything);

describe("the growth curve pays out in judgement", () => {
  it("gets steadily surer, and a Prime fox is never wrong", () => {
    const stages = [0, 1, 2, 3].map(foxGrowthFor);
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].misreadChance).toBeLessThan(stages[i - 1].misreadChance);
    }
    expect(stages[stages.length - 1].misreadChance).toBe(0);
    // A Prime fox is right regardless of the roll — the top of the curve has to
    // be something the player can feel, not a small number.
    expect(scoutIsCorrect(0, 0, 0)).toBe(true);
    expect(scoutIsCorrect(0, 0, 0.999)).toBe(true);
  });

  it("a kit is wrong often enough that you check its work", () => {
    const kit = foxGrowthFor(0).misreadChance;
    expect(scoutIsCorrect(kit, 0, kit - 0.01)).toBe(false);
    expect(scoutIsCorrect(kit, 0, kit + 0.01)).toBe(true);
  });
});

describe("familiarity with a nook", () => {
  it("rises with visits and caps out", () => {
    expect(spotFamiliarity(10, 10)).toBe(0);
    rememberSpot(10, 10);
    const once = spotFamiliarity(10, 10);
    expect(once).toBeGreaterThan(0);
    rememberSpot(10, 10);
    expect(spotFamiliarity(10, 10)).toBeGreaterThan(once);
    for (let i = 0; i < 10; i++) rememberSpot(10, 10);
    expect(spotFamiliarity(10, 10)).toBe(1);
  });

  it("treats nearby positions as the same place, and distant ones as different", () => {
    rememberSpot(10, 10);
    expect(spotFamiliarity(12, 11)).toBeGreaterThan(0); // same nook, jittered
    expect(spotFamiliarity(25, 25)).toBe(0); // across the village
  });

  it("makes a kit measurably better where it has been before", () => {
    const kit = foxGrowthFor(0).misreadChance;
    const roll = kit * 0.5; // a roll a kit fails cold
    expect(scoutIsCorrect(kit, 0, roll)).toBe(false);
    expect(scoutIsCorrect(kit, 1, roll)).toBe(true); // …but not on home ground
  });
});

describe("danger memory", () => {
  it("remembers where you went down, and forgets nothing nearby", () => {
    expect(isDangerous(5, -5)).toBe(false);
    rememberDanger(5, -5);
    expect(isDangerous(5, -5)).toBe(true);
    expect(isDangerous(7, -4)).toBe(true); // same street
    expect(isDangerous(30, 30)).toBe(false);
  });

  it("finds the nearest mark within range, and none outside it", () => {
    rememberDanger(0, -20);
    expect(nearestDanger(new THREE.Vector3(0, 0, -14), 9)).not.toBeNull();
    expect(nearestDanger(new THREE.Vector3(0, 0, 0), 9)).toBeNull();
  });

  it("keeps the list bounded so a long-lived save can't grow without limit", () => {
    for (let i = 0; i < 40; i++) rememberDanger(i * 10, i * 10);
    // Distinct spots, all recent — the cap is what stops this being unbounded.
    expect(nearestDanger(new THREE.Vector3(0, 0, 0), 5)).toBeNull();
  });
});

describe("picking a wrong slot", () => {
  it("returns one of the decoys offered", () => {
    expect(pickWrongSlot([1, 2, 3], 0)).toBe(1);
    expect(pickWrongSlot([1, 2, 3], 0.99)).toBe(3);
  });

  it("has nothing to be confused by when there are no decoys left", () => {
    // The caller falls back to the truth here: an unsure fox with only one
    // option left still leads you to it.
    expect(pickWrongSlot([])).toBeNull();
  });
});
