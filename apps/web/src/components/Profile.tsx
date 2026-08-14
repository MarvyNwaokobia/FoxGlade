"use client";

import { useEffect } from "react";
import { useGame } from "@/engine/store";
import { gameMode } from "@/engine/config/mode";
import { foxGrowthFor, foxNextGrow, foxRustNow, foxStageOf, FOX_RUST } from "@/engine/config/fox";
import { SHOP_ITEMS } from "@/engine/config/shop";
import { noseLabel } from "./Hud";

const GOLD = "#f2c14e";
const INK = "#e8eef2";
const SAFE = "#7fae62";
const MILD = "#e0a542";
const HEAVY = "#c9605c";

/**
 * The fox-rust status card (DESIGN request, 2026-08-14: modeled on the shape
 * of a decay/condition panel — clear state, why it's that way, what clears
 * it — just re-themed for FOX_RUST, config/fox.ts, instead of a rank decay).
 * Three states, not four: FoxGlade has no "protection" item to freeze rust
 * against, so there's no analogue to a shield-frozen state.
 */
function RustCard({ hoursAway, banksLeft }: { hoursAway: number; banksLeft: number }) {
  const rust = foxRustNow(hoursAway, banksLeft);
  if (rust.speedMult >= 1) {
    return (
      <div style={{ ...styles.rustCard, borderColor: `${SAFE}55`, background: `${SAFE}14` }}>
        <div style={{ ...styles.rustTitle, color: SAFE }}>Sharp</div>
        <div style={styles.rustBody}>No rust — the fox is reading the ground at its full stage.</div>
      </div>
    );
  }
  const heavy = rust.speedMult <= FOX_RUST.heavy.speedMult;
  const color = heavy ? HEAVY : MILD;
  return (
    <div style={{ ...styles.rustCard, borderColor: `${color}55`, background: `${color}14` }}>
      <div style={{ ...styles.rustTitle, color }}>{heavy ? "Badly rusty" : "Rusty"}</div>
      <div style={styles.rustBody}>
        Time away slowed its feet and dulled its nose{heavy ? " badly" : ""} — bank {banksLeft} more treasure
        {banksLeft === 1 ? "" : "s"} to wear it off.
      </div>
    </div>
  );
}

/**
 * The profile screen (DESIGN request, 2026-08-14): stats, loadout and the
 * fox's condition in one place, reached from the hamburger menu. Read-only —
 * growing the fox or buying gear still happens at the Market.
 */
export function Profile() {
  const open = useGame((s) => s.profileOpen);
  const closeProfile = useGame((s) => s.closeProfile);
  const day = useGame((s) => s.day);
  const treasuresBanked = useGame((s) => s.treasuresBanked);
  const villeBanked = useGame((s) => s.villeBanked);
  const villeEarned = useGame((s) => s.villeEarned);
  const owned = useGame((s) => s.owned);
  const equippedWeapon = useGame((s) => s.equippedWeapon);
  const foxHoursAway = useGame((s) => s.foxHoursAway);
  const foxRustBanksLeft = useGame((s) => s.foxRustBanksLeft);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeProfile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeProfile]);

  if (!open) return null;

  const weaponName = SHOP_ITEMS.find((i) => i.gunId === equippedWeapon)?.name ?? equippedWeapon;
  const gear = SHOP_ITEMS.filter(
    (i) => owned.includes(i.id) && (i.category === "attachment" || i.category === "bomb" || i.category === "bag")
  );

  const foxStage = foxStageOf(owned);
  const growth = foxGrowthFor(foxStage);
  const nextGrow = foxNextGrow(owned);
  const rustNow = foxRustNow(foxHoursAway, foxRustBanksLeft);
  const misread = Math.min(0.95, growth.misreadChance + rustNow.misreadAdd);

  return (
    <div style={styles.root} onClick={closeProfile}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>PROFILE</div>
            <div style={styles.subtitle}>Day {day} · {treasuresBanked} treasures banked</div>
          </div>
          <button style={styles.close} onClick={closeProfile} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.statsRow}>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{villeBanked}</div>
              <div style={styles.statLabel}>VILLE banked</div>
            </div>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{villeEarned}</div>
              <div style={styles.statLabel}>lifetime earned</div>
            </div>
            <div style={styles.statTile}>
              <div style={styles.statValue}>{treasuresBanked}</div>
              <div style={styles.statLabel}>treasures banked</div>
            </div>
          </div>

          {gameMode().fox && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Fox</div>
              <div style={styles.foxRow}>
                <div style={styles.foxName}>🦊 {growth.name}</div>
                <div style={styles.foxNose}>{noseLabel(misread)}</div>
                {nextGrow && (
                  <div style={styles.foxGrow}>Grow it in the Market for {nextGrow.price} VILLE</div>
                )}
              </div>
              <RustCard hoursAway={foxHoursAway} banksLeft={foxRustBanksLeft} />
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Loadout</div>
            <div style={styles.loadoutRow}>
              <span style={styles.weaponTag}>🔫 {weaponName}</span>
              {gear.map((i) => (
                <span key={i.id} style={styles.gearTag}>
                  {i.icon} {i.name}
                </span>
              ))}
              {gear.length === 0 && <span style={styles.noGear}>no gear bought yet</span>}
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
    width: "min(560px, 96vw)",
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
  body: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 },
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
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionTitle: { color: "rgba(232,238,242,0.6)", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" },
  foxRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, color: INK, fontSize: 14 },
  foxName: { fontWeight: 700 },
  foxNose: { color: "rgba(232,238,242,0.6)" },
  foxGrow: { color: "rgba(232,238,242,0.45)", fontSize: 12 },
  rustCard: { border: "1px solid", borderRadius: 10, padding: "10px 12px" },
  rustTitle: { fontWeight: 800, fontSize: 13, marginBottom: 3 },
  rustBody: { color: "rgba(232,238,242,0.75)", fontSize: 12.5, lineHeight: 1.4 },
  loadoutRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  weaponTag: {
    color: GOLD,
    background: "rgba(242,193,78,0.12)",
    border: "1px solid rgba(242,193,78,0.3)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
  },
  gearTag: {
    color: INK,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
  },
  noGear: { color: "rgba(232,238,242,0.4)", fontSize: 12.5, fontStyle: "italic" },
};
