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

/** Reset the pet's on-chain decay clock — fired on every successfully banked
 * treasure, same moment as claimOnChain. A 404 (no on-chain pet for this
 * wallet yet, e.g. onboarding was completed before this existed) is exactly
 * as silent as having no wallet at all. */
export function recordPetRunOnChain(): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/pet-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address }),
  }).catch((err) => {
    console.warn("[chain] pet record-run relay failed", err);
  });
}

/** Advance the pet's on-chain growth stage — fired when the player buys the
 * next fox growth tier in the shop (Young/Adult/Prime). `stage` is the
 * PetNFT.Stage enum value: 1 = Baby, 2 = Juvenile, 3 = Adult. */
export function evolvePetOnChain(stage: 1 | 2 | 3): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/pet-evolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address, stage }),
  }).catch((err) => {
    console.warn("[chain] pet evolve relay failed", err);
  });
}

/** Wake a dormant pet — fired when the player buys the Revival Charm. */
export function revivePetOnChain(): void {
  const address = useWallet.getState().address;
  if (!address) return;
  fetch("/api/chain/pet-revive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: address }),
  }).catch((err) => {
    console.warn("[chain] pet revive relay failed", err);
  });
}
