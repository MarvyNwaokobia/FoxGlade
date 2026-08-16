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

/** Resolves `null` on any failure (relay/DB unset, network error, or no
 *  stats synced for this wallet yet) — callers treat all three identically. */
export async function pullPlayerStats(address: string): Promise<ServerPlayerStats | null> {
  try {
    const res = await fetch(`/api/chain/player?address=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    return (await res.json()) as ServerPlayerStats;
  } catch (err) {
    console.warn("[chain] player stats pull failed", err);
    return null;
  }
}
