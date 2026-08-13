"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/engine/chain/wallet";
import { magicConfigured } from "@/engine/chain/magic";

/**
 * Magic email-OTP wallet connect, per DESIGN.md §14.8/§14.9 — first on-chain
 * slice, targeting Avalanche C-Chain mainnet directly (no testnet stop).
 * Sits under the minimap (top-right), out of the way of the loot HUD (top-left)
 * and mobile controls (bottom). Purely identity for now: no contract calls yet.
 */
export function WalletButton() {
  const { status, address, restore, login, logout } = useWallet();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const inputEl = useRef<HTMLInputElement>(null);
  const configured = magicConfigured();
  // Follows Minimap.tsx's own shrink signal: on a landscape phone (short
  // height) the minimap scales down toward its top-right corner, which moves
  // its bottom edge up — this button was fixed at 186px regardless, so on a
  // ~375-430px-tall landscape screen it overlapped the BOMB button below it.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const measure = () => setCompact(window.innerWidth < 520 || window.innerHeight < 440);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    if (configured) restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) inputEl.current?.focus();
  }, [open]);

  // 112px, not 138 — matched to Minimap.tsx's own `short` scale-down (0.6 in
  // that case vs the normal 0.72), which only opens a ~112-143px gap above
  // CROUCH at a common landscape height (~375px). A smaller pill too, so it
  // actually fits the gap instead of just starting higher and still reaching
  // into the button.
  const top = compact ? "calc(env(safe-area-inset-top, 0px) + 112px)" : "calc(env(safe-area-inset-top, 0px) + 186px)";
  const compactPill: React.CSSProperties = compact ? { padding: "5px 9px", fontSize: 11 } : {};

  if (!configured) {
    return (
      <div style={{ ...styles.pill, top, ...compactPill }} title="Set NEXT_PUBLIC_MAGIC_API_KEY in apps/web/.env.local">
        wallet: not configured
      </div>
    );
  }

  if (status === "connected" && address) {
    return (
      <button
        style={{ ...styles.pill, top, ...compactPill }}
        onClick={() => logout()}
        title={address}
      >
        🔑 {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  if (open) {
    return (
      <form
        style={{ ...styles.form, top, ...compactPill }}
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) login(email.trim());
        }}
      >
        <input
          ref={inputEl}
          style={styles.input}
          type="email"
          placeholder="email"
          value={email}
          disabled={status === "sending"}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button style={styles.submit} type="submit" disabled={status === "sending" || !email.trim()}>
          {status === "sending" ? "…" : "go"}
        </button>
      </form>
    );
  }

  return (
    <button style={{ ...styles.pill, top, ...compactPill }} onClick={() => setOpen(true)}>
      {status === "error" ? "retry connect" : "connect wallet"}
    </button>
  );
}

const base: React.CSSProperties = {
  position: "fixed",
  top: "calc(env(safe-area-inset-top, 0px) + 186px)",
  right: "calc(env(safe-area-inset-right, 0px) + 14px)",
  zIndex: 30,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 12,
  letterSpacing: 0.3,
};

const styles: Record<string, React.CSSProperties> = {
  pill: {
    ...base,
    padding: "7px 12px",
    borderRadius: 10,
    background: "rgba(16,14,12,0.94)",
    border: "1px solid rgba(242,193,78,0.4)",
    color: "#e8dcc6",
    cursor: "pointer",
    userSelect: "none",
    boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
  },
  form: {
    ...base,
    display: "flex",
    gap: 6,
    padding: 7,
    borderRadius: 10,
    background: "rgba(16,14,12,0.94)",
    border: "1px solid rgba(242,193,78,0.4)",
    boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
  },
  input: {
    width: 140,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid rgba(242,193,78,0.3)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8dcc6",
    fontSize: 12,
    outline: "none",
  },
  submit: {
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid rgba(242,193,78,0.4)",
    background: "rgba(242,193,78,0.16)",
    color: "#f2c14e",
    fontSize: 12,
    cursor: "pointer",
  },
};
