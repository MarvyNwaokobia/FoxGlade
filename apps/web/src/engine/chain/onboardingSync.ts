import type { EggVariant } from "@/engine/onboarding";

export interface ServerOnboarding {
  hasOnboarded: boolean;
  heroId: string | null;
  eggVariant: EggVariant | null;
  completedAt: number | null;
  username: string | null;
}

export type PushOnboardingResult = { ok: true } | { ok: false; reason: "taken" | "error" };

/**
 * Server-side mirror of the onboarding pick, keyed by wallet address — see
 * apps/server/src/db.ts. Purely additive, same rule as claimOnChain/relay.ts:
 * no wallet, or the relay/DB being unset, is a silent fallback to
 * localStorage, never a blocker. The only thing this actually buys a player
 * is not re-picking a hero/egg (or re-typing a username) after reconnecting
 * the same wallet on a device that's never seen them before.
 *
 * Returns a result now (used to be fire-and-forget `void`) because the
 * username step needs to know about a 409 — someone else claimed the name
 * between the live availability check and this submit — to show that error
 * without losing the player's hero/egg picks. Existing fire-and-forget
 * callers (accountSync.ts) are unaffected; not awaiting a Promise is legal.
 */
export async function pushOnboarding(
  address: string,
  data: {
    heroId: string;
    eggVariant: EggVariant;
    hasOnboarded: boolean;
    completedAt: number | null;
    username: string | null;
  }
): Promise<PushOnboardingResult> {
  try {
    const res = await fetch("/api/chain/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, ...data }),
    });
    if (res.status === 409) return { ok: false, reason: "taken" };
    if (!res.ok) return { ok: false, reason: "error" };
    return { ok: true };
  } catch (err) {
    console.warn("[chain] onboarding sync failed", err);
    return { ok: false, reason: "error" };
  }
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

/** Live-check for the username step's input. Resolves `null` on any failure
 *  (relay/DB unset, network error) — the username step treats that as "can't
 *  tell yet," not as taken; the real, enforced check is the unique index the
 *  actual submit runs into (pushOnboarding's 409 case). `excludeAddress`
 *  lets a player re-check their OWN current name without a false "taken". */
export async function checkUsernameAvailable(username: string, excludeAddress?: string): Promise<boolean | null> {
  try {
    const qs = new URLSearchParams({ name: username });
    if (excludeAddress) qs.set("exclude", excludeAddress);
    const res = await fetch(`/api/chain/username?${qs.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { available?: boolean };
    return typeof data.available === "boolean" ? data.available : null;
  } catch (err) {
    console.warn("[chain] username availability check failed", err);
    return null;
  }
}
