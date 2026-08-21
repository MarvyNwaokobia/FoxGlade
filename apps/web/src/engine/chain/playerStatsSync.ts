import { useWallet } from "@/engine/chain/wallet";

export interface ServerPlayerStats {
  villeBanked: number;
  villeEarned: number;
  treasuresBanked: number;
  day: number;
  equippedWeapon: string;
  owned: string[];
  updatedAt: number;
}

/**
 * Server-side mirror of the player card's stats, keyed by wallet address —
 * see apps/server/src/db.ts player_stats. Purely additive, same rule as
 * claimOnChain/stampEvent (relay.ts): no wallet, or the relay/DB being
 * unset, is a silent no-op, never a blocker. What this buys a player: a
 * card readable by someone who ISN'T them (the public card page, slice 3),
 * since everything it mirrors otherwise lives only in their own
 * localStorage (engine/save.ts).
 */
export function pushPlayerStats(stats: {
  villeBanked: number;
  villeEarned: number;
  treasuresBanked: number;
  day: number;
  equippedWeapon: string;
  owned: string[];
}): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, ...stats }),
  }).catch((err) => {
    console.warn("[chain] player stats sync failed", err);
  });
}

export type PullPlayerStatsResult =
  | { ok: true; stats: ServerPlayerStats }
  | { ok: false; reason: "not-found" | "unavailable" | "error" };

/**
 * Three failure reasons, not one — accountSync.ts's reconcileAccount needs to
 * tell them apart (2026-08-21, making player_stats server-authoritative):
 * "not-found" (404 — the server confirmed this wallet has never synced) is
 * safe to treat as a genuinely fresh account; "unavailable" (503 — this
 * deployment has no relay/DB configured at all, e.g. local dev) is a standing
 * fact, not this wallet's fault, and shouldn't touch its state either way;
 * "error" (anything else, or a thrown exception) is a real, likely transient
 * failure and must NOT be read as "this account has no progress" — doing so
 * would make a network blip look like wiped progress for every returning
 * player, not just the multi-wallet-on-one-device case this replaces.
 */
export async function pullPlayerStats(address: string): Promise<PullPlayerStatsResult> {
  try {
    const res = await fetch(`/api/chain/player?address=${encodeURIComponent(address)}`);
    if (res.status === 404) return { ok: false, reason: "not-found" };
    if (res.status === 503) return { ok: false, reason: "unavailable" };
    if (!res.ok) return { ok: false, reason: "error" };
    return { ok: true, stats: (await res.json()) as ServerPlayerStats };
  } catch (err) {
    console.warn("[chain] player stats pull failed", err);
    return { ok: false, reason: "error" };
  }
}
