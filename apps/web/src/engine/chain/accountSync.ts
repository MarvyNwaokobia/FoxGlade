import { loadOnboarding, writeOnboarding } from "@/engine/onboarding";
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
 */
export async function reconcileAccount(address: string): Promise<void> {
  const local = loadOnboarding();
  const [server, stats] = await Promise.all([pullOnboarding(address), pullPlayerStats(address)]);

  if (server?.hasOnboarded) {
    if (!local.hasOnboarded) {
      writeOnboarding({
        hasOnboarded: true,
        heroId: "man",
        eggVariant: server.eggVariant,
        completedAt: server.completedAt,
      });
    }
  } else if (local.hasOnboarded && local.eggVariant) {
    const completedAt = local.completedAt ?? Date.now();
    pushOnboarding(address, { heroId: "man", eggVariant: local.eggVariant, hasOnboarded: true, completedAt });
    claimHeroOnChain(0);
    claimPetOnChain();
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
