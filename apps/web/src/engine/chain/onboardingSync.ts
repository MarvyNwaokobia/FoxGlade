import type { EggVariant } from "@/engine/onboarding";

export interface ServerOnboarding {
  hasOnboarded: boolean;
  heroId: string | null;
  eggVariant: EggVariant | null;
  completedAt: number | null;
}

/**
 * Server-side mirror of the onboarding pick, keyed by wallet address — see
 * apps/server/src/db.ts. Purely additive, same rule as claimOnChain/relay.ts:
 * no wallet, or the relay/DB being unset, is a silent fallback to
 * localStorage, never a blocker. The only thing this actually buys a player
 * is not re-picking a hero/egg after reconnecting the same wallet on a
 * device that's never seen them before.
 */
export function pushOnboarding(
  address: string,
  data: { heroId: string; eggVariant: EggVariant; hasOnboarded: boolean; completedAt: number | null }
): void {
  fetch("/api/chain/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, ...data }),
  }).catch((err) => {
    console.warn("[chain] onboarding sync failed", err);
  });
}

/** Resolves `null` on any failure (relay/DB unset, network error) — callers
 *  treat that identically to "nothing on the server yet." */
export async function pullOnboarding(address: string): Promise<ServerOnboarding | null> {
  try {
    const res = await fetch(`/api/chain/onboarding?address=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    return (await res.json()) as ServerOnboarding;
  } catch (err) {
    console.warn("[chain] onboarding pull failed", err);
    return null;
  }
}
