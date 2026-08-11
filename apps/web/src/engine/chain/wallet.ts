import { create } from "zustand";
import type { MagicUserMetadata } from "magic-sdk";
import { getMagic, magicConfigured } from "@/engine/chain/magic";

function addressOf(info: MagicUserMetadata): string | null {
  return info.wallets?.ethereum?.publicAddress ?? null;
}

export type WalletStatus = "idle" | "sending" | "connected" | "error";

interface WalletState {
  status: WalletStatus;
  address: string | null;
  email: string | null;
  error: string | null;

  /** Check for an existing Magic session (call once on mount, client-side). */
  restore: () => Promise<void>;
  /** Email OTP login — resolves once the wallet address is known. */
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useWallet = create<WalletState>((set) => ({
  status: "idle",
  address: null,
  email: null,
  error: null,

  restore: async () => {
    if (!magicConfigured()) return;
    try {
      const magic = getMagic();
      const loggedIn = await magic.user.isLoggedIn();
      if (!loggedIn) return;
      const info = await magic.user.getInfo();
      set({ status: "connected", address: addressOf(info), email: info.email ?? null });
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
      set({ status: "connected", address: addressOf(info), email: info.email ?? null });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Login failed" });
    }
  },

  logout: async () => {
    try {
      if (magicConfigured()) await getMagic().user.logout();
    } finally {
      set({ status: "idle", address: null, email: null, error: null });
    }
  },
}));
