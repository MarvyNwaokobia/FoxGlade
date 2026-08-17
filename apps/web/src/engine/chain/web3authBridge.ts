/**
 * Tiny registry bridging wallet.ts's plain-module `logout()` to Web3Auth's
 * SDK, whose disconnect call only exists behind a React hook
 * (`useWeb3AuthDisconnect`, inside Web3AuthSessionProvider.tsx). wallet.ts
 * can't call a hook directly, so the provider registers its disconnect
 * function here once mounted, and logout() calls through it.
 */
let disconnect: (() => Promise<void>) | null = null;

export function registerWeb3AuthDisconnect(fn: (() => Promise<void>) | null): void {
  disconnect = fn;
}

export function disconnectWeb3Auth(): Promise<void> {
  return disconnect ? disconnect() : Promise.resolve();
}
