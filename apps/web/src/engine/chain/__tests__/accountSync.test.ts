import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGame } from "@/engine/store";
import { useWallet } from "@/engine/chain/wallet";
import { loadSave, clearSave } from "@/engine/save";

/**
 * reconcileAccount does real network calls via these two modules — mocked so
 * this test can drive every pullPlayerStats outcome (found / not-found /
 * unavailable / error) without a live backend.
 */
vi.mock("@/engine/chain/onboardingSync", () => ({
  pullOnboarding: vi.fn(async () => null),
  pushOnboarding: vi.fn(async () => {}),
}));
vi.mock("@/engine/chain/playerStatsSync", () => ({
  pullPlayerStats: vi.fn(async () => ({ ok: false, reason: "not-found" })),
  pushPlayerStats: vi.fn(async () => {}),
}));
vi.mock("@/engine/chain/relay", () => ({
  claimHeroOnChain: vi.fn(async () => {}),
  claimPetOnChain: vi.fn(async () => {}),
}));

import { reconcileAccount } from "@/engine/chain/accountSync";
import { pullPlayerStats, pushPlayerStats } from "@/engine/chain/playerStatsSync";

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/**
 * Two eras of coverage here, both against the same bug family:
 *
 * The 2026-08-21 fix — `foxglade.save` (VILLE, day, gear) used to live under
 * one fixed localStorage key with no wallet-address tag, so a second wallet
 * tested on a device that already had a first wallet's progress silently
 * inherited its VILLE/day/gear, and got that stale number pushed to its own
 * server row.
 *
 * The SAME-DAY follow-up — making `player_stats` unconditionally
 * server-authoritative, instead of only trusted "if local looks fresh."
 * That model traded one risk for another (a network blip could look like
 * wiped progress), so most of the coverage below is about proving THAT
 * never happens: "not-found" (confirmed empty) resets cleanly, "unavailable"
 * (no relay/DB configured) and "error" (a real failure) never touch
 * existing state, and only "error" withholds accountReady.
 *
 * Each test plays wallet A's progress through the store's own reactive
 * autosave (useGame.subscribe in store.ts) rather than writing the save
 * directly — that's the only thing that ever tags a save for real, and it's
 * what actually happened in production: wallet A was connected when its
 * VILLE/day changed, so its save was written with wallet A's address.
 */
describe("reconcileAccount — player_stats is server-authoritative, never wiped by a mere blip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pullPlayerStats).mockResolvedValue({ ok: false, reason: "not-found" });
    clearSave();
    useGame.getState().restart();
    useWallet.setState({ address: null });
  });

  it("resets a different wallet's leftover VILLE/day/gear to a clean slate, tagged for the new wallet, without pushing anything", async () => {
    useWallet.setState({ address: WALLET_A });
    useGame.setState({ villeBanked: 300, villeEarned: 300, day: 1 });
    expect(loadSave().address).toBe(WALLET_A); // sanity: the autosave really did tag it

    useWallet.setState({ address: WALLET_B }); // a different wallet connects on this browser
    await reconcileAccount(WALLET_B);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(0);
    expect(s.villeEarned).toBe(0);
    expect(s.day).toBe(1);
    expect(s.accountReady).toBe(true);
    // The reset save is re-tagged for the wallet that's actually connected now
    // — not left un-owned, and not still carrying wallet A's tag.
    expect(loadSave().address).toBe(WALLET_B);
    // Wallet A's leftovers were never wallet B's to report as progress.
    expect(pushPlayerStats).not.toHaveBeenCalled();
  });

  it("adopts wallet B's real server stats unconditionally, over wallet A's local leftovers", async () => {
    useWallet.setState({ address: WALLET_A });
    useGame.setState({ villeBanked: 500, villeEarned: 900, day: 3 });

    vi.mocked(pullPlayerStats).mockResolvedValueOnce({
      ok: true,
      stats: {
        villeBanked: 120,
        villeEarned: 400,
        treasuresBanked: 2,
        day: 2,
        equippedWeapon: "assault_rifle",
        owned: ["w_rifle"],
        updatedAt: Date.now(),
      },
    });

    useWallet.setState({ address: WALLET_B });
    await reconcileAccount(WALLET_B);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(120);
    expect(s.villeEarned).toBe(400);
    expect(s.day).toBe(2);
    expect(s.accountReady).toBe(true);
  });

  it("migrates an untagged guest save into the store and pushes it as this wallet's first server row", async () => {
    // No wallet connected yet (address stays null through this write) — a
    // guest played before ever connecting, exactly onboarding.ts's own
    // "address: null" guest-pick case.
    useGame.setState({ villeBanked: 50, villeEarned: 50, day: 1 });
    expect(loadSave().address).toBeNull();

    useWallet.setState({ address: WALLET_A });
    await reconcileAccount(WALLET_A);

    // The store starts every session from NEW_SAVE's placeholder now (not
    // local storage) — the only way it ends up back at 50 is the one-time
    // migration path actually running, which is also what proves the guest
    // numbers reached the server as wallet A's own first row.
    const s = useGame.getState();
    expect(s.villeBanked).toBe(50);
    expect(s.villeEarned).toBe(50);
    expect(s.accountReady).toBe(true);
    expect(pushPlayerStats).toHaveBeenCalledWith(
      expect.objectContaining({ villeBanked: 50, villeEarned: 50, day: 1 })
    );
  });

  it("does not wipe existing progress or mark the account ready on a genuine error", async () => {
    useWallet.setState({ address: WALLET_A });
    // Simulate state left over from an earlier, successful reconcile this
    // session — a retry (e.g. ConnectGate's retry button) must not clobber it.
    useGame.setState({ villeBanked: 777, villeEarned: 999, day: 5, accountReady: true });

    vi.mocked(pullPlayerStats).mockResolvedValueOnce({ ok: false, reason: "error" });
    await reconcileAccount(WALLET_A);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(777);
    expect(s.villeEarned).toBe(999);
    expect(s.day).toBe(5);
    expect(s.accountReady).toBe(false); // beginAccountSync drops it; error never restores it
    expect(s.accountSyncError).toBe(true);
    expect(pushPlayerStats).not.toHaveBeenCalled();
  });

  it("lets the player in without touching state when the relay/DB isn't configured", async () => {
    useWallet.setState({ address: WALLET_A });
    useGame.setState({ villeBanked: 42, villeEarned: 42, day: 2 });

    vi.mocked(pullPlayerStats).mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    await reconcileAccount(WALLET_A);

    const s = useGame.getState();
    expect(s.villeBanked).toBe(42);
    expect(s.villeEarned).toBe(42);
    expect(s.day).toBe(2);
    expect(s.accountReady).toBe(true);
    expect(s.accountSyncError).toBe(false);
    expect(pushPlayerStats).not.toHaveBeenCalled();
  });
});
