import { describe, expect, it, beforeEach } from "vitest";
import { useGame, carryCap, bombCapacity } from "@/engine/store";
import { runtime } from "@/engine/runtime";
import { HINTS } from "@/engine/world/hints";
import { LOOT, REST } from "@/engine/config/round";
import { DAY, CHAPTERS } from "@/engine/config/day";
import { SUPPLY_CAP, BAG_CAP } from "@/engine/config/shop";
import { clearLeads, leads } from "@/engine/world/leads";
import { forgetEverything, isDangerous } from "@/engine/fox/foxMemory";

/**
 * The claim → carry → bank → lose chain, which had no coverage at all.
 *
 * It's the part of Foxglade with real invariants — a treasure can be claimed,
 * dropped back on the board, stolen out from under you, cracked by your own
 * bomb, banked, or lost at nightfall, and several of those can happen to the
 * same slot in one chapter. Every one of these cases is invisible in a
 * screenshot and silent when it breaks.
 */

/** Put the board in a known state: slot 0 real, the rest decoys. */
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
  runtime.hintSilenced.fill(false);
  runtime.playerPos.set(0, 0, 0);
}

beforeEach(() => {
  forgetEverything();
  useGame.getState().restart();
  // NOTE `restart()` deliberately does NOT clear `villeCarrying`: loot you were
  // holding at nightfall stays in your bag for the next day, which is what the
  // round-over screen promises ("bank it at the vault next run"). The fixture
  // has to zero it explicitly rather than assume a fresh run means empty hands.
  useGame.setState({ villeCarrying: 0, villeBanked: 0, villeEarned: 0, owned: ["w_rifle"] });
  seedBoard();
});

describe("claiming", () => {
  it("picks the treasure UP rather than ending the run", () => {
    const g = useGame.getState();
    g.claimTreasure(0);
    const s = useGame.getState();
    expect(s.treasureClaimed).toBe(true);
    expect(s.villeCarrying).toBe(LOOT.rare);
    expect(s.roundState).toBe("playing"); // the extraction is the tension
    expect(s.villeBanked).toBe(0); // not safe until it's at the vault
  });

  it("ignores decoys, already-claimed slots, and stolen ones", () => {
    useGame.getState().claimTreasure(1); // a decoy
    expect(useGame.getState().villeCarrying).toBe(0);

    useGame.getState().claimTreasure(0);
    const once = useGame.getState().villeCarrying;
    useGame.getState().claimTreasure(0); // double-tap on the same slot
    expect(useGame.getState().villeCarrying).toBe(once);

    seedBoard();
    useGame.setState({ villeCarrying: 0, treasureClaimed: false });
    runtime.hintStolen[0] = true;
    useGame.getState().claimTreasure(0);
    expect(useGame.getState().villeCarrying).toBe(0);
  });

  it("pays a cracked treasure one tier down (DESIGN §13.5)", () => {
    runtime.hintCracked[0] = true;
    useGame.getState().claimTreasure(0);
    expect(useGame.getState().villeCarrying).toBe(LOOT.common); // a cracked rare
    expect(useGame.getState().treasureCracked).toBe(true);
  });

  it("clamps to the bag you're carrying", () => {
    expect(carryCap(["w_rifle"])).toBe(BAG_CAP.none);
    useGame.setState({ villeCarrying: BAG_CAP.none - 10 });
    useGame.getState().claimTreasure(0);
    expect(useGame.getState().villeCarrying).toBe(BAG_CAP.none);
  });

  it("does nothing once the run is over", () => {
    useGame.getState().endRound("timeout");
    useGame.getState().claimTreasure(0);
    expect(useGame.getState().villeCarrying).toBe(0);
  });
});

describe("banking", () => {
  it("moves carried loot into the wallet AND the lifetime total", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    const s = useGame.getState();
    expect(s.villeCarrying).toBe(0);
    expect(s.villeBanked).toBe(LOOT.rare);
    expect(s.villeEarned).toBe(LOOT.rare);
    expect(s.treasuresBanked).toBe(1);
    expect(runtime.hintBanked[0]).toBe(true);
  });

  it("keeps the fox growing when you spend — lifetime earnings never shrink", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    useGame.getState().buyItem("s_restore");
    const s = useGame.getState();
    expect(s.villeBanked).toBeLessThan(LOOT.rare); // spent
    expect(s.villeEarned).toBe(LOOT.rare); // …but the fox doesn't shrink
  });

  it("is a no-op with an empty bag", () => {
    useGame.getState().depositLoot();
    expect(useGame.getState().treasuresBanked).toBe(0);
  });
});

describe("going down", () => {
  it("drops carried loot and puts the treasure back on the board", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().damagePlayer(1000);
    const s = useGame.getState();
    expect(s.isDead).toBe(true);
    expect(s.villeCarrying).toBe(0);
    expect(s.treasureClaimed).toBe(false);
    expect(runtime.hintClaimed[0]).toBe(false); // findable again — or stealable
    expect(runtime.lootLostAmount).toBe(LOOT.rare);
  });

  it("cannot take back loot that was already banked", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    useGame.getState().damagePlayer(1000);
    expect(useGame.getState().villeBanked).toBe(LOOT.rare);
    expect(runtime.hintBanked[0]).toBe(true);
  });

  it("no longer grants immunity for standing indoors", () => {
    // The safe room used to return early here, which made a doorway a pause
    // button. Interiors break line of sight now, and nothing more.
    runtime.sheltered = true;
    useGame.getState().damagePlayer(30);
    runtime.sheltered = false;
    expect(useGame.getState().playerHealth).toBe(70);
  });

  it("remembers the place, so the fox is uneasy there next time", () => {
    runtime.playerPos.set(12, 0, -4);
    expect(isDangerous(12, -4)).toBe(false);
    useGame.getState().damagePlayer(1000);
    expect(useGame.getState().isDead).toBe(true);
    expect(isDangerous(12, -4)).toBe(true);
  });
});

describe("the lockbox", () => {
  beforeEach(() => {
    useGame.setState({ villeBanked: 1000 });
  });

  it("buys back half of what you were carrying, and is spent doing it", () => {
    useGame.getState().buyItem("s_lockbox");
    expect(useGame.getState().lockboxes).toBe(1);
    useGame.getState().claimTreasure(0); // 300 on you
    useGame.getState().damagePlayer(1000);
    const s = useGame.getState();
    expect(s.villeCarrying).toBe(LOOT.rare / 2);
    expect(s.lockboxes).toBe(0);
    expect(runtime.lootSalvaged).toBe(LOOT.rare / 2);
    expect(runtime.lootLostAmount).toBe(LOOT.rare / 2);
  });

  it("isn't spent when you go down carrying nothing", () => {
    useGame.getState().buyItem("s_lockbox");
    useGame.getState().damagePlayer(1000);
    expect(useGame.getState().lockboxes).toBe(1);
  });

  it("caps how many you can carry", () => {
    for (let i = 0; i < 10; i++) useGame.getState().buyItem("s_lockbox");
    expect(useGame.getState().lockboxes).toBe(SUPPLY_CAP.lockboxes);
  });
});

describe("the market", () => {
  beforeEach(() => {
    useGame.setState({ villeBanked: 5000 });
  });

  it("sells consumables over and over — this is the sink", () => {
    useGame.setState({ restoresLeft: 0 });
    const before = useGame.getState().villeBanked;
    useGame.getState().buyItem("s_restore");
    useGame.getState().buyItem("s_restore");
    expect(useGame.getState().restoresLeft).toBe(2);
    expect(useGame.getState().villeBanked).toBeLessThan(before);
  });

  it("caps restores and bombs at what you can carry", () => {
    for (let i = 0; i < 20; i++) useGame.getState().buyItem("s_restore");
    expect(useGame.getState().restoresLeft).toBe(SUPPLY_CAP.restores);
    for (let i = 0; i < 20; i++) useGame.getState().buyItem("s_bomb");
    expect(useGame.getState().bombsLeft).toBe(bombCapacity(useGame.getState().owned));
  });

  it("sells permanents exactly once", () => {
    useGame.getState().buyItem("g_satchel");
    const after = useGame.getState().villeBanked;
    useGame.getState().buyItem("g_satchel");
    expect(useGame.getState().villeBanked).toBe(after);
    expect(carryCap(useGame.getState().owned)).toBe(BAG_CAP.g_satchel);
  });

  it("refuses anything you can't afford", () => {
    useGame.setState({ villeBanked: 10 });
    useGame.getState().buyItem("w_exotic");
    expect(useGame.getState().owned).not.toContain("w_exotic");
    expect(useGame.getState().villeBanked).toBe(10);
  });

  it("reading a chart puts a fresh bearing on the compass", () => {
    clearLeads();
    useGame.getState().buyItem("s_chart");
    expect(leads.lead?.source).toBe("chart");
  });

  it("won't sell a chart when there's nothing left on the board to chart", () => {
    runtime.hintClaimed[0] = true;
    clearLeads();
    const before = useGame.getState().villeBanked;
    useGame.getState().buyItem("s_chart");
    expect(leads.lead).toBeNull();
    expect(useGame.getState().villeBanked).toBe(before); // and doesn't charge you
  });
});

describe("the day", () => {
  it("advances a chapter and moves the board with it", () => {
    useGame.getState().advanceDay(CHAPTERS[1].dayAt);
    expect(useGame.getState().chapter).toBe(1);
    // Old directions are worse than none once the treasure has moved.
    expect(leads.lead).toBeNull();
    expect(leads.rumour).toBeNull();
  });

  it("ends the run at nightfall, scored on what was banked", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    useGame.getState().advanceDay(DAY.nightfall);
    const s = useGame.getState();
    expect(s.roundState).toBe("lost");
    expect(s.roundReason).toBe("timeout");
    expect(s.villeBanked).toBe(LOOT.rare); // banked loot survives the night
  });

  it("costs you daylight when a thief gets clean away — but not the run", () => {
    const before = useGame.getState().dayProgress;
    useGame.getState().loseTreasureToThief();
    const s = useGame.getState();
    expect(s.dayProgress).toBeCloseTo(before + DAY.theftPenalty);
    expect(s.roundState).toBe("playing"); // a theft is a cost, not a game over
  });
});

describe("restarting", () => {
  it("keeps the wallet and the fox, resets the run", () => {
    useGame.getState().claimTreasure(0);
    useGame.getState().depositLoot();
    useGame.setState({ villeBanked: 900 });
    useGame.getState().buyItem("s_lockbox");
    useGame.getState().advanceDay(0.5);
    useGame.getState().restart();
    const s = useGame.getState();
    expect(s.villeBanked).toBe(900 - 90); // the wallet persists between days
    expect(s.villeEarned).toBe(LOOT.rare); // …and so does the fox
    expect(s.dayProgress).toBe(0);
    expect(s.treasuresBanked).toBe(0);
    expect(s.restoresLeft).toBe(REST.charges);
    expect(s.lockboxes).toBe(0); // supplies are per-run: re-kit each morning
    expect(s.roundState).toBe("playing");
  });
});
