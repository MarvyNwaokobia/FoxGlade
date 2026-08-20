"use client";

import { useEffect, useState } from "react";
import { useWallet, hasInjectedProvider } from "@/engine/chain/wallet";
import { magicConfigured } from "@/engine/chain/magic";
import { useWeb3AuthWallet } from "@/components/providers/Web3AuthSessionProvider";

/**
 * The mandatory first screen for Foxglade (Marvy's call, 2026-08-16): every
 * player has a wallet address from minute one, so this gates Onboarding
 * itself, not just something offered alongside it (see Game.tsx — this
 * replaces the old guest-play-until-you-feel-like-connecting flow).
 *
 * Three ways in, same identity requirement every side: Magic email OTP or
 * Google (both no extension needed, work everywhere — magic.ts's
 * OAuthExtension, redirecting through app/auth/callback and back), or
 * "connect a wallet you already have". The third path is two different
 * mechanisms behind one button
 * (engine/chain/wallet.ts): a desktop extension or a wallet's own in-app
 * browser injects `window.ethereum` directly, connecting in one tap with no
 * network hop — that's `connectInjected`. A plain mobile browser never has
 * one, wallet apps installed on the phone or not (there's no such thing as a
 * mobile extension), so there `hasInjectedProvider()` is false and the same
 * button instead opens Web3Auth's hosted wallet chooser, which handles the
 * pairing over managed infrastructure. Chosen over a self-hosted
 * WalletConnect connector after Valor's own history with one: its pairing
 * relay gets DNS-blackholed by a lot of consumer ISP/carrier resolvers. The
 * button only fully disappears if neither path is available (no injected
 * provider AND Web3Auth isn't configured yet).
 *
 * Neither path signs anything here; every on-chain action is relayed
 * server-side off just the address (relay.ts), so this screen's only job is
 * learning that address.
 *
 * `checking` is the brief window while Game.tsx's mount-time `restore()` is
 * still in flight — shown instead of the form so a returning player with a
 * live session doesn't see a login screen flash before sliding straight
 * through.
 */
export function ConnectGate({ checking }: { checking: boolean }) {
  const { status, error, login, loginWithGoogle, connectInjected } = useWallet();
  const { connect: connectWeb3Auth, isReady: web3authReady } = useWeb3AuthWallet();
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [email, setEmail] = useState("");
  const sending = status === "sending";
  // Checked client-side, after mount, to avoid an SSR/hydration mismatch —
  // `window` doesn't exist on the server. False on first render means the
  // wallet row below is briefly absent even on desktop; it appears a beat
  // later once this resolves (same beat Web3Auth's own `isReady` lands on,
  // for the same reason, when there's no injected provider to fall back on).
  const [walletAvailable, setWalletAvailable] = useState(false);
  useEffect(() => setWalletAvailable(hasInjectedProvider()), []);

  async function handleConnectWallet() {
    if (walletAvailable) {
      connectInjected();
      return;
    }
    useWallet.setState({ status: "sending", error: null });
    try {
      await connectWeb3Auth();
      // Success publishes the address asynchronously (Web3AuthSessionProvider
      // watches the SDK's own connected state) — nothing to set here.
    } catch (err) {
      useWallet.setState({ status: "error", error: err instanceof Error ? err.message : "Wallet connect failed" });
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.vignette} />
      <div style={styles.panel}>
        <div style={styles.brand}>FOXGLADE</div>
        {checking ? (
          <div style={styles.checking}>Checking for an existing session…</div>
        ) : step === "intro" ? (
          <>
            <div style={styles.tagline}>
              One family holds this village, and it doesn&apos;t let a stranger through the gate without a name.
              Connect to enter — your pick and your progress travel with it.
            </div>
            <button style={styles.cta} onClick={() => setStep("form")}>
              BEGIN
            </button>
          </>
        ) : (
          <>
            <button
              style={{ ...styles.googleBtn, ...(sending || !magicConfigured() ? styles.ctaDisabled : null) }}
              onClick={() => loginWithGoogle()}
              disabled={sending || !magicConfigured()}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
              </svg>
              Continue with Google
            </button>

            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span>or</span>
              <div style={styles.dividerLine} />
            </div>

            <form
              style={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && !sending) login(email.trim());
              }}
            >
              <input
                style={styles.input}
                type="email"
                placeholder="email"
                value={email}
                disabled={sending || !magicConfigured()}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                style={{ ...styles.cta, ...(sending || !email.trim() || !magicConfigured() ? styles.ctaDisabled : null) }}
                type="submit"
                disabled={sending || !email.trim() || !magicConfigured()}
              >
                {sending ? "…" : "SEND CODE"}
              </button>
            </form>
            {!magicConfigured() && <div style={styles.note}>Email sign-in isn&apos;t configured on this build.</div>}

            {(walletAvailable || web3authReady) && (
              <>
                <div style={styles.divider}>
                  <div style={styles.dividerLine} />
                  <span>or</span>
                  <div style={styles.dividerLine} />
                </div>

                <button
                  style={{ ...styles.walletBtn, ...(sending ? styles.ctaDisabled : null) }}
                  onClick={handleConnectWallet}
                  disabled={sending}
                >
                  {sending ? "CONNECTING…" : "CONNECT WALLET"}
                </button>
              </>
            )}

            {error && <div style={styles.error}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

const GOLD = "#f2c14e";
const INK = "#e8eef2";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(120% 100% at 50% 20%, #241c14 0%, #0a0806 70%)",
    fontFamily: "system-ui, sans-serif",
    overflow: "hidden",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(80% 60% at 50% 0%, rgba(242,193,78,0.08), transparent 60%)",
    pointerEvents: "none",
  },
  panel: {
    position: "relative",
    width: "min(420px, 92vw)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 16,
    background: "linear-gradient(180deg, rgba(24,20,15,0.96), rgba(14,12,10,0.98))",
    border: "1px solid rgba(242,193,78,0.3)",
    borderRadius: 18,
    boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
    padding: "40px 32px",
  },
  brand: { color: GOLD, fontSize: 30, fontWeight: 800, letterSpacing: 7 },
  checking: { color: "rgba(232,238,242,0.55)", fontSize: 13, padding: "16px 0" },
  tagline: { color: "rgba(232,238,242,0.65)", fontSize: 13, lineHeight: 1.65 },
  form: { display: "flex", gap: 8, width: "100%" },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "12px 12px",
    borderRadius: 8,
    border: "1px solid rgba(242,193,78,0.3)",
    background: "rgba(255,255,255,0.06)",
    color: INK,
    fontSize: 13,
    outline: "none",
  },
  cta: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  ctaDisabled: { opacity: 0.4, cursor: "default" },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    color: "#1a140f",
    background: "#f2f2f0",
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  note: { color: "rgba(232,238,242,0.4)", fontSize: 11, marginTop: -6 },
  divider: { display: "flex", alignItems: "center", gap: 10, width: "100%", color: "rgba(232,238,242,0.4)", fontSize: 11 },
  dividerLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.12)" },
  walletBtn: {
    width: "100%",
    color: GOLD,
    background: "transparent",
    border: "1px solid rgba(242,193,78,0.4)",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  error: { color: "#f28a5c", fontSize: 12, lineHeight: 1.5 },
};
