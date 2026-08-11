import { describe, expect, it, beforeEach } from "vitest";
import { useGame } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { HINTS } from "@/engine/world/hints";
import { DAY } from "@/engine/config/day";
import { REST } from "@/engine/config/round";
import { LOOT } from "@/engine/config/round";
import { loadSave, clearSave } from "@/engine/save";

/**
 * Sleeping, which is the seam the whole long game hangs off.
 *
 * The interesting invariant is not that the day number goes up, it is the SPLIT:
 * what a night is allowed to carry forward and what it must wash away. Getting
 * that wrong in either direction breaks the loop quietly. Carry supplies over
 * and a good day snowballs into an unlosable one; wash the wallet away and
 * nothing you did yesterday mattered.
 */
function seedBoard(): void {
  for (let i = 0; i < HINTS.length; i++) {
    HINTS[i].real = i === 0;
    HINTS[i].rarity = "rare";
    HINTS[i].pos.set(i * 5, 0, -10);
  }
  runtime.hintStolen.fill(false);
  runtime.hintClaimed.fill(false);
  runtime.hintBanked.fill(false);
  runtime.hintCracked.fill(false);
}

/** Play a day to its end, banking one rare on the way. */
function playADay(): void {
  useGame.getState().claimTreasure(0);
  useGame.getState().depositLoot();
  useGame.getState().advanceDay(DAY.nightfall);
}

beforeEach(() => {
  clearSave();
  useGame.getState().restart();
  seedBoard();
});

describe("night is a door, not a wall", () => {
  it("refuses to let you sleep in broad daylight", () => {
    const before = useGame.getState().day;
    useGame.getState().sleep();
    expect(useGame.getState().day).toBe(before);
  });

  it("rolls over to the next morning once the day is spent", () => {
    playADay();
    expect(useGame.getState().dayOver).toBe(true);
    useGame.getState().sleep();
    const s = useGame.getState();
    expect(s.day).toBe(2);
    expect(s.dayOver).toBe(false);
    expect(s.dayProgress).toBe(0);
    expect(s.chapter).toBe(0);
    expect(s.roundState).toBe("playing");
  });

  it("will not let a downed player sleep it off", () => {
    playADay();
    useGame.setState({ isDead: true });
    useGame.getState().sleep();
    expect(useGame.getState().day).toBe(1);
  });
});

describe("what a night keeps", () => {
  it("carries the wallet, the lifetime total and the gear through", () => {
    playADay();
    const before = useGame.getState();
    const banked = before.villeBanked;
    const earned = before.villeEarned;
    expect(banked).toBe(LOOT.rare);

    useGame.getState().sleep();
    const s = useGame.getState();
    expect(s.villeBanked).toBe(banked);
    expect(s.villeEarned).toBe(earned);
    expect(s.owned).toContain("w_rifle");
  });

  it("keeps a gun bought yesterday, and it is still in your hands", () => {
    useGame.setState({ villeBanked: 5000 });
    useGame.getState().buyItem("w_marksman");
    expect(useGame.getState().equippedWeapon).toBe("marksman");

    useGame.getState().advanceDay(DAY.nightfall);
    useGame.getState().sleep();
    const s = useGame.getState();
    expect(s.owned).toContain("w_marksman");
    expect(s.equippedWeapon).toBe("marksman");
  });
});

describe("what a night washes away", () => {
  it("re-kits supplies rather than stockpiling them", () => {
    playADay();
    // Spend the day's kit down to nothing.
    useGame.setState({ bombsLeft: 0, restoresLeft: 0, lockboxes: 2 });
    useGame.getState().sleep();
    const s = useGame.getState();
    expect(s.bombsLeft).toBeGreaterThan(0);
    expect(s.restoresLeft).toBe(REST.charges);
    // Lockboxes are insurance you re-buy, not a drawer that fills up.
    expect(s.lockboxes).toBe(0);
  });

  it("drops loot you never got to the vault", () => {
    // Advance FIRST: crossing into a new chapter reseeds the board, which would
    // otherwise throw away the slot this test just set up.
    useGame.getState().advanceDay(DAY.nightfall);
    seedBoard();
    useGame.getState().claimTreasure(0);
    expect(useGame.getState().villeCarrying).toBeGreaterThan(0);
    useGame.getState().sleep();
    // Banking is the only thing that makes loot yours. Going to bed with it in
    // your hands is not banking it.
    expect(useGame.getState().villeCarrying).toBe(0);
  });

  it("patches you up and sends the guardian back to the post", () => {
    playADay();
    useGame.setState({ playerHealth: 12 });
    runtime.guardianBriefed = true;
    useGame.getState().sleep();
    expect(useGame.getState().playerHealth).toBe(useGame.getState().maxPlayerHealth);
    expect(runtime.guardianBriefed).toBe(false);
  });
});

describe("the save", () => {
  it("survives sleeping, so a reload comes back on the same day", () => {
    playADay();
    useGame.getState().sleep();
    const saved = loadSave();
    expect(saved.day).toBe(2);
    expect(saved.villeBanked).toBe(LOOT.rare);
  });

  it("records banking straight away, without waiting for bedtime", () => {
    // The whole point of persisting on change: bank four treasures, reload the
    // tab at noon, and you must not come back poorer than you left.
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    expect(loadSave().villeBanked).toBe(LOOT.rare);
  });

  it("is thrown away by a restart, which is a new game and not a new day", () => {
    playADay();
    useGame.getState().sleep();
    expect(loadSave().day).toBe(2);

    useGame.getState().restart();
    const s = useGame.getState();
    expect(s.day).toBe(1);
    expect(s.villeBanked).toBe(0);
    expect(loadSave().day).toBe(1);
  });
});
