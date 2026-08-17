import { Magic } from "magic-sdk";
import { OAuthExtension } from "@magic-ext/oauth2";

/**
 * Avalanche C-Chain mainnet (chainId 43114). Deploying straight to mainnet
 * (Marvy's call, 2026-08-11) — no testnet stop, see DESIGN.md §14.9.
 */
export const AVALANCHE = {
  chainId: 43114,
  rpcUrl: process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
};

/**
 * Google's OAuth leg (magic.oauth2.loginWithRedirect) leaves the page and
 * comes back here to finish — must match a route registered in BOTH Google
 * Cloud Console's authorized redirect URIs AND Magic dashboard's "Allowed
 * Origins & Redirects" for this app (see app/auth/callback/page.tsx).
 */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Magic's type with the OAuth extension's `.oauth2` namespace attached. */
type MagicWithOAuth = ReturnType<typeof createMagic>;

let instance: MagicWithOAuth | null = null;

function createMagic(apiKey: string) {
  return new Magic(apiKey, { network: AVALANCHE, extensions: [new OAuthExtension()] });
}

/**
 * Lazy singleton — Magic touches `window`, so this must only ever be called
 * client-side (from inside a "use client" component's effect/handler, never
 * at module scope during SSR).
 */
export function getMagic(): MagicWithOAuth {
  if (instance) return instance;
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_MAGIC_API_KEY is not set — copy apps/web/.env.local.example to .env.local and fill it in."
    );
  }
  instance = createMagic(apiKey);
  return instance;
}

/** Whether login can even be attempted (key present) — lets the UI degrade gracefully. */
export function magicConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAGIC_API_KEY);
}
