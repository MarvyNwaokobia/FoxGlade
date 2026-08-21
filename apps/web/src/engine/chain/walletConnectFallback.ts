import { createConfig, http } from "wagmi";
import { connect, disconnect } from "wagmi/actions";
// Imported from its specific submodule, not the `wagmi/connectors` barrel --
// that barrel also re-exports an experimental "tempo" connector whose own
// dependency chain fails to resolve (`Module not found: Can't resolve
// 'accounts'`) and breaks the production build for everyone importing
// anything from the barrel, not just tempo itself.
import { walletConnect } from "wagmi/connectors/walletConnect";
import { avalanche } from "wagmi/chains";

/**
 * The "use if others hang" wallet-connect route, alongside Web3Auth's
 * chooser, not instead of it.
 *
 * Web3Auth's bundled WalletConnect connector hardcodes
 * `relayUrl: "wss://relay.walletconnect.com"` (@web3auth/no-modal's
 * wallet-connect-v2-connector/config.js) and its modal exposes no setting to
 * change it. On a network whose DNS resolver doesn't answer for that host
 * (confirmed here 2026-08-20 — resolves fine over public DNS like 1.1.1.1,
 * returns nothing over the local/carrier resolver) the pairing socket never
 * opens: CONNECT WALLET sits on "CONNECTING…" forever, since nothing —
 * including this app's own watchdog timers — can rescue a call stuck
 * waiting on a socket that never connects nor errors.
 *
 * Marvy already diagnosed and fixed the identical failure in Valor
 * (commit 4443e97, 2026-07-29): own ONE connector instead of Web3Auth's
 * bundled one, and the relay choice becomes ours to make — point it at
 * Reown's current relay host instead. Same relay network (WalletConnect
 * rebranded to Reown), reached through a hostname the filters don't catch.
 * This ports that exact fix.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function walletConnectFallbackConfigured(): boolean {
  return Boolean(projectId);
}

let config: ReturnType<typeof createConfig> | null = null;

function getConfig() {
  if (config) return config;
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — copy apps/web/.env.local.example to .env.local and fill it in.");
  }
  config = createConfig({
    chains: [avalanche],
    transports: { [avalanche.id]: http() },
    connectors: [
      walletConnect({
        projectId,
        // Reown's current relay host — NOT relay.walletconnect.com, the one
        // some carrier/ISP DNS resolvers don't answer for.
        relayUrl: "wss://relay.reown.com",
        // Must match a domain allowlisted in the Reown Cloud project this
        // projectId belongs to, or pairing is rejected and the mobile
        // "Open" button never arms.
        metadata: {
          name: "Foxglade",
          description: "Walled-village arena treasure hunt with a growing fox companion.",
          url: typeof window !== "undefined" ? window.location.origin : "https://foxglade.app",
          icons: ["https://foxglade.app/icon.png"],
        },
      }),
    ],
  });
  return config;
}

/** Opens WalletConnect's own pairing flow (QR on desktop, wallet-app deep link on mobile). Resolves with the connected address. */
export async function connectWalletConnectFallback(): Promise<string> {
  const cfg = getConfig();
  const result = await connect(cfg, { connector: cfg.connectors[0] });
  const address = result.accounts[0];
  if (!address) throw new Error("No account returned.");
  return address;
}

export async function disconnectWalletConnectFallback(): Promise<void> {
  if (!config) return;
  await disconnect(config);
}
