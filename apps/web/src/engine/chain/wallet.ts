import { create } from "zustand";
import type { MagicUserMetadata } from "magic-sdk";
import { getMagic, magicConfigured } from "@/engine/chain/magic";

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

export type WalletStatus = "idle" | "sending" | "connected" | "error";
export type WalletMethod = "magic" | "injected" | null;

interface WalletState {
  status: WalletStatus;
  address: string | null;
  email: string | null;
  /** Which of the two connect paths produced the current session — decides
   *  what, if anything, `logout` needs to unwind. */
  method: WalletMethod;
  error: string | null;

  /** Check for an already-authorized connection (call once on mount,
   *  client-side): an injected wallet that's already granted this site
   *  access (no prompt — `eth_accounts`, not `eth_requestAccounts`), else a
   *  live Magic session. */
  restore: () => Promise<void>;
  /** Email OTP login — resolves once the wallet address is known. */
  login: (email: string) => Promise<void>;
  /** Browser-wallet connect — prompts the extension for account access. */
  connectInjected: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  status: "idle",
  address: null,
  email: null,
  method: null,
  error: null,

  restore: async () => {
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
      set({ status: "connected", address: addressOf(info), email: info.email ?? null, method: "magic" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Login failed" });
    }
  },

  connectInjected: async () => {
    if (!window.ethereum) {
      set({ status: "error", error: "No browser wallet found — install MetaMask or a similar extension." });
      return;
    }
    set({ status: "sending", error: null });
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No account returned.");
      set({ status: "connected", address: accounts[0], email: null, method: "injected" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Wallet connect failed" });
    }
  },

  logout: async () => {
    try {
      if (get().method === "magic" && magicConfigured()) await getMagic().user.logout();
      // Injected wallets have no reliable programmatic disconnect (EIP-1193
      // doesn't require one) — clearing local state below is all a dapp can do;
      // the extension itself still considers this site authorized.
    } finally {
      set({ status: "idle", address: null, email: null, method: null, error: null });
    }
  },
}));
