"use client";

import { useState } from "react";
import { useWallet } from "@/engine/chain/wallet";
import { magicConfigured } from "@/engine/chain/magic";

/**
 * The mandatory first screen for Foxglade (Marvy's call, 2026-08-16): every
 * player has a wallet address from minute one, so this gates Onboarding
 * itself, not just something offered alongside it (see Game.tsx — this
 * replaces the old guest-play-until-you-feel-like-connecting flow).
 *
 * Two ways in, same identity requirement either side: Magic email OTP (no
 * extension needed, works everywhere) or an injected browser wallet
 * (MetaMask etc. — engine/chain/wallet.ts connectInjected). Neither signs
 * anything here; every on-chain action is relayed server-side off just the
 * address (relay.ts), so this screen's only job is learning that address.
 *
 * `checking` is the brief window while Game.tsx's mount-time `restore()` is
 * still in flight — shown instead of the form so a returning player with a
 * live session doesn't see a login screen flash before sliding straight
 * through.
 */
export function ConnectGate({ checking }: { checking: boolean }) {
  const { status, error, login, connectInjected } = useWallet();
  const [email, setEmail] = useState("");
  const sending = status === "sending";

  return (
    <div style={styles.root}>
      <div style={styles.vignette} />
      <div style={styles.panel}>
        <div style={styles.brand}>FOXGLADE</div>
        {checking ? (
          <div style={styles.checking}>Checking for an existing session…</div>
        ) : (
          <>
            <div style={styles.tagline}>
              One family holds this village, and it doesn&apos;t let a stranger through the gate without a name.
              Connect to enter — your pick and your progress travel with it.
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

            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span>or</span>
              <div style={styles.dividerLine} />
            </div>

            <button
              style={{ ...styles.walletBtn, ...(sending ? styles.ctaDisabled : null) }}
              onClick={connectInjected}
              disabled={sending}
            >
              CONNECT WALLET
            </button>

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
