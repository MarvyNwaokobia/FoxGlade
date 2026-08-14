"use client";

import { useEffect } from "react";
import { useGame } from "@/engine/store";

const GOLD = "#f2c14e";
const INK = "#e8eef2";

/**
 * The bank screen (DESIGN request, 2026-08-14): a balance/earnings summary,
 * reached from the hamburger menu. Read-only — the vault itself (walk up,
 * press E) is still the only way to actually deposit; this doesn't add a
 * teleport or any other new navigation mechanic (Marvy's call: the vault is
 * already always on the minimap, so "closing this and walking there" IS the
 * shortcut).
 */
export function Bank() {
  const open = useGame((s) => s.bankOpen);
  const closeBank = useGame((s) => s.closeBank);
  const day = useGame((s) => s.day);
  const villeBanked = useGame((s) => s.villeBanked);
  const villeEarned = useGame((s) => s.villeEarned);
  const villeCarrying = useGame((s) => s.villeCarrying);
  const treasuresBanked = useGame((s) => s.treasuresBanked);
  const treasuresStolen = useGame((s) => s.treasuresStolen);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeBank();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeBank]);

  if (!open) return null;

  return (
    <div style={styles.root} onClick={closeBank}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>BANK</div>
            <div style={styles.subtitle}>Day {day}</div>
          </div>
          <button style={styles.close} onClick={closeBank} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.balanceCard}>
            <div style={styles.balanceLabel}>Balance</div>
            <div style={styles.balanceValue}>{villeBanked} VILLE</div>
          </div>

          {villeCarrying > 0 && (
            <div style={styles.carryBanner}>
              Carrying {villeCarrying} VILLE, unbanked — walk it to the vault (BANK on your minimap) to make it
              yours.
            </div>
          )}

          <div style={styles.statsRow}>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{villeEarned}</div>
              <div style={styles.statLabel}>lifetime earned</div>
            </div>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{treasuresBanked}</div>
              <div style={styles.statLabel}>treasures banked</div>
            </div>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{treasuresStolen}</div>
              <div style={styles.statLabel}>lost to thieves</div>
            </div>
          </div>
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
    width: "min(460px, 96vw)",
    maxHeight: "90vh",
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
    alignItems: "flex-start",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 20, letterSpacing: 3 },
  subtitle: { color: "rgba(232,238,242,0.5)", fontSize: 12, marginTop: 4 },
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
  body: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  balanceCard: {
    background: "rgba(242,193,78,0.1)",
    border: "1px solid rgba(242,193,78,0.3)",
    borderRadius: 12,
    padding: "18px 16px",
    textAlign: "center",
  },
  balanceLabel: { color: "rgba(232,238,242,0.6)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  balanceValue: { color: GOLD, fontWeight: 800, fontSize: 30, marginTop: 4 },
  carryBanner: {
    color: INK,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.4,
  },
  statsRow: { display: "flex", gap: 10 },
  statTile: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "12px 10px",
    textAlign: "center",
  },
  statValue: { color: GOLD, fontWeight: 800, fontSize: 18 },
  statLabel: { color: "rgba(232,238,242,0.55)", fontSize: 11, marginTop: 2 },
};
