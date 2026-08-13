"use client";

import { useEffect, useState } from "react";
import { bombCapacity, useGame } from "@/engine/store";
import { weaponThumb } from "./weaponThumb";
import { itemThumb } from "./itemThumb";
import {
  SHOP_ITEMS,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  SUPPLY_CAP,
  WEAPON_STATS,
  RARITY_COLOR,
  RARITY_LABEL,
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
  const extraLives = useGame((s) => s.extraLives);

  // Supplies open the stall. On most visits that's what you're here for — the
  // permanents are a once-every-few-runs purchase.
  const [cat, setCat] = useState<ShopCategory | "trade">("supply");
  const [selId, setSelId] = useState<string | null>(null);
  const walletAddress = useWallet((s) => s.address);
  const [mintConfirm, setMintConfirm] = useState<ShopItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);

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
      case "s_extralife":
        return { have: extraLives, cap: SUPPLY_CAP.extraLives };
      default:
        return null;
    }
  }

  // The footer's primary action depends on the selected item's state. Any
  // action that actually SPENDS ville opens the confirm modal rather than
  // buying immediately — equipping something you already own stays instant,
  // there's nothing to sign for.
  function action(i: ShopItem) {
    if (i.consumable) {
      const s = stock(i);
      if (s && s.have >= s.cap) return { label: "PACK FULL", disabled: true, onClick: () => {} };
      if (!canAfford(i)) return { label: `NEED ${i.price - villeBanked} MORE`, disabled: true, onClick: () => {} };
      const verb = i.id === "s_chart" ? "READ IT" : "BUY";
      return { label: `${verb} · ${i.price} VILLE`, disabled: false, onClick: () => setConfirmItem(i) };
    }
    if (isEquipped(i)) return { label: "EQUIPPED", disabled: true, onClick: () => {} };
    if (isOwned(i) && i.gunId) return { label: "EQUIP", disabled: false, onClick: () => equipWeapon(i.gunId!) };
    if (isOwned(i)) return { label: "OWNED", disabled: true, onClick: () => {} };
    if (!canAfford(i)) return { label: `NEED ${i.price - villeBanked} MORE`, disabled: true, onClick: () => {} };
    const verb = i.category === "weapon" ? "SIGN & EQUIP" : "SIGN";
    return { label: `${verb} · ${i.price} VILLE`, disabled: false, onClick: () => setConfirmItem(i) };
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
                // Every item is a real rendered 3D model (weapons: GunMesh.ts,
                // everything else: itemModels.ts) — same PBR studio pipeline,
                // no more flat icons or emoji.
                const thumb = i.gunId ? weaponThumb(i.gunId) : itemThumb(i.id);
                // Can't afford it? Say so on the card, rather than making the player
                // tap through to a dead Sign button to find out.
                const short = !own && i.price > villeBanked ? i.price - villeBanked : 0;
                const carried = i.consumable ? stock(i) : null;
                const rc = RARITY_COLOR[i.rarity];
                return (
                  <button
                    key={i.id}
                    onClick={() => setSelId(i.id)}
                    style={{
                      ...styles.card,
                      borderColor: selected ? GOLD : `${rc}45`,
                      background: `radial-gradient(120% 90% at 50% 0%, ${rc}14, rgba(255,255,255,0.03) 65%)`,
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
                    {/* Rarity tag, top-left — a small pip + word, not a tactical stencil. */}
                    <span style={{ ...styles.rarityTag, color: rc }}>
                      <span style={{ ...styles.rarityDot, background: rc }} />
                      {RARITY_LABEL[i.rarity]}
                    </span>
                    {/* The art, on a soft glow "cast" in the rarity colour — the thing
                        that reads as a lit display case rather than a flat sticker. */}
                    <div style={styles.artWrap}>
                      <div style={{ ...styles.artGlow, background: `radial-gradient(closest-side, ${rc}40, transparent 72%)` }} />
                      {thumb ? (
                        <img src={thumb} alt="" style={styles.cardThumb} />
                      ) : (
                        <span style={styles.cardIconFallback}>{i.icon}</span>
                      )}
                    </div>
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
                    {(() => {
                      const t = sel.gunId ? weaponThumb(sel.gunId) : itemThumb(sel.id);
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
      {confirmItem && (
        <PurchaseConfirm
          item={confirmItem}
          onClose={() => setConfirmItem(null)}
          onConfirm={() => {
            buyItem(confirmItem.id);
            setConfirmItem(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The actual "sign here" moment — a real confirmation with the item in front
 * of you, not an inline button that just fires. Same panel-on-scrim pattern
 * as OnChainConfirm (this game's one other confirm dialog), sized up for the
 * art + stats a purchase decision actually wants to see before you commit.
 */
function PurchaseConfirm({
  item,
  onClose,
  onConfirm,
}: {
  item: ShopItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const rc = RARITY_COLOR[item.rarity];
  const thumb = item.gunId ? weaponThumb(item.gunId) : itemThumb(item.id);
  const stats = item.gunId ? WEAPON_STATS[item.gunId] : null;
  const verb = item.category === "weapon" ? "Sign & Equip" : item.id === "s_chart" ? "Read It" : "Sign & Buy";

  return (
    <div style={pcStyles.root} onClick={onClose}>
      <div style={pcStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={pcStyles.header}>
          <div style={pcStyles.title}>Confirm Purchase</div>
          <button style={pcStyles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ ...pcStyles.artPanel, background: `${rc}12`, borderColor: `${rc}35` }}>
          <div style={pcStyles.artRow}>
            <div style={pcStyles.artWrap}>
              <div
                style={{
                  ...pcStyles.artGlow,
                  background: `radial-gradient(closest-side, ${rc}55, transparent 72%)`,
                }}
              />
              {thumb ? (
                <img src={thumb} alt="" style={pcStyles.artThumb} />
              ) : (
                <span style={{ fontSize: 40, lineHeight: 1 }}>{item.icon}</span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={pcStyles.itemName}>{item.name}</div>
              <div style={{ ...pcStyles.rarityLabel, color: rc }}>{RARITY_LABEL[item.rarity]}</div>
            </div>
          </div>
          <div style={pcStyles.desc}>{item.desc}</div>
          {stats && (
            <div style={pcStyles.statGrid}>
              <div style={pcStyles.stat}>
                <span style={pcStyles.statLabel}>Damage</span>
                <span style={pcStyles.statValue}>{stats.damage.toFixed(2)}×</span>
              </div>
              <div style={pcStyles.stat}>
                <span style={pcStyles.statLabel}>Fire Rate</span>
                <span style={pcStyles.statValue}>{Math.round(1 / stats.fireInterval)}/s</span>
              </div>
              <div style={pcStyles.stat}>
                <span style={pcStyles.statLabel}>Magazine</span>
                <span style={pcStyles.statValue}>{stats.magSize}</span>
              </div>
              <div style={pcStyles.stat}>
                <span style={pcStyles.statLabel}>Reload</span>
                <span style={pcStyles.statValue}>{stats.reloadTime}s</span>
              </div>
            </div>
          )}
        </div>

        <div style={pcStyles.priceRow}>
          <span style={pcStyles.priceLabel}>Total</span>
          <span style={pcStyles.priceValue}>{item.price} VILLE</span>
        </div>

        <div style={pcStyles.row}>
          <button style={pcStyles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button style={pcStyles.confirm} onClick={onConfirm}>
            {verb}
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
    pointerEvents: "auto",
    padding: 16,
  },
  panel: {
    width: "min(880px, 96vw)",
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
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.1)",
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
    // A soft top-down "case" shadow inside the card — the same trick that
    // makes a shelf alcove read as lit rather than a flat swatch.
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -18px 26px rgba(0,0,0,0.35)",
    cursor: "pointer",
    color: INK,
  },
  cardSelected: {
    boxShadow: "0 0 0 1.5px rgba(242,193,78,0.65) inset, inset 0 -18px 26px rgba(0,0,0,0.3)",
  },
  /** A soft radial cast behind the art, tinted per-rarity — the "lit display
   *  case" the art sits in, rather than a flat icon floating on the card. */
  artWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 104,
  },
  artGlow: {
    position: "absolute",
    inset: -10,
    borderRadius: "50%",
    pointerEvents: "none",
  },
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
  /** The rendered weapon. Wide and short — a gun is a horizontal object. */
  cardThumb: {
    position: "relative",
    width: "100%",
    maxWidth: 168,
    height: 96,
    objectFit: "contain",
    display: "block",
  },
  /** Last-resort fallback when WebGL isn't available to render the real model. */
  cardIconFallback: { position: "relative", fontSize: 46, lineHeight: 1 },
  /** Priced out of reach: readable, clearly not available yet, not hidden. */
  cardUnaffordable: { opacity: 0.48 },
  badgeShort: { color: "rgba(232,238,242,0.45)" },
  cardShort: { fontSize: 11, color: GOLD, opacity: 0.85, letterSpacing: 0.2 },
  footThumb: { width: 110, height: 66, objectFit: "contain", display: "block" },
  cardName: { fontSize: 14.5, fontWeight: 700, textAlign: "center" },
  cardStats: { fontSize: 12, color: "rgba(232,238,242,0.55)" },
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

const pcStyles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  panel: {
    width: "min(460px, 94vw)",
    background: "linear-gradient(180deg, rgba(26,22,17,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.4)",
    borderRadius: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    padding: 20,
    color: INK,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { color: GOLD, fontWeight: 800, fontSize: 17, letterSpacing: 0.5 },
  closeBtn: {
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 13,
    cursor: "pointer",
  },
  artPanel: { borderRadius: 12, border: "1px solid", padding: 16 },
  artRow: { display: "flex", alignItems: "center", gap: 16 },
  artWrap: { position: "relative", width: 112, height: 112, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  artGlow: { position: "absolute", inset: -14, borderRadius: "50%", pointerEvents: "none" },
  artThumb: { position: "relative", width: "100%", height: "100%", objectFit: "contain" },
  itemName: { fontWeight: 800, fontSize: 18, color: INK },
  rarityLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 2 },
  desc: { fontSize: 12, color: "rgba(232,238,242,0.65)", marginTop: 10, lineHeight: 1.4 },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  stat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  statLabel: { fontSize: 8.5, color: "rgba(232,238,242,0.45)", textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: 12.5, fontWeight: 800, color: INK },
  priceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 2px 4px",
  },
  priceLabel: { fontSize: 13, color: "rgba(232,238,242,0.55)" },
  priceValue: { fontSize: 18, fontWeight: 800, color: GOLD },
  row: { display: "flex", gap: 10, marginTop: 10 },
  cancel: {
    flex: 1,
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  confirm: {
    flex: 1,
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13.5,
    fontWeight: 800,
    cursor: "pointer",
  },
};
