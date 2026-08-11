import { describe, expect, it } from "vitest";
import { Horde } from "../horde";
import { Motes } from "../motes";
import { NIGHTS, addXp, dawnProgress, hurt, newRun, tick, waveSpec, xpForLevel } from "../run";

/**
 * The parts of Nights that are invisible in a screenshot.
 *
 * Pacing and the crowd sim are exactly the things a playtest cannot check by
 * eye: whether the difficulty curve actually rises, whether slots are recycled,
 * whether separation stops the horde collapsing into a single point. All of it
 * is pure, so all of it is cheap to assert.
 */

describe("the night gets worse", () => {
  it("throws more at you every minute", () => {
    const rates = [0, 2, 5, 10, 15].map((m) => waveSpec(m * 60).rate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it("opens thin enough that the starting gun out-kills the door", () => {
    // The base gun kills roughly 1/fireInterval a second while enemies have 1hp.
    const opening = waveSpec(0);
    const killRate = 1 / NIGHTS.fireInterval;
    expect(opening.rate).toBeLessThan(killRate);
    expect(opening.hp).toBe(1);
  });

  it("outruns that same gun well before dawn, which is what upgrades are for", () => {
    const late = waveSpec(NIGHTS.runSeconds / 2);
    expect(late.rate).toBeGreaterThan(1 / NIGHTS.fireInterval);
  });

  it("grows count far faster than health, so it stays a tide not a sponge", () => {
    const a = waveSpec(60);
    const b = waveSpec(600);
    expect(b.rate / a.rate).toBeGreaterThan(b.hp / a.hp);
  });
});

describe("the run", () => {
  it("levels up, and each level costs more than the last", () => {
    expect(xpForLevel(5)).toBeGreaterThan(xpForLevel(1));
    const r = newRun();
    addXp(r, xpForLevel(1));
    expect(r.level).toBe(2);
    expect(r.pendingLevels).toBe(1);
  });

  it("carries a big pickup through several levels at once", () => {
    const r = newRun();
    addXp(r, 500);
    expect(r.level).toBeGreaterThan(3);
    expect(r.pendingLevels).toBe(r.level - 1);
  });

  it("ends when you run out of health", () => {
    const r = newRun();
    expect(hurt(r, r.maxHp)).toBe(true);
    expect(r.over).toBe(true);
    expect(r.won).toBe(false);
  });

  it("ends as a WIN at dawn, which is the whole point of holding on", () => {
    const r = newRun();
    tick(r, NIGHTS.runSeconds + 1);
    expect(r.over).toBe(true);
    expect(r.won).toBe(true);
    expect(dawnProgress(r)).toBe(1);
  });

  it("stops taking damage or XP once it is over", () => {
    const r = newRun();
    hurt(r, r.maxHp);
    const lvl = r.level;
    addXp(r, 9999);
    expect(r.level).toBe(lvl);
  });
});

describe("the horde", () => {
  it("recycles the slots of the dead instead of growing", () => {
    const h = new Horde({ max: 4 });
    for (let i = 0; i < 4; i++) h.spawn(i, 0, 1);
    expect(h.count).toBe(4);
    expect(h.spawn(9, 9, 1)).toBe(-1); // full

    h.kill(2);
    expect(h.count).toBe(3);
    const slot = h.spawn(9, 9, 1);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(h.count).toBe(4);
  });

  it("reports a kill only on the blow that actually kills", () => {
    const h = new Horde({ max: 2 });
    const i = h.spawn(0, 0, 3);
    expect(h.damage(i, 1, 0)).toBe(false);
    expect(h.damage(i, 1, 0)).toBe(false);
    expect(h.damage(i, 1, 0)).toBe(true);
    expect(h.alive[i]).toBe(0);
  });

  it("walks toward the player", () => {
    const h = new Horde({ max: 1 });
    const i = h.spawn(10, 0, 1);
    const before = Math.hypot(h.pos[0], h.pos[1]);
    for (let s = 0; s < 30; s++) h.step(1 / 60, 0, 0);
    expect(Math.hypot(h.pos[0], h.pos[1])).toBeLessThan(before);
    expect(h.alive[i]).toBe(1);
  });

  it("pushes apart instead of collapsing into one point", () => {
    // Two walkers spawned on the same spot must not stay there. Without
    // separation the whole crowd converges to a single pixel and the horde
    // stops reading as a crowd at all.
    const h = new Horde({ max: 2 });
    h.spawn(5, 0, 1);
    h.spawn(5, 0.01, 1);
    for (let s = 0; s < 60; s++) h.step(1 / 60, 0, 0);
    const gap = Math.hypot(h.pos[0] - h.pos[2], h.pos[1] - h.pos[3]);
    expect(gap).toBeGreaterThan(h.p.radius);
  });

  it("keeps everyone inside the arena", () => {
    const h = new Horde({ max: 20, half: 10 });
    for (let i = 0; i < 20; i++) h.spawn(9.5, 9.5, 1);
    for (let s = 0; s < 120; s++) h.step(1 / 60, 100, 100); // chase a target outside
    for (let i = 0; i < 20; i++) {
      if (!h.alive[i]) continue;
      expect(Math.abs(h.pos[i * 2])).toBeLessThanOrEqual(10.001);
      expect(Math.abs(h.pos[i * 2 + 1])).toBeLessThanOrEqual(10.001);
    }
  });

  it("finds the nearest walker, and only within range", () => {
    const h = new Horde({ max: 3 });
    h.spawn(20, 0, 1);
    const close = h.spawn(2, 0, 1);
    expect(h.nearest(0, 0, 5)).toBe(close);
    expect(h.nearest(0, 0, 1)).toBe(-1);
  });
});

describe("motes", () => {
  it("comes to you inside the magnet, and is collected at your feet", () => {
    const m = new Motes(8);
    m.drop(3, 0, 1);
    let gained = 0;
    for (let s = 0; s < 240 && gained === 0; s++) gained += m.step(1 / 60, 0, 0, NIGHTS.magnetRadius);
    expect(gained).toBe(1);
    expect(m.count).toBe(0);
  });

  it("stays put when it is beyond the magnet", () => {
    const m = new Motes(8);
    m.drop(30, 0, 1);
    const gained = m.step(1 / 60, 0, 0, NIGHTS.magnetRadius);
    expect(gained).toBe(0);
    expect(m.pos[0]).toBeCloseTo(30);
  });

  it("survives a full floor without growing the pool", () => {
    const m = new Motes(4);
    for (let i = 0; i < 40; i++) m.drop(i, 0, 1);
    expect(m.count).toBeLessThanOrEqual(4);
    expect(m.alive.length).toBe(4);
  });
});
