"use client";

import { useEffect, useState } from "react";
import { bombCapacity, useGame } from "@/engine/store";
import { weaponThumb } from "./weaponThumb";
import {
  SHOP_ITEMS,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  SUPPLY_CAP,
  WEAPON_STATS,
  type ShopCategory,
  type ShopItem,
  type WeaponId,
} from "@/engine/config/shop";
import { useWallet } from "@/engine/chain/wallet";
import { isOnChainSellable, onChainItemId } from "@/engine/chain/itemIds";
import { buyItemOnChain } from "@/engine/chain/marketplace";
import { OnChainConfirm } from "./OnChainConfirm";
import { OnChainMarket } from "./OnChainMarket";

/**
 * The marketplace overlay (DESIGN §2.3). Opens when you step up to the MARKET stall
 * — the world pauses behind it. Pick a category, tap a card to inspect it, then
 * "Sign" to buy: weapons swap into your hand, upgrades change how the run plays.
 * You spend banked VILLE; the lifetime total that grows the fox is untouched.
 */
export function Shop() {
  const shopOpen = useGame((s) => s.shopOpen);
  const villeBanked = useGame((s) => s.villeBanked);
  const owned = useGame((s) => s.owned);
  const equippedWeapon = useGame((s) => s.equippedWeapon);
  const buyItem = useGame((s) => s.buyItem);
  const equipWeapon = useGame((s) => s.equipWeapon);
  const closeShop = useGame((s) => s.closeShop);

  const restoresLeft = useGame((s) => s.restoresLeft);
  const bombsLeft = useGame((s) => s.bombsLeft);
  const lockboxes = useGame((s) => s.lockboxes);

  // Supplies open the stall. On most visits that's what you're here for — the
  // permanents are a once-every-few-runs purchase.
  const [cat, setCat] = useState<ShopCategory | "trade">("supply");
  const [selId, setSelId] = useState<string | null>(null);
  const walletAddress = useWallet((s) => s.address);
  const [mintConfirm, setMintConfirm] = useState<ShopItem | null>(null);

  // Release the mouse from pointer-lock so it can click the overlay.
  useEffect(() => {
    if (shopOpen && document.pointerLockElement) document.exitPointerLock();
  }, [shopOpen]);

  // DEV-only: ?shop=1 force-opens the stall, ?weapon=<id> force-equips a gun
  // (headless UI / in-hand checks); never in prod.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    const q = new URLSearchParams(location.search);
    if (q.get("shop") === "1") useGame.getState().openShop();
    const w = q.get("weapon") as WeaponId | null;
    if (w) useGame.setState({ equippedWeapon: w });
  }, []);

  // Esc or B closes the stall.
  useEffect(() => {
    if (!shopOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyB") {
        e.preventDefault();
        closeShop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shopOpen, closeShop]);

  if (!shopOpen) return null;

  const items = SHOP_ITEMS.filter((i) => i.category === cat);
  const sel = SHOP_ITEMS.find((i) => i.id === selId) ?? null;

  // Consumables are never "owned" — they're carried, spent, and bought again.
  const isOwned = (i: ShopItem) => !i.consumable && owned.includes(i.id);
  const isEquipped = (i: ShopItem) => !!i.gunId && equippedWeapon === i.gunId;
  const canAfford = (i: ShopItem) => villeBanked >= i.price;

  /** How many of a consumable you're carrying, and the most you may carry.
   *  The chart has no count: buying it is reading it, so it's always available. */
  function stock(i: ShopItem): { have: number; cap: number } | null {
    switch (i.id) {
      case "s_restore":
        return { have: restoresLeft, cap: SUPPLY_CAP.restores };
      case "s_bomb":
        return { have: bombsLeft, cap: bombCapacity(owned) };
      case "s_lockbox":
        return { have: lockboxes, cap: SUPPLY_CAP.lockboxes };
      default:
        return null;
    }
  }

  // The footer's primary action depends on the selected item's state.
  function action(i: ShopItem) {
    if (i.consumable) {
      const s = stock(i);
      if (s && s.have >= s.cap) return { label: "PACK FULL", disabled: true, onClick: () => {} };
      if (!canAfford(i)) return { label: `NEED ${i.price - villeBanked} MORE`, disabled: true, onClick: () => {} };
      const verb = i.id === "s_chart" ? "READ IT" : "BUY";
      return { label: `${verb} · ${i.price} VILLE`, disabled: false, onClick: () => buyItem(i.id) };
    }
    if (isEquipped(i)) return { label: "EQUIPPED", disabled: true, onClick: () => {} };
    if (isOwned(i) && i.gunId) return { label: "EQUIP", disabled: false, onClick: () => equipWeapon(i.gunId!) };
    if (isOwned(i)) return { label: "OWNED", disabled: true, onClick: () => {} };
    if (!canAfford(i)) return { label: `NEED ${i.price - villeBanked} MORE`, disabled: true, onClick: () => {} };
    const verb = i.category === "weapon" ? "SIGN & EQUIP" : "SIGN";
    return { label: `${verb} · ${i.price} VILLE`, disabled: false, onClick: () => buyItem(i.id) };
  }

  return (
    <div style={styles.root}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.title}>MARKETPLACE</div>
            <div style={styles.subtitle}>Spend banked VILLE · gear changes your run</div>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.balance}>🏦 {villeBanked} VILLE</div>
            <button style={styles.close} onClick={closeShop} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div style={styles.tabs}>
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                setSelId(null);
              }}
              style={{ ...styles.tab, ...(c === cat ? styles.tabActive : null) }}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
          {/* On-chain player-to-player resale (DESIGN.md §14.9) — only worth a
              tab once a wallet exists to trade from; otherwise it's a dead end. */}
          {walletAddress && (
            <button
              onClick={() => {
                setCat("trade");
                setSelId(null);
              }}
              style={{ ...styles.tab, ...(cat === "trade" ? styles.tabActive : null) }}
            >
              🔗 Trade
            </button>
          )}
        </div>

        {cat === "trade" ? (
          <OnChainMarket />
        ) : (
          <>
            {/* Card grid */}
            <div style={styles.grid}>
              {items.map((i) => {
                const selected = i.id === selId;
                const own = isOwned(i);
                const equipped = isEquipped(i);
                const stats = i.gunId ? WEAPON_STATS[i.gunId] : null;
                // Weapons show the actual weapon. Everything else keeps its glyph.
                const thumb = i.gunId ? weaponThumb(i.gunId) : null;
                // Can't afford it? Say so on the card, rather than making the player
                // tap through to a dead Sign button to find out.
                const short = !own && i.price > villeBanked ? i.price - villeBanked : 0;
                const carried = i.consumable ? stock(i) : null;
                return (
                  <button
                    key={i.id}
                    onClick={() => setSelId(i.id)}
                    style={{
                      ...styles.card,
                      ...(selected ? styles.cardSelected : null),
                      ...(short ? styles.cardUnaffordable : null),
                    }}
                  >
                    {equipped ? (
                      <span style={styles.badgeEquipped}>EQUIPPED</span>
                    ) : own ? (
                      <span style={styles.badgeOwned}>OWNED</span>
                    ) : i.consumable ? (
                      // Price AND what's already in your pack, so the decision ("do I
                      // need another?") is answerable from the card.
                      <span style={{ ...styles.badgePrice, ...(short ? styles.badgeShort : null) }}>
                        {carried ? `${carried.have}/${carried.cap} · ${i.price}` : `${i.price}`}
                      </span>
                    ) : (
                      <span style={{ ...styles.badgePrice, ...(short ? styles.badgeShort : null) }}>
                        {i.price === 0 ? "FREE" : `${i.price}`}
                      </span>
                    )}
                    {thumb ? (
                      <img src={thumb} alt="" style={styles.cardThumb} />
                    ) : (
                      <span style={styles.cardIcon}>{i.icon}</span>
                    )}
                    <span style={styles.cardName}>{i.name}</span>
                    {stats && (
                      <span style={styles.cardStats}>
                        ⚔ {stats.damage.toFixed(2)}× · {Math.round(1 / stats.fireInterval)}/s
                      </span>
                    )}
                    {short > 0 && <span style={styles.cardShort}>need {short} more</span>}
                  </button>
                );
              })}
            </div>

            {/* Footer: selected item detail + primary action */}
            <div style={styles.footer}>
              {sel ? (
                <>
                  <div style={styles.footInfo}>
                    {sel.gunId && weaponThumb(sel.gunId) ? (
                      <img src={weaponThumb(sel.gunId)!} alt="" style={styles.footThumb} />
                    ) : (
                      <span style={styles.footIcon}>{sel.icon}</span>
                    )}
                    <div>
                      <div style={styles.footName}>{sel.name}</div>
                      <div style={styles.footDesc}>{sel.desc}</div>
                    </div>
                  </div>
                  <div style={styles.actionCol}>
                    {(() => {
                      const a = action(sel);
                      return (
                        <button
                          onClick={a.onClick}
                          disabled={a.disabled}
                          style={{ ...styles.buy, ...(a.disabled ? styles.buyDisabled : null) }}
                        >
                          {a.label}
                        </button>
                      );
                    })()}
                    {/* Separate ledger from the local purchase above (DESIGN.md §14.9) — a
                        real, sponsored/gasless on-chain mint, independent of whether the
                        local gameplay copy is owned. Only offered for permanents. */}
                    {walletAddress && isOnChainSellable(sel) && (
                      <button style={styles.mintBtn} onClick={() => setMintConfirm(sel)}>
                        🔗 Mint on-chain · {sel.price} VILLE
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={styles.footHint}>Tap an item to inspect it, then Sign to buy.</div>
              )}
            </div>
          </>
        )}
      </div>
      {mintConfirm && (
        <OnChainConfirm
          title="Mint on-chain"
          lines={[
            `${mintConfirm.name} for ${mintConfirm.price} VILLE, paid from your real on-chain balance.`,
            "Gas is on us — just sign.",
          ]}
          confirmLabel="Mint it"
          onClose={() => setMintConfirm(null)}
          onConfirm={() => buyItemOnChain(onChainItemId(mintConfirm.id), 1)}
        />
      )}
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
    pointerEvents: "auto",
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
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  balance: {
    color: GOLD,
    fontWeight: 700,
    fontSize: 15,
    background: "rgba(242,193,78,0.12)",
    border: "1px solid rgba(242,193,78,0.3)",
    borderRadius: 999,
    padding: "6px 14px",
  },
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
  tabs: { display: "flex", gap: 8, padding: "12px 20px 0" },
  tab: {
    color: "rgba(232,238,242,0.6)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    padding: "7px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabActive: {
    color: "#1a140f",
    background: GOLD,
    borderColor: GOLD,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 12,
    padding: 20,
    overflowY: "auto",
  },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "18px 12px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    cursor: "pointer",
    color: INK,
  },
  cardSelected: {
    borderColor: GOLD,
    background: "rgba(242,193,78,0.1)",
    boxShadow: "0 0 0 1px rgba(242,193,78,0.5) inset",
  },
  cardIcon: { fontSize: 40, lineHeight: 1 },
  /** The rendered weapon. Wide and short — a gun is a horizontal object. */
  cardThumb: {
    width: "100%",
    maxWidth: 118,
    height: 62,
    objectFit: "contain",
    display: "block",
  },
  /** Priced out of reach: readable, clearly not available yet, not hidden. */
  cardUnaffordable: { opacity: 0.48 },
  badgeShort: { color: "rgba(232,238,242,0.45)" },
  cardShort: { fontSize: 10.5, color: GOLD, opacity: 0.85, letterSpacing: 0.2 },
  footThumb: { width: 74, height: 44, objectFit: "contain", display: "block" },
  cardName: { fontSize: 13, fontWeight: 700, textAlign: "center" },
  cardStats: { fontSize: 11, color: "rgba(232,238,242,0.55)" },
  badgePrice: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 11,
    fontWeight: 700,
    color: GOLD,
  },
  badgeOwned: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    color: "rgba(232,238,242,0.6)",
  },
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
  footIcon: { fontSize: 30 },
  footName: { color: INK, fontWeight: 700, fontSize: 15 },
  footDesc: { color: "rgba(232,238,242,0.55)", fontSize: 12 },
  footHint: { color: "rgba(232,238,242,0.4)", fontSize: 13 },
  buy: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 10,
    padding: "12px 22px",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  buyDisabled: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(232,238,242,0.4)",
    cursor: "default",
  },
  actionCol: { display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" },
  mintBtn: {
    color: GOLD,
    background: "rgba(242,193,78,0.1)",
    border: "1px solid rgba(242,193,78,0.4)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
