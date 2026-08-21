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

// The SDK appends this div straight to document.body when its modal opens
// and never removes it on close (only replaces it the next time the modal
// opens fresh) — confirmed by reading @web3auth/modal's own source. Left
// behind, it's a position:relative, z-index:99998 layer sitting over the
// whole page.
const MODAL_CONTAINER_ID = "w3a-parent-container";
// How long to wait before deciding the modal opened but never painted
// anything (real mobile WebKit report: the screen dims but the wallet list
// never renders) versus a modal that's legitimately still mid-flow (e.g.
// WalletConnect's QR pairing step, which waits on a second device).
const BLANK_MODAL_TIMEOUT_MS = 3000;
// Hard backstop so a connect attempt can never leave the CONNECT WALLET
// button disabled forever — the SDK's own connect() promise doesn't
// reliably reject when the player just dismisses the sheet without picking
// a wallet.
const CONNECT_TIMEOUT_MS = 45000;

function modalHasContent(): boolean {
  const el = document.getElementById(MODAL_CONTAINER_ID);
  return Boolean(el && el.innerText.trim().length > 0);
}

// Best-effort cleanup run after every connect attempt settles, success or
// not. Removing the leftover container undoes the stuck-overlay half of the
// iOS Safari freeze; toggling pointer-events with a forced reflow in
// between is the standard practical workaround for the touch-pipeline half
// of that same WebKit bug class (documented against many third-party
// modal/bottom-sheet libraries, not specific to Web3Auth). Neither half is
// a guaranteed fix — the actual bug lives in code this app doesn't
// control — so this only mitigates, it doesn't promise the freeze is gone.
function cleanupModalArtifacts(): void {
  document.getElementById(MODAL_CONTAINER_ID)?.remove();
  document.body.style.pointerEvents = "none";
  void document.body.offsetHeight; // force a reflow between the two writes
  document.body.style.pointerEvents = "";
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
    let blankTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blankWatchdog = new Promise<never>((_, reject) => {
        blankTimer = setTimeout(() => {
          if (!modalHasContent()) reject(new Error("Wallet connect didn't load — tap to try again."));
        }, BLANK_MODAL_TIMEOUT_MS);
      });
      const hardBackstop = new Promise<never>((_, reject) => {
        hardTimer = setTimeout(() => reject(new Error("Wallet connect timed out — try again.")), CONNECT_TIMEOUT_MS);
      });
      await Promise.race([web3authConnect(), blankWatchdog, hardBackstop]);
    } finally {
      clearTimeout(blankTimer);
      clearTimeout(hardTimer);
      cleanupModalArtifacts();
    }
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
