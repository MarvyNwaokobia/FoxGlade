"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/engine/store";
import { weaponThumb } from "./weaponThumb";
import { SHOP_ITEMS, WEAPON_STATS, RARITY_COLOR, RARITY_LABEL, type ShopItem } from "@/engine/config/shop";

/**
 * The morning armory — opens at dawn, before the guardian's gate, whenever
 * there's more than one weapon owned to choose between (see store.ts
 * `armorySelectOpen` / `ownedWeaponCount`). Picking a card equips it
 * immediately, same instant-equip behaviour the marketplace already has;
 * this screen is just a dedicated moment to make that choice before heading
 * out, rather than only ever happening as a side effect of buying something.
 */
export function ArmorySelect() {
  const open = useGame((s) => s.armorySelectOpen);
  const owned = useGame((s) => s.owned);
  const equippedWeapon = useGame((s) => s.equippedWeapon);
  const equipWeapon = useGame((s) => s.equipWeapon);
  const closeArmorySelect = useGame((s) => s.closeArmorySelect);

  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) setSelId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeArmorySelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeArmorySelect]);

  if (!open) return null;

  const weapons = SHOP_ITEMS.filter((i) => i.category === "weapon" && i.gunId && owned.includes(i.id));
  const sel = SHOP_ITEMS.find((i) => i.id === selId) ?? weapons.find((i) => i.gunId === equippedWeapon) ?? null;

  return (
    <div style={styles.root}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>CHOOSE YOUR WEAPON</div>
            <div style={styles.subtitle}>Pick what you carry out this morning</div>
          </div>
          <button style={styles.close} onClick={closeArmorySelect} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.grid}>
          {weapons.map((i) => {
            const equipped = equippedWeapon === i.gunId;
            const selected = sel?.id === i.id;
            const stats = WEAPON_STATS[i.gunId!];
            const thumb = weaponThumb(i.gunId!);
            const rc = RARITY_COLOR[i.rarity];
            return (
              <button
                key={i.id}
                onClick={() => {
                  setSelId(i.id);
                  equipWeapon(i.gunId!);
                }}
                style={{
                  ...styles.card,
                  borderColor: selected ? GOLD : `${rc}45`,
                  background: `radial-gradient(120% 90% at 50% 0%, ${rc}14, rgba(255,255,255,0.03) 65%)`,
                  ...(selected ? styles.cardSelected : null),
                }}
              >
                {equipped && <span style={styles.badgeEquipped}>EQUIPPED</span>}
                <span style={{ ...styles.rarityTag, color: rc }}>
                  <span style={{ ...styles.rarityDot, background: rc }} />
                  {RARITY_LABEL[i.rarity]}
                </span>
                <div style={styles.artWrap}>
                  <div style={{ ...styles.artGlow, background: `radial-gradient(closest-side, ${rc}40, transparent 72%)` }} />
                  {thumb ? (
                    <img src={thumb} alt="" style={styles.cardThumb} />
                  ) : (
                    <span style={styles.cardIconFallback}>{i.icon}</span>
                  )}
                </div>
                <span style={styles.cardName}>{i.name}</span>
                <span style={styles.cardStats}>
                  ⚔ {stats.damage.toFixed(2)}× · {Math.round(1 / stats.fireInterval)}/s
                </span>
              </button>
            );
          })}
        </div>

        <div style={styles.footer}>
          {sel ? (
            <div style={styles.footInfo}>
              {(() => {
                const t = weaponThumb(sel.gunId!);
                return t ? (
                  <img src={t} alt="" style={styles.footThumb} />
                ) : (
                  <span style={styles.cardIconFallback}>{sel.icon}</span>
                );
              })()}
              <div>
                <div style={styles.footName}>{sel.name}</div>
                <div style={styles.footDesc}>{sel.desc}</div>
              </div>
            </div>
          ) : (
            <div style={styles.footHint}>Tap a weapon to carry it out.</div>
          )}
          <button style={styles.cta} onClick={closeArmorySelect}>
            HEAD OUT
          </button>
        </div>
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
    width: "min(760px, 96vw)",
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
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 20, letterSpacing: 3 },
  subtitle: { color: "rgba(232,238,242,0.5)", fontSize: 12, marginTop: 2 },
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))",
    gap: 14,
    padding: 20,
    overflowY: "auto",
  },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    padding: "26px 14px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -18px 26px rgba(0,0,0,0.35)",
    cursor: "pointer",
    color: INK,
  },
  cardSelected: {
    boxShadow: "0 0 0 1.5px rgba(242,193,78,0.65) inset, inset 0 -18px 26px rgba(0,0,0,0.3)",
  },
  artWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 104,
  },
  artGlow: { position: "absolute", inset: -10, borderRadius: "50%", pointerEvents: "none" },
  rarityTag: {
    position: "absolute",
    top: 8,
    left: 10,
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    opacity: 0.9,
  },
  rarityDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  cardThumb: { position: "relative", width: "100%", maxWidth: 168, height: 96, objectFit: "contain", display: "block" },
  cardIconFallback: { position: "relative", fontSize: 46, lineHeight: 1 },
  cardName: { fontSize: 14.5, fontWeight: 700, textAlign: "center" },
  cardStats: { fontSize: 12, color: "rgba(232,238,242,0.55)" },
  badgeEquipped: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    color: "#aef2cb",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 20px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.25)",
    minHeight: 64,
  },
  footInfo: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  footThumb: { width: 110, height: 66, objectFit: "contain", display: "block" },
  footName: { color: INK, fontWeight: 700, fontSize: 15 },
  footDesc: { color: "rgba(232,238,242,0.55)", fontSize: 12 },
  footHint: { color: "rgba(232,238,242,0.4)", fontSize: 13 },
  cta: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 10,
    padding: "12px 26px",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
