import { Magic } from "magic-sdk";

/**
 * Avalanche C-Chain mainnet (chainId 43114). Deploying straight to mainnet
 * (Marvy's call, 2026-08-11) — no testnet stop, see DESIGN.md §14.9.
 */
export const AVALANCHE = {
  chainId: 43114,
  rpcUrl: process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
};

let instance: Magic | null = null;

/**
 * Lazy singleton — Magic touches `window`, so this must only ever be called
 * client-side (from inside a "use client" component's effect/handler, never
 * at module scope during SSR).
 */
export function getMagic(): Magic {
  if (instance) return instance;
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_MAGIC_API_KEY is not set — copy apps/web/.env.local.example to .env.local and fill it in."
    );
  }
  instance = new Magic(apiKey, { network: AVALANCHE });
  return instance;
}

/** Whether login can even be attempted (key present) — lets the UI degrade gracefully. */
export function magicConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAGIC_API_KEY);
}
