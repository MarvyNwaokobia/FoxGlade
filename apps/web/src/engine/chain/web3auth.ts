import { Web3Auth, WEB3AUTH_NETWORK } from "@web3auth/modal";
import { AVALANCHE } from "@/engine/chain/magic";

/**
 * Web3Auth is FoxGlade's external-wallet connector, and nothing else. Email
 * and Google both belong to Magic (magic.ts), which mints exactly one
 * wallet per identity. Web3Auth's own social logins would mint a SECOND,
 * different wallet for the same Google account, splitting one player's
 * onboarding pick, treasure and marketplace items (accountSync.ts and
 * friends) across two addresses server-side sync has no way to reconcile.
 * The whole `auth` connector is switched off below rather than trying to
 * hide it in the UI, so the modal is left offering wallet discovery only —
 * an injected extension, or WalletConnect for anything else (notably a
 * mobile browser with no injected provider at all, which is the case
 * `hasInjectedProvider()` in wallet.ts can't otherwise serve).
 */
const AVALANCHE_CHAIN_CONFIG = {
  chainNamespace: "eip155" as const,
  chainId: `0x${AVALANCHE.chainId.toString(16)}`,
  rpcTarget: AVALANCHE.rpcUrl,
  displayName: "Avalanche C-Chain",
  ticker: "AVAX",
  tickerName: "Avalanche",
  blockExplorerUrl: "https://snowtrace.io",
  logo: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
};

function createWeb3Auth(clientId: string): Web3Auth {
  return new Web3Auth({
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    chains: [AVALANCHE_CHAIN_CONFIG],
    defaultChainId: AVALANCHE_CHAIN_CONFIG.chainId,
    modalConfig: {
      connectors: {
        auth: { label: "auth", showOnModal: false },
      },
    },
  });
}

/** Whether wallet connect can even be offered (client id present). */
export function web3authConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID);
}

let initPromise: Promise<Web3Auth> | null = null;

/**
 * Lazy singleton, initialized (and its cached session restored, if any)
 * exactly once. Touches `window`, so this must only ever be called
 * client-side.
 */
export function getWeb3Auth(): Promise<Web3Auth> {
  if (!initPromise) {
    const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
    if (!clientId) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_WEB3AUTH_CLIENT_ID is not set — copy apps/web/.env.local.example to .env.local and fill it in."
        )
      );
    }
    const web3auth = createWeb3Auth(clientId);
    initPromise = web3auth.init().then(() => web3auth);
  }
  return initPromise;
}
