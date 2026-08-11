import { createPublicClient, createWalletClient, custom, http, type WalletClient } from "viem";
import { avalanche } from "viem/chains";
import { getMagic, magicConfigured } from "@/engine/chain/magic";

const RPC_URL = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc";

/** Read-only client — balances, prices, nonces, resale listings. */
export const publicClient = createPublicClient({ chain: avalanche, transport: http(RPC_URL) });

/**
 * A viem WalletClient wrapping Magic's embedded-wallet provider, the same
 * pattern Valor uses (createWalletClient + a `custom` transport over the
 * provider's EIP-1193 interface) — gives signTypedData/writeContract without
 * ever leaving the page: Magic shows its own lightweight in-page confirmation,
 * never a redirect to a separate wallet app.
 */
export function getWalletClient(address: `0x${string}`): WalletClient | null {
  if (!magicConfigured()) return null;
  const magic = getMagic();
  return createWalletClient({
    account: address,
    chain: avalanche,
    transport: custom(magic.rpcProvider),
  });
}
