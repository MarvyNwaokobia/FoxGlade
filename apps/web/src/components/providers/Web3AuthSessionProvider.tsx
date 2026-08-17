"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { Web3AuthProvider, useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { web3AuthContextConfig, web3authConfigured } from "@/engine/chain/web3auth";
import { useWallet, wasExplicitlyDisconnected } from "@/engine/chain/wallet";
import { registerWeb3AuthDisconnect } from "@/engine/chain/web3authBridge";

interface Web3AuthWalletValue {
  /** False until the SDK has booted; opening the modal before then throws. */
  isReady: boolean;
  /** Opens Web3Auth's wallet chooser. Socials are hidden (see web3auth.ts). */
  connect: () => Promise<void>;
}

const EMPTY: Web3AuthWalletValue = { isReady: false, connect: async () => {} };
const Web3AuthWalletContext = createContext<Web3AuthWalletValue>(EMPTY);

export function useWeb3AuthWallet() {
  return useContext(Web3AuthWalletContext);
}

// Inner half — must sit under Web3AuthProvider to use its hooks.
function Web3AuthBridge({ children }: { children: ReactNode }) {
  const { isConnected, isInitialized, web3Auth } = useWeb3Auth();
  const { connect: web3authConnect } = useWeb3AuthConnect();
  const { disconnect: web3authDisconnect } = useWeb3AuthDisconnect();
  const setWeb3AuthSession = useWallet((s) => s.setWeb3AuthSession);

  // wallet.ts's logout() is a plain module function and can't call this
  // hook itself — it calls through the registry instead (web3authBridge.ts).
  useEffect(() => {
    registerWeb3AuthDisconnect(async () => {
      try {
        await web3authDisconnect();
      } catch {
        // Best-effort — local state clears in wallet.ts's logout() regardless.
      }
    });
    return () => registerWeb3AuthDisconnect(null);
  }, [web3authDisconnect]);

  // Resolve the account first, publish second — publishing on `isConnected`
  // alone would surface a session before its address is actually known.
  useEffect(() => {
    const provider = web3Auth?.provider;
    if (!isConnected || !provider) {
      setWeb3AuthSession(null);
      return;
    }
    // Defense in depth against wallet.ts's own disconnected flag: logout()
    // already calls the real web3authDisconnect() when web3auth was the
    // live method, so this SDK's own isConnected should already be false by
    // the time a player returns. This only matters for the edge case where
    // some OTHER method (Magic, injected) was live at sign-out time, leaving
    // an earlier, separately-alive Web3Auth session on this device that
    // logout() never touched — surfacing that here would silently reconnect
    // exactly what the flag exists to prevent, so it gets killed instead.
    if (wasExplicitlyDisconnected()) {
      web3authDisconnect().catch(() => {});
      setWeb3AuthSession(null);
      return;
    }
    let active = true;
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (!active) return;
        setWeb3AuthSession(((accounts as string[]) ?? [])[0] ?? null);
      })
      .catch(() => {
        if (active) setWeb3AuthSession(null);
      });
    return () => {
      active = false;
    };
  }, [isConnected, web3Auth, setWeb3AuthSession]);

  const connect = useCallback(async () => {
    if (!isInitialized) throw new Error("Wallet connect is still loading — give it a moment.");
    await web3authConnect();
  }, [web3authConnect, isInitialized]);

  return <Web3AuthWalletContext.Provider value={{ isReady: isInitialized, connect }}>{children}</Web3AuthWalletContext.Provider>;
}

// Outer half. With no client id configured the SDK is skipped entirely and
// the context reports "not ready", so a missing env var costs only the
// wallet-connect-on-mobile path — Magic email sign-in is untouched.
export function Web3AuthSessionProvider({ children }: { children: ReactNode }) {
  if (!web3authConfigured()) return <>{children}</>;
  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <Web3AuthBridge>{children}</Web3AuthBridge>
    </Web3AuthProvider>
  );
}
