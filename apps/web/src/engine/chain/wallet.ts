import { create } from "zustand";
import type { MagicUserMetadata } from "magic-sdk";
import { getMagic, magicConfigured, AUTH_CALLBACK_PATH } from "@/engine/chain/magic";
import { disconnectWeb3Auth } from "@/engine/chain/web3authBridge";
import { connectWalletConnectFallback, disconnectWalletConnectFallback } from "@/engine/chain/walletConnectFallback";

function addressOf(info: MagicUserMetadata): string | null {
  return info.wallets?.ethereum?.publicAddress ?? null;
}

/** The bare minimum of EIP-1193 this file touches — every injected wallet
 *  (MetaMask, Rabby, Coinbase's extension, Brave's built-in wallet, a mobile
 *  wallet's in-app browser) implements this. Nothing here ever signs
 *  anything: every on-chain action is relayed server-side (relay.ts) off
 *  just the address, so a raw account request is genuinely all this needs. */
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/**
 * Whether a browser-wallet provider actually exists on this page: a desktop
 * extension, or (on mobile) a wallet app's own in-app browser, which injects
 * one the same way. A plain mobile browser (Safari, Chrome) never has one —
 * there's no such thing as a mobile extension — no matter what wallet apps
 * are installed on the phone, so callers use this to decide whether offering
 * "connect wallet" makes sense at all rather than showing a button that can
 * only ever fail (see ConnectGate.tsx; lesson learned the hard way in Valor,
 * whose self-hosted WalletConnect connector then got dropped entirely after
 * its pairing relay proved unreachable behind many carrier/ISP resolvers).
 */
export function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

/**
 * Marks that the player deliberately signed out (Profile's "Sign out"),
 * distinct from just never having connected. Every silent-restore path
 * (this file's own `restore()`, and Web3AuthSessionProvider's own restore
 * effect) checks this and skips itself while it's set — without it, a
 * returning player who explicitly signed out would get silently
 * reconnected on their very next visit: an injected wallet's site
 * permission and a Magic/Web3Auth session both persist independently of
 * anything FoxGlade does (see the module comment on `restore` below), so
 * "sign out" alone was never enough to stop them auto-restoring. Cleared
 * the moment any connect path succeeds again — that's the explicit action
 * that makes auto-restore trustworthy again on the visit after.
 */
const DISCONNECTED_KEY = "foxglade.wallet.disconnected";

function markDisconnected(): void {
  try {
    localStorage.setItem(DISCONNECTED_KEY, "1");
  } catch {
    /* private browsing, quota, or no storage at all — worst case, auto-restore resumes */
  }
}

export function wasExplicitlyDisconnected(): boolean {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function clearDisconnected(): void {
  try {
    localStorage.removeItem(DISCONNECTED_KEY);
  } catch {
    /* ignore */
  }
}

export type WalletStatus = "idle" | "sending" | "connected" | "error";
export type WalletMethod = "magic" | "injected" | "web3auth" | "walletconnect" | null;

interface WalletState {
  status: WalletStatus;
  address: string | null;
  email: string | null;
  /** Which connect path produced the current session — decides what, if
   *  anything, `logout` needs to unwind. */
  method: WalletMethod;
  error: string | null;

  /** Check for an already-authorized connection (call once on mount,
   *  client-side): an injected wallet that's already granted this site
   *  access (no prompt — `eth_accounts`, not `eth_requestAccounts`), else a
   *  live Magic session. */
  restore: () => Promise<void>;
  /** Email OTP login — resolves once the wallet address is known. */
  login: (email: string) => Promise<void>;
  /** Google login via Magic's OAuth extension — redirects away from the
   *  page; resolution happens on return, at app/auth/callback, which calls
   *  `restore()` to pick up the now-live Magic session. */
  loginWithGoogle: () => Promise<void>;
  /** Browser-wallet connect — prompts the extension for account access. */
  connectInjected: () => Promise<void>;
  /** WalletConnect via Reown's relay — the "use if others hang" fallback for
   *  when Web3Auth's own chooser is stuck on a filtered relay (see
   *  walletConnectFallback.ts). `onUri` fires once the pairing URI is ready,
   *  for rendering a directly-tappable deep link. */
  connectWalletConnect: (onUri: (uri: string) => void) => Promise<void>;
  /** Published by Web3AuthSessionProvider once its SDK resolves (or loses)
   *  an address — that provider owns the actual connect/disconnect calls
   *  (they're hook-based, this store isn't), and only reports the outcome
   *  here. Clearing (`null`) is a no-op unless web3auth was the live method,
   *  so it can't stomp a session `login`/`connectInjected` just produced. */
  setWeb3AuthSession: (address: string | null) => void;
  logout: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  status: "idle",
  address: null,
  email: null,
  method: null,
  error: null,

  restore: async () => {
    if (wasExplicitlyDisconnected()) return;
    try {
      const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[] | undefined;
      if (accounts?.[0]) {
        set({ status: "connected", address: accounts[0], email: null, method: "injected" });
        return;
      }
    } catch {
      // Injected wallet present but refused/erroed the silent check — fall through to Magic.
    }
    if (!magicConfigured()) return;
    try {
      const magic = getMagic();
      const loggedIn = await magic.user.isLoggedIn();
      if (!loggedIn) return;
      const info = await magic.user.getInfo();
      set({ status: "connected", address: addressOf(info), email: info.email ?? null, method: "magic" });
    } catch {
      // No session to restore — stay idle, not an error the player needs to see.
    }
  },

  login: async (email: string) => {
    set({ status: "sending", error: null });
    try {
      const magic = getMagic();
      await magic.auth.loginWithEmailOTP({ email });
      const info = await magic.user.getInfo();
      clearDisconnected();
      set({ status: "connected", address: addressOf(info), email: info.email ?? null, method: "magic" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Login failed" });
    }
  },

  loginWithGoogle: async () => {
    set({ status: "sending", error: null });
    try {
      const magic = getMagic();
      // Tapping this button IS the explicit action that makes auto-restore
      // trustworthy again — clear before the redirect, not after, since
      // nothing runs in this tab once loginWithRedirect navigates away.
      clearDisconnected();
      await magic.oauth2.loginWithRedirect({
        provider: "google",
        redirectURI: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Google sign-in failed" });
    }
  },

  connectInjected: async () => {
    if (!window.ethereum) {
      set({ status: "error", error: "No browser wallet found — install MetaMask or a similar extension." });
      return;
    }
    set({ status: "sending", error: null });
    try {
      // Force the extension's account picker open even if this site was
      // already authorized (EIP-2255) — plain eth_requestAccounts silently
      // hands back the previously-approved account with no UI at all once a
      // site has access, which is exactly what made "sign out, then connect
      // wallet again" look like it wasn't offering a choice. Not every
      // wallet implements this permission call, so anything other than an
      // explicit user rejection (4001) just falls through to the plain
      // request below.
      try {
        await window.ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (err) {
        if ((err as { code?: number } | undefined)?.code === 4001) {
          set({ status: "idle", error: null });
          return;
        }
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No account returned.");
      clearDisconnected();
      set({ status: "connected", address: accounts[0], email: null, method: "injected" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Wallet connect failed" });
    }
  },

  connectWalletConnect: async (onUri) => {
    set({ status: "sending", error: null });
    try {
      const address = await connectWalletConnectFallback(onUri);
      clearDisconnected();
      set({ status: "connected", address, email: null, method: "walletconnect" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Wallet connect failed" });
    }
  },

  setWeb3AuthSession: (address: string | null) => {
    if (address) {
      clearDisconnected();
      set({ status: "connected", address, email: null, method: "web3auth" });
    } else if (get().method === "web3auth") {
      set({ status: "idle", address: null, email: null, method: null, error: null });
    }
  },

  logout: async () => {
    try {
      if (get().method === "magic" && magicConfigured()) await getMagic().user.logout();
      if (get().method === "web3auth") await disconnectWeb3Auth();
      if (get().method === "walletconnect") await disconnectWalletConnectFallback();
      // Injected wallets have no reliable programmatic disconnect (EIP-1193
      // doesn't require one) — clearing local state below is all a dapp can do;
      // the extension itself still considers this site authorized. That's what
      // `markDisconnected` is for: it can't revoke the extension's permission,
      // but it can stop `restore()` from silently using it next time.
    } finally {
      markDisconnected();
      set({ status: "idle", address: null, email: null, method: null, error: null });
    }
  },
}));
