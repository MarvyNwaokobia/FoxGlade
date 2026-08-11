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
