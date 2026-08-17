"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMagic } from "@/engine/chain/magic";

/**
 * Where Google's OAuth leg lands after magic.oauth2.loginWithRedirect() —
 * see engine/chain/magic.ts's AUTH_CALLBACK_PATH. getRedirectResult()
 * finishes the handshake and leaves Magic with a live session; from there
 * this just bounces back to "/", where Game.tsx's mount-time restore()
 * picks the session up the same way it would for a returning email-OTP
 * player. No wallet-store wiring needed here on purpose — restore() is
 * already the single source of truth for "is there a live Magic session".
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMagic()
      .oauth2.getRedirectResult()
      .then(() => {
        if (!cancelled) router.replace("/");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Sign-in failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div style={styles.root}>
      {error ? (
        <div style={styles.panel}>
          <div style={styles.error}>{error}</div>
          <button style={styles.cta} onClick={() => router.replace("/")}>
            Back to Foxglade
          </button>
        </div>
      ) : (
        <div style={styles.status}>Finishing sign-in…</div>
      )}
    </div>
  );
}

const GOLD = "#f2c14e";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(120% 100% at 50% 20%, #241c14 0%, #0a0806 70%)",
    fontFamily: "system-ui, sans-serif",
  },
  status: { color: "rgba(232,238,242,0.6)", fontSize: 13 },
  panel: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" },
  error: { color: "#f28a5c", fontSize: 13, lineHeight: 1.5, maxWidth: 320 },
  cta: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 8,
    padding: "12px 20px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
};
