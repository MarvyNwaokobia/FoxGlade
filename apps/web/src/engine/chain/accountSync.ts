import { loadOnboarding, writeOnboarding, clearOnboarding } from "@/engine/onboarding";
import { pullOnboarding, pushOnboarding } from "@/engine/chain/onboardingSync";
import { pullPlayerStats, pushPlayerStats } from "@/engine/chain/playerStatsSync";
import { claimHeroOnChain, claimPetOnChain } from "@/engine/chain/relay";
import { useGame } from "@/engine/store";
import { NEW_SAVE } from "@/engine/save";

/**
 * Reconciles this device against the server mirrors the moment a wallet
 * address becomes known — a silent Magic session restore or an explicit
 * email-OTP connect, whichever gets there first, on or off the onboarding
 * screen (Game.tsx watches `useWallet`'s address and calls this once per
 * connect).
 *
 * Two directions, not one, because a wallet can show up either side of local
 * progress already existing:
 *   - nothing local, server has a pick/save  → adopt the server's (a
 *     returning player on a device that's never seen this wallet before).
 *   - local has a pick/save, server has none → push what's local up (a
 *     player who finished onboarding, or played a while, as a guest before
 *     ever connecting — Onboarding's own push only fires if a wallet is
 *     already connected at BEGIN time, so that pick would otherwise never
 *     reach the server at all).
 *
 * Deliberately does nothing in the genuine conflict case — local already has
 * real progress AND the server has a different snapshot. Picking a winner
 * there is a product decision (whose device wins?), not a sync bug; the
 * normal push-on-mutation path (store.ts's subscribe + syncStats) will just
 * overwrite the server with local from the next bank/sleep checkpoint on.
 *
 * A third direction guards both of the above: local's pick — complete OR a
 * mid-wizard draft (see Onboarding.tsx's step/egg/username persistence) —
 * only counts if its `address` tag is null (a guest pick, made before any
 * wallet connected) or matches the address connecting now. A tag for a
 * DIFFERENT address means this device has someone else's save (or unfinished
 * draft) on it — an earlier email/session tested here, or (2026-08-17)
 * onboarding completed while the connect gate was briefly disabled for
 * standalone testing — and must never be adopted, pushed, or resumed for
 * whoever connects next; adopting/pushing it would silently claim a pick (and
 * fire the on-chain hero/pet mint) for the wrong account, and resuming it
 * would show one account's in-progress picks to another. It's cleared
 * instead, so this address gets a genuine wizard.
 */
export async function reconcileAccount(address: string): Promise<void> {
  const local = loadOnboarding();
  const localIsThisAccounts = local.address === null || local.address === address;
  const [server, stats] = await Promise.all([pullOnboarding(address), pullPlayerStats(address)]);

  if (server?.hasOnboarded) {
    // Also adopts when local is missing a username the server already has —
    // a second device that finished the wizard (hero/egg/username) before
    // this one ever did shouldn't leave this device stuck re-asking for a
    // name that's already on file for this address.
    if (!local.hasOnboarded || !localIsThisAccounts || (!local.username && server.username)) {
      writeOnboarding({
        hasOnboarded: true,
        heroId: "man",
        eggVariant: server.eggVariant,
        completedAt: server.completedAt,
        address,
        username: server.username,
        step: null,
      });
    }
  } else if (local.hasOnboarded && local.eggVariant && local.username && localIsThisAccounts) {
    const completedAt = local.completedAt ?? Date.now();
    pushOnboarding(address, {
      heroId: "man",
      eggVariant: local.eggVariant,
      hasOnboarded: true,
      completedAt,
      username: local.username,
    });
    claimHeroOnChain(0);
    claimPetOnChain();
  } else if (!localIsThisAccounts) {
    // Same guard, but now also catches a mid-wizard DRAFT (egg/username/step,
    // hasOnboarded still false) left on this device by a different address —
    // Onboarding.tsx's sign-out button plus its resume-in-place read of this
    // draft means a second account signing in here must never see the first
    // account's in-progress picks.
    clearOnboarding();
  }

  const g = useGame.getState();
  const localIsFresh =
    g.day === NEW_SAVE.day &&
    g.villeBanked === NEW_SAVE.villeBanked &&
    g.villeEarned === NEW_SAVE.villeEarned &&
    g.equippedWeapon === NEW_SAVE.equippedWeapon &&
    g.owned.length === NEW_SAVE.owned.length &&
    g.owned.every((id, i) => id === NEW_SAVE.owned[i]);

  if (stats) {
    if (localIsFresh) g.hydrateFromServer(stats);
  } else if (!localIsFresh) {
    pushPlayerStats({
      villeBanked: g.villeBanked,
      villeEarned: g.villeEarned,
      treasuresBanked: g.treasuresBanked,
      day: g.day,
      equippedWeapon: g.equippedWeapon,
      owned: g.owned,
    });
  }
}
