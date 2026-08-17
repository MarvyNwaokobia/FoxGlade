import { WEB3AUTH_NETWORK } from "@web3auth/modal";
import type { Web3AuthContextConfig } from "@web3auth/modal/react";
import { AVALANCHE } from "@/engine/chain/magic";

/**
 * Web3Auth is FoxGlade's EXTERNAL-WALLET connector, and nothing else — the
 * "I already have a wallet, let me connect it" path that `window.ethereum`
 * alone can't reach on a plain mobile browser (see wallet.ts's
 * `hasInjectedProvider`). Magic still owns the primary email-OTP identity;
 * mirrors Valor's own reasoning (lib/web3authConfig.ts there) for keeping
 * this wallets-only: Web3Auth's social logins would mint a NEW embedded
 * wallet, so the same player signing in with email via Magic and with,
 * say, Google via Web3Auth would end up holding two different addresses —
 * silently splitting their progress. An external wallet has no such
 * problem, since the address already belongs to the player and this only
 * ever reads it.
 *
 * Chosen over self-hosting a WalletConnect connector directly: that's what
 * Valor tried first and dropped (see foxglade-mobile-wallet-connect memory)
 * — the pairing relay gets DNS-blackholed by a lot of consumer ISP/carrier
 * resolvers. Web3Auth runs that infrastructure as a managed service instead.
 */
export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "",
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    chains: [
      {
        chainNamespace: "eip155",
        chainId: `0x${AVALANCHE.chainId.toString(16)}`,
        rpcTarget: AVALANCHE.rpcUrl,
        displayName: "Avalanche C-Chain",
        ticker: "AVAX",
        tickerName: "Avalanche",
        blockExplorerUrl: "https://snowtrace.io",
        logo: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
      },
    ],
    defaultChainId: `0x${AVALANCHE.chainId.toString(16)}`,
    // Wallets only — see the module comment above. Naming individual social
    // connectors to hide is a version-coupled trap (the modal throws on a
    // name it doesn't recognise and silently disables the connect button),
    // so this switches the whole `auth` connector off instead.
    modalConfig: {
      connectors: {
        auth: { label: "auth", showOnModal: false },
      },
    },
  },
};

/** Whether Web3Auth can even be attempted (client id present). */
export function web3authConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID);
}
