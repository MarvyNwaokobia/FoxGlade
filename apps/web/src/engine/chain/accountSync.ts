import { loadOnboarding, writeOnboarding, clearOnboarding } from "@/engine/onboarding";
import { pullOnboarding, pushOnboarding } from "@/engine/chain/onboardingSync";
import { pullPlayerStats, pushPlayerStats } from "@/engine/chain/playerStatsSync";
import { claimHeroOnChain, claimPetOnChain } from "@/engine/chain/relay";
import { useGame } from "@/engine/store";
import { loadSave, NEW_SAVE } from "@/engine/save";

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
 *
 * The economy save (save.ts's VILLE/day/gear) used to get the SAME
 * local-vs-server tiebreaker treatment as onboarding above, and that's what
 * let a stale/wrong local number get pushed up as a wallet's own server
 * truth (2026-08-21 bug — SaveData carried no `address` tag at all before
 * that day, so a second wallet tested on a browser that already had a first
 * wallet's progress silently inherited its VILLE, day and gear).
 *
 * As of 2026-08-21 the economy is handled differently, on purpose: the
 * server (`player_stats`) is now UNCONDITIONALLY authoritative once it has
 * data for this wallet — no more "only adopt if local looks untouched." See
 * the block below and GameState.accountReady, which Game.tsx now gates all
 * of Foxglade behind, closing the render race that let a stale local number
 * ever be visible in the first place. `foxglade.save` still gets read once
 * here, but only as a one-time MIGRATION source (a wallet that played before
 * this account-authoritative model existed, and has real progress sitting
 * only in localStorage) — never as a competing source of truth.
 */
export async function reconcileAccount(address: string): Promise<void> {
  useGame.getState().beginAccountSync();

  const local = loadOnboarding();
  const localIsThisAccounts = local.address === null || local.address === address;
  const [server, statsResult] = await Promise.all([pullOnboarding(address), pullPlayerStats(address)]);

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

  if (statsResult.ok) {
    // The server has real data for this wallet — it always wins now,
    // unconditionally, regardless of whatever's sitting in local storage.
    useGame.getState().hydrateFromServer(statsResult.stats);
    useGame.getState().markAccountReady();
    return;
  }

  if (statsResult.reason === "not-found") {
    // Confirmed by the server: this wallet has never synced. The ONLY
    // remaining question is whether `foxglade.save` holds real progress that
    // predates this wallet ever reaching the server — a one-time migration,
    // not an ongoing tiebreaker. Read raw, persisted data here, not live
    // store state: the store's own fields are always NEW_SAVE's placeholder
    // at this point (module load no longer seeds from local storage), so
    // comparing against the store would always say "fresh" and silently skip
    // a real migration.
    const rawSave = loadSave();
    const saveIsThisAccounts = rawSave.address === null || rawSave.address === address;
    const rawSaveIsFresh =
      rawSave.day === NEW_SAVE.day &&
      rawSave.villeBanked === NEW_SAVE.villeBanked &&
      rawSave.villeEarned === NEW_SAVE.villeEarned &&
      rawSave.equippedWeapon === NEW_SAVE.equippedWeapon &&
      rawSave.owned.length === NEW_SAVE.owned.length &&
      rawSave.owned.every((id, i) => id === NEW_SAVE.owned[i]);

    if (saveIsThisAccounts && !rawSaveIsFresh) {
      // Real local progress, genuinely this account's, that the server has
      // never seen — adopt it into the store (a fresh module load wouldn't
      // have) and push it up as this wallet's first server row.
      useGame.getState().hydrateFromServer({
        day: rawSave.day,
        villeBanked: rawSave.villeBanked,
        villeEarned: rawSave.villeEarned,
        treasuresBanked: 0,
        equippedWeapon: rawSave.equippedWeapon,
        owned: rawSave.owned,
        updatedAt: Date.now(),
      });
      pushPlayerStats({
        villeBanked: rawSave.villeBanked,
        villeEarned: rawSave.villeEarned,
        treasuresBanked: 0,
        day: rawSave.day,
        equippedWeapon: rawSave.equippedWeapon,
        owned: rawSave.owned,
      });
    } else if (!saveIsThisAccounts) {
      // A different wallet's leftovers on this device — reset to a genuine
      // blank slate, tagged for this address by hydrateFromServer's own
      // writeSave, instead of ever reading it as this account's progress.
      useGame.getState().hydrateFromServer({
        day: NEW_SAVE.day,
        villeBanked: NEW_SAVE.villeBanked,
        villeEarned: NEW_SAVE.villeEarned,
        treasuresBanked: 0,
        equippedWeapon: NEW_SAVE.equippedWeapon,
        owned: NEW_SAVE.owned,
        updatedAt: Date.now(),
      });
    }
    // else: already this account's save, already fresh — the store already
    // holds NEW_SAVE's placeholder, nothing to adopt or push.
    useGame.getState().markAccountReady();
    return;
  }

  if (statsResult.reason === "unavailable") {
    // No relay/DB configured for this deployment at all (e.g. local dev) —
    // a standing fact, not this wallet's fault either way. Let the player
    // in on whatever's already there rather than blocking on it, matching
    // every other "additive, not required" spot in this chain layer.
    console.warn("[chain] player stats persistence unavailable — playing without server-verified economy state");
    useGame.getState().markAccountReady();
    return;
  }

  // reason === "error": a genuine, likely transient failure. Fail closed —
  // never touch local storage or store state on an unconfirmed result, and
  // never mark ready, so Game.tsx keeps the gate up and offers a retry
  // instead of either wiping real progress or showing a stale placeholder.
  console.warn("[chain] player stats pull failed — leaving account state unresolved");
  useGame.getState().setAccountSyncError();
}
