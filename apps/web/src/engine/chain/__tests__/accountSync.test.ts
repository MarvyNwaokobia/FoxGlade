import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGame } from "@/engine/store";
import { useWallet } from "@/engine/chain/wallet";
import { loadSave, clearSave } from "@/engine/save";

/**
 * reconcileAccount does real network calls via these two modules — mocked so
 * this test can drive "brand-new wallet, nothing on the server yet" and "a
 * returning wallet with real server stats" without a live backend.
 */
vi.mock("@/engine/chain/onboardingSync", () => ({
  pullOnboarding: vi.fn(async () => null),
  pushOnboarding: vi.fn(async () => {}),
}));
vi.mock("@/engine/chain/playerStatsSync", () => ({
  pullPlayerStats: vi.fn(async () => null),
  pushPlayerStats: vi.fn(async () => {}),
}));
vi.mock("@/engine/chain/relay", () => ({
  claimHeroOnChain: vi.fn(async () => {}),
  claimPetOnChain: vi.fn(async () => {}),
}));

import { reconcileAccount } from "@/engine/chain/accountSync";
import { pullPlayerStats } from "@/engine/chain/playerStatsSync";

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/**
 * Regression coverage for the 2026-08-21 bug: `foxglade.save` (VILLE, day,
 * gear) lives under one fixed localStorage key shared by every wallet that
 * ever connects on a browser. Before this fix it carried no address tag at
 * all, so a second wallet tested on a device that already had a first
 * wallet's progress silently inherited its VILLE/day/gear — and then, since
 * that "local progress" looked real, PUSHED it up to the new wallet's own
 * server row, making the corruption permanent.
 *
 * Each test plays wallet A's progress through the store's own reactive
 * autosave (useGame.subscribe in store.ts) rather than writing the save
 * directly — that's the only thing that ever tags a save for real, and it's
 * what actually happened in production: wallet A was connected when its
 * VILLE/day changed, so its save was written with wallet A's address.
 */
describe("reconcileAccount — the economy save is scoped per wallet, not per device", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSave();
    useGame.getState().restart();
    useWallet.setState({ address: null });
  });

  it("never inherits a different wallet's VILLE/day/gear when the new wallet has no server stats yet", async () => {
    useWallet.setState({ address: WALLET_A });
    useGame.setState({ villeBanked: 300, villeEarned: 300, day: 1 });
    expect(loadSave().address).toBe(WALLET_A); // sanity: the autosave really did tag it

    useWallet.setState({ address: WALLET_B }); // a different wallet connects on this browser
    await reconcileAccount(WALLET_B);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(0);
    expect(s.villeEarned).toBe(0);
    expect(s.day).toBe(1);
    // The reset save is re-tagged for the wallet that's actually connected now
    // — not left un-owned, and not still carrying wallet A's tag.
    expect(loadSave().address).toBe(WALLET_B);
  });

  it("adopts wallet B's real server stats over wallet A's local leftovers", async () => {
    useWallet.setState({ address: WALLET_A });
    useGame.setState({ villeBanked: 500, villeEarned: 900, day: 3 });

    vi.mocked(pullPlayerStats).mockResolvedValueOnce({
      villeBanked: 120,
      villeEarned: 400,
      treasuresBanked: 2,
      day: 2,
      equippedWeapon: "assault_rifle",
      owned: ["w_rifle"],
      updatedAt: Date.now(),
    });

    useWallet.setState({ address: WALLET_B });
    await reconcileAccount(WALLET_B);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(120);
    expect(s.villeEarned).toBe(400);
    expect(s.day).toBe(2);
  });

  it("keeps an untagged guest save intact for the first real wallet that connects", async () => {
    // No wallet connected yet (address stays null through this write) — a
    // guest played before ever connecting, exactly onboarding.ts's own
    // "address: null" guest-pick case.
    useGame.setState({ villeBanked: 50, villeEarned: 50, day: 1 });
    expect(loadSave().address).toBeNull();

    useWallet.setState({ address: WALLET_A });
    await reconcileAccount(WALLET_A);

    // No server stats either, so the untagged guest save is left untouched
    // and pushed up as this wallet's own progress.
    expect(useGame.getState().villeBanked).toBe(50);
  });
});
