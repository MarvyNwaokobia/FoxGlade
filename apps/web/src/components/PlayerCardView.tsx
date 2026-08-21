"use client";

import { foxGrowthFor, foxNextGrow, foxRustNow, foxStageOf, FOX_RUST } from "@/engine/config/fox";
import { SHOP_ITEMS, WEAPON_STATS, type WeaponId } from "@/engine/config/shop";
import { noseLabel } from "./Hud";
import { weaponThumb } from "./weaponThumb";

export const GOLD = "#f2c14e";
export const INK = "#e8eef2";
export const SAFE = "#7fae62";
export const MILD = "#e0a542";
export const HEAVY = "#c9605c";

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

/** The card's border/glow colour — the fox's current condition when rust data
 *  is available (same three-tier read as RustCard), gold otherwise. There's
 *  no rank ladder to colour this by (FoxGlade has none), so the one
 *  persistent, at-a-glance "how are things going" signal the game already
 *  has stands in for it. Rust is session-relative (time away from THIS
 *  browser), so a public card viewing someone else's wallet has none to show
 *  — it just stays gold. */
export function cardGlowColor(foxHoursAway?: number, foxRustBanksLeft?: number): string {
  if (foxHoursAway === undefined || foxRustBanksLeft === undefined) return GOLD;
  const rust = foxRustNow(foxHoursAway, foxRustBanksLeft);
  if (rust.speedMult >= 1) return SAFE;
  return rust.speedMult <= FOX_RUST.heavy.speedMult ? HEAVY : MILD;
}

export interface PlayerCardData {
  avatar: string | null;
  /** The player's chosen username, or null if they haven't set one. */
  identityLabel: string | null;
  /** Shown alongside identityLabel, not instead of it — every player should
   *  be able to see the wallet a card is tied to (DESIGN request, 2026-08-21:
   *  a username used to hide the address entirely, on any auth path). */
  walletAddress: string | null;
  day: number;
  treasuresBanked: number;
  villeBanked: number;
  villeEarned: number;
  equippedWeapon: WeaponId;
  owned: string[];
  /** Undefined on the public card — rust is relative to THIS browser's last
   *  play session, meaningless when a stranger is looking at someone else's
   *  wallet. */
  foxHoursAway?: number;
  foxRustBanksLeft?: number;
  /** Nighthaul has no fox companion — Profile.tsx passes gameMode().fox.
   *  Defaults true: the public card only ever renders from synced
   *  player_stats rows, which today only Foxglade ever writes. */
  showFox?: boolean;
}

/**
 * The player card's content — everything inside the frame, no frame of its
 * own. Profile.tsx wraps this in the in-game modal chrome; the public
 * /card/[address] page wraps the exact same component in a plain page
 * layout, so a shared link shows precisely what the owner sees in-game.
 */
export function PlayerCardView({
  avatar,
  identityLabel,
  walletAddress,
  day,
  treasuresBanked,
  villeBanked,
  villeEarned,
  equippedWeapon,
  owned,
  foxHoursAway,
  foxRustBanksLeft,
  showFox = true,
}: PlayerCardData) {
  const glow = cardGlowColor(foxHoursAway, foxRustBanksLeft);
  const weaponItem = SHOP_ITEMS.find((i) => i.gunId === equippedWeapon);
  const weaponName = weaponItem?.name ?? equippedWeapon;
  const weaponStats = WEAPON_STATS[equippedWeapon];
  const weaponImg = weaponThumb(equippedWeapon);
  const gear = SHOP_ITEMS.filter(
    (i) => owned.includes(i.id) && (i.category === "attachment" || i.category === "bomb" || i.category === "bag")
  );

  const foxStage = foxStageOf(owned);
  const growth = foxGrowthFor(foxStage);
  const nextGrow = foxNextGrow(owned);
  const showRust = foxHoursAway !== undefined && foxRustBanksLeft !== undefined;
  const shortAddr = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : null;
  const misread = showRust
    ? Math.min(0.95, growth.misreadChance + foxRustNow(foxHoursAway!, foxRustBanksLeft!).misreadAdd)
    : growth.misreadChance;

  return (
    <div style={{ ...styles.panel, borderColor: `${glow}45`, boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 40px ${glow}12` }}>
      <div className="fg-scroll" style={styles.body}>
        <div style={styles.identityRow}>
          <div style={{ ...styles.avatarWrap, borderColor: glow, boxShadow: `0 0 14px ${glow}44` }}>
            {avatar ? <img src={avatar} alt="" style={styles.avatarImg} /> : <span style={styles.avatarFallback}>🧭</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={styles.identityName}>The Outlier</div>
            <div style={styles.identityAddr}>{identityLabel ?? shortAddr ?? "Guest — no wallet connected"}</div>
            {identityLabel && shortAddr && <div style={styles.walletAddr}>{shortAddr}</div>}
            <div style={styles.identityMeta}>
              Day {day} · {treasuresBanked} treasures banked
            </div>
          </div>
        </div>

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
          <div style={styles.statTile}>
            <div style={styles.statValue}>{day}</div>
            <div style={styles.statLabel}>day reached</div>
          </div>
        </div>

        {showFox && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Fox</div>
            <div style={styles.foxRow}>
              <div style={styles.foxName}>🦊 {growth.name}</div>
              <div style={styles.foxNose}>{noseLabel(misread)}</div>
              {nextGrow && !showRust && <div style={styles.foxGrow}>Grows further in the Market</div>}
              {nextGrow && showRust && <div style={styles.foxGrow}>Grow it in the Market for {nextGrow.price} VILLE</div>}
            </div>
            {showRust && <RustCard hoursAway={foxHoursAway!} banksLeft={foxRustBanksLeft!} />}
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Loadout</div>
          <div style={styles.loadoutCard}>
            {weaponImg ? <img src={weaponImg} alt="" style={styles.weaponImg} /> : <span style={styles.weaponFallback}>🔫</span>}
            <div style={{ minWidth: 0 }}>
              <div style={styles.weaponName}>{weaponName}</div>
              {weaponStats && (
                <div style={styles.weaponStats}>
                  ⚔ {weaponStats.damage.toFixed(2)}× · {Math.round(1 / weaponStats.fireInterval)}/s
                </div>
              )}
            </div>
          </div>
          <div style={styles.loadoutRow}>
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
  );
}

export const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: "min(560px, 96vw)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 16,
    overflow: "hidden",
  },
  body: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 },
  identityRow: { display: "flex", alignItems: "center", gap: 14 },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 14,
    border: "2px solid",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "contain" },
  avatarFallback: { fontSize: 30 },
  identityName: { color: INK, fontWeight: 800, fontSize: 17 },
  identityAddr: { color: "rgba(232,238,242,0.55)", fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 2 },
  walletAddr: { color: "rgba(232,238,242,0.35)", fontSize: 11, fontFamily: "ui-monospace, monospace", marginTop: 1 },
  identityMeta: { color: "rgba(232,238,242,0.4)", fontSize: 11.5, marginTop: 4 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  statTile: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "12px 8px",
    textAlign: "center",
  },
  statValue: { color: GOLD, fontWeight: 800, fontSize: 17 },
  statLabel: { color: "rgba(232,238,242,0.55)", fontSize: 10.5, marginTop: 2 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionTitle: { color: "rgba(232,238,242,0.6)", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" },
  foxRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, color: INK, fontSize: 14 },
  foxName: { fontWeight: 700 },
  foxNose: { color: "rgba(232,238,242,0.6)" },
  foxGrow: { color: "rgba(232,238,242,0.45)", fontSize: 12 },
  rustCard: { border: "1px solid", borderRadius: 10, padding: "10px 12px" },
  rustTitle: { fontWeight: 800, fontSize: 13, marginBottom: 3 },
  rustBody: { color: "rgba(232,238,242,0.75)", fontSize: 12.5, lineHeight: 1.4 },
  loadoutCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 14px",
  },
  weaponImg: { width: 64, height: 40, objectFit: "contain", flexShrink: 0 },
  weaponFallback: { fontSize: 28, flexShrink: 0 },
  weaponName: { color: INK, fontWeight: 700, fontSize: 14 },
  weaponStats: { color: "rgba(232,238,242,0.5)", fontSize: 11.5, marginTop: 1 },
  loadoutRow: { display: "flex", flexWrap: "wrap", gap: 8 },
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
