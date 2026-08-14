"use client";

import { useEffect } from "react";
import { useGame } from "@/engine/store";

const GOLD = "#f2c14e";
const INK = "#e8eef2";

interface Section {
  title: string;
  body: string;
}

/**
 * Terms & Conditions (DESIGN request, 2026-08-14) — static placeholder text,
 * reached from the hamburger menu.
 *
 * This is DRAFT copy, not reviewed by counsel. It exists so the menu entry
 * and screen are in place; the actual legal terms — especially anything
 * touching the on-chain VILLE token, NFT rewards, or player fund custody —
 * need a real legal review before this game is treated as live/public. The
 * in-app banner below says so explicitly rather than presenting this as
 * finished, same instinct the game itself has about not telling a player
 * something is true when it isn't.
 */
const SECTIONS: Section[] = [
  {
    title: "1. Acceptance",
    body: "By playing FoxGlade, you agree to these terms. If you don't agree, don't play. These terms may change as the game does; continuing to play after a change means you accept the update.",
  },
  {
    title: "2. What this is",
    body: "FoxGlade is a game. Treasure, VILLE, gear, and your fox's growth exist to make the game fun to play — none of it is a promise of investment return, and nothing here should be treated as financial advice.",
  },
  {
    title: "3. Eligibility",
    body: "You need to be old enough, under the law that applies to you, to agree to terms like these and to use any wallet or on-chain features you connect.",
  },
  {
    title: "4. Your wallet and on-chain items",
    body: "Connecting a wallet is optional. If you do, on-chain rewards (VILLE, treasure NFTs) and marketplace purchases happen on Avalanche and are subject to that network's own risks — network fees, transaction failures, and the general risk that comes with holding crypto assets. You're responsible for your own wallet and keys; we can't recover them for you.",
  },
  {
    title: "5. No warranty",
    body: "The game is provided as-is, bugs and all — this is an actively-developed indie project, not a finished, audited product. We don't guarantee it will always be available, error-free, or that any particular item, balance, or on-chain transaction will behave exactly as intended.",
  },
  {
    title: "6. Limitation of liability",
    body: "To the extent the law allows it, we're not liable for losses connected to playing the game or using its on-chain features, including lost progress, lost VILLE, or a failed on-chain transaction.",
  },
  {
    title: "7. Changes",
    body: "The game, its economy, and these terms can change as development continues. We'll try to make meaningful changes clear rather than silent.",
  },
];

/**
 * The Terms & Conditions screen. Read-only, plain scroll of static sections.
 */
export function Terms() {
  const open = useGame((s) => s.termsOpen);
  const closeTerms = useGame((s) => s.closeTerms);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeTerms();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeTerms]);

  if (!open) return null;

  return (
    <div style={styles.root} onClick={closeTerms}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>TERMS & CONDITIONS</div>
          <button style={styles.close} onClick={closeTerms} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.body}>
          <div style={styles.draftBanner}>
            Draft — this is placeholder copy, not reviewed by a lawyer. Treat it as a placeholder, not a
            finished legal document.
          </div>
          {SECTIONS.map((s) => (
            <div key={s.title} style={styles.section}>
              <div style={styles.sectionTitle}>{s.title}</div>
              <div style={styles.sectionBody}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(6,7,9,0.6)",
    backdropFilter: "blur(4px)",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  panel: {
    width: "min(600px, 96vw)",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 18, letterSpacing: 2 },
  close: {
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    width: 34,
    height: 34,
    fontSize: 16,
    cursor: "pointer",
  },
  body: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  draftBanner: {
    color: "#e0a542",
    background: "rgba(224,165,66,0.12)",
    border: "1px solid rgba(224,165,66,0.35)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.5,
  },
  section: { display: "flex", flexDirection: "column", gap: 4 },
  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: 700 },
  sectionBody: { color: "rgba(232,238,242,0.75)", fontSize: 13, lineHeight: 1.55 },
};
