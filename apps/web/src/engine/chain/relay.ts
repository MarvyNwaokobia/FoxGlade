import { useWallet } from "@/engine/chain/wallet";

/**
 * Best-effort, non-blocking on-chain relay for a secured treasure bank. The
 * chain layer is additive (DESIGN.md §14.9 build order: gameplay works fully
 * without a wallet) — no wallet connected is a silent no-op, and a failed
 * relay never affects local game state, which has already been credited.
 */
export function claimOnChain(amount: number, rarityTier: 0 | 1): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address, amount, rarityTier }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn("[chain] treasure claim relay rejected", res.status, await res.text().catch(() => ""));
      }
    })
    .catch((err) => {
      console.warn("[chain] treasure claim relay failed", err);
    });
}

/** Gasless "just a stamp" event — death, a day's quota finished, or turning
 * in for the night. Same additive, no-op-without-a-wallet shape as
 * claimOnChain. */
export type GameEventType = "death" | "dayComplete" | "dayAdvanced";

export function stampEvent(eventType: GameEventType): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address, eventType }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn("[chain] event stamp relay rejected", res.status, await res.text().catch(() => ""));
      }
    })
    .catch((err) => {
      console.warn("[chain] event stamp relay failed", err);
    });
}

/** Gasless onboarding mints — hero and pet egg. Same additive shape as claimOnChain. */
export function claimHeroOnChain(heroId: number): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/hero", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address, heroId }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn("[chain] hero claim relay rejected", res.status, await res.text().catch(() => ""));
      }
    })
    .catch((err) => {
      console.warn("[chain] hero claim relay failed", err);
    });
}

export function claimPetOnChain(): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/pet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn("[chain] pet claim relay rejected", res.status, await res.text().catch(() => ""));
      }
    })
    .catch((err) => {
      console.warn("[chain] pet claim relay failed", err);
    });
}
