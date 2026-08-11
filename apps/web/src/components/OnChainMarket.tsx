"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/engine/chain/wallet";
import { ON_CHAIN_ITEMS, onChainItemId } from "@/engine/chain/itemIds";
import {
  approveItemsForTrading,
  buyResaleOnChain,
  cancelResale,
  getActiveResaleListings,
  isApprovedForTrading,
  listForResale,
  onChainVilleBalance,
  type ResaleListing,
} from "@/engine/chain/marketplace";
import { publicClient } from "@/engine/chain/client";
import { ADDRESSES, ARMORY_ITEMS_ABI } from "@/engine/chain/contracts";
import { OnChainConfirm } from "./OnChainConfirm";

type Confirm =
  | { kind: "list"; itemId: string; localName: string; price: number }
  | { kind: "buy"; listing: ResaleListing; name: string };

/**
 * "Trade" tab — real, on-chain player-to-player resale (Marvy's call,
 * DESIGN.md §14.9: both sides are direct player-paid transactions, kept out
 * of the sponsored primary-purchase path). Only permanents (weapons,
 * attachments, bags, the bomb satchel) are on-chain sellable — consumables
 * stay purely local (see engine/chain/itemIds.ts).
 */
export function OnChainMarket() {
  const address = useWallet((s) => s.address);
  const [owned, setOwned] = useState<Record<string, bigint>>({});
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [approved, setApproved] = useState(false);
  const [villeBalance, setVilleBalance] = useState<bigint>(0n);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [listPrice, setListPrice] = useState<Record<string, string>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      const balances = await Promise.all(
        ON_CHAIN_ITEMS.map((item) =>
          publicClient
            .readContract({
              address: ADDRESSES.armoryItems,
              abi: ARMORY_ITEMS_ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`, onChainItemId(item.id)],
            })
            .then((bal) => [item.id, bal] as const)
        )
      );
      if (cancelled) return;
      setOwned(Object.fromEntries(balances));
      setApproved(await isApprovedForTrading(address as `0x${string}`));
      setVilleBalance(await onChainVilleBalance(address as `0x${string}`));
      setListings(await getActiveResaleListings());
    })();
    return () => {
      cancelled = true;
    };
  }, [address, refreshNonce]);

  if (!address) {
    return <div style={styles.empty}>Connect a wallet (top-right) to trade owned gear on-chain.</div>;
  }

  const refresh = () => setRefreshNonce((n) => n + 1);
  const ownedItems = ON_CHAIN_ITEMS.filter((i) => (owned[i.id] ?? 0n) > 0n);
  const myListings = listings.filter((l) => l.seller.toLowerCase() === address.toLowerCase());
  const othersListings = listings.filter((l) => l.seller.toLowerCase() !== address.toLowerCase());

  return (
    <div style={styles.root}>
      <div style={styles.balanceRow}>On-chain VILLE: {(Number(villeBalance) / 1e18).toFixed(0)}</div>

      <div style={styles.section}>Your on-chain gear</div>
      {!approved && ownedItems.length > 0 && (
        <button
          style={styles.approveBtn}
          onClick={async () => {
            await approveItemsForTrading();
            refresh();
          }}
        >
          Approve trading (one-time)
        </button>
      )}
      {ownedItems.length === 0 ? (
        <div style={styles.hint}>Nothing minted on-chain yet — buy a permanent item on-chain first.</div>
      ) : (
        ownedItems.map((item) => (
          <div key={item.id} style={styles.row}>
            <span style={styles.rowName}>
              {item.icon} {item.name}
            </span>
            <input
              style={styles.priceInput}
              placeholder="price"
              value={listPrice[item.id] ?? ""}
              onChange={(e) => setListPrice((p) => ({ ...p, [item.id]: e.target.value }))}
            />
            <button
              style={styles.smallBtn}
              disabled={!approved || !listPrice[item.id]}
              onClick={() =>
                setConfirm({
                  kind: "list",
                  itemId: item.id,
                  localName: item.name,
                  price: Number(listPrice[item.id]),
                })
              }
            >
              List
            </button>
          </div>
        ))
      )}

      {myListings.length > 0 && (
        <>
          <div style={styles.section}>Your active listings</div>
          {myListings.map((l) => {
            const item = ON_CHAIN_ITEMS.find((i) => onChainItemId(i.id) === l.itemId);
            return (
              <div key={l.resaleId.toString()} style={styles.row}>
                <span style={styles.rowName}>
                  {item ? `${item.icon} ${item.name}` : `item #${l.itemId.toString()}`} × {l.qty.toString()}
                </span>
                <span style={styles.rowPrice}>{Number(l.price) / 1e18} VILLE</span>
                <button
                  style={styles.smallBtn}
                  onClick={async () => {
                    await cancelResale(l.resaleId);
                    refresh();
                  }}
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </>
      )}

      <div style={styles.section}>For sale by other players</div>
      {othersListings.length === 0 ? (
        <div style={styles.hint}>No active listings right now.</div>
      ) : (
        othersListings.map((l) => {
          const item = ON_CHAIN_ITEMS.find((i) => onChainItemId(i.id) === l.itemId);
          const priceVille = Number(l.price) / 1e18;
          return (
            <div key={l.resaleId.toString()} style={styles.row}>
              <span style={styles.rowName}>
                {item ? `${item.icon} ${item.name}` : `item #${l.itemId.toString()}`} × {l.qty.toString()}
              </span>
              <span style={styles.rowPrice}>{priceVille} VILLE</span>
              <button
                style={styles.smallBtn}
                onClick={() => setConfirm({ kind: "buy", listing: l, name: item?.name ?? "this item" })}
              >
                Buy
              </button>
            </div>
          );
        })
      )}

      {confirm?.kind === "list" && (
        <OnChainConfirm
          title="List for resale"
          lines={[`${confirm.localName} for ${confirm.price} VILLE.`, "This is a real, gas-paying transaction."]}
          confirmLabel="List it"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await listForResale(onChainItemId(confirm.itemId), 1, confirm.price);
            refresh();
          }}
        />
      )}
      {confirm?.kind === "buy" && (
        <OnChainConfirm
          title="Buy on-chain"
          lines={[`${confirm.name} for ${Number(confirm.listing.price) / 1e18} VILLE.`, "This is a real, gas-paying transaction."]}
          confirmLabel="Buy it"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await buyResaleOnChain(confirm.listing.resaleId, Number(confirm.listing.price) / 1e18);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const GOLD = "#f2c14e";
const INK = "#e8eef2";

const styles: Record<string, React.CSSProperties> = {
  root: { padding: 20, overflowY: "auto", color: INK, fontSize: 13 },
  empty: { padding: 40, textAlign: "center", color: "rgba(232,238,242,0.5)", fontSize: 13 },
  balanceRow: { color: GOLD, fontWeight: 700, marginBottom: 16 },
  section: { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "rgba(232,238,242,0.5)", margin: "16px 0 8px" },
  hint: { color: "rgba(232,238,242,0.4)", fontSize: 12.5 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  rowName: { flex: 1 },
  rowPrice: { color: GOLD, fontWeight: 700 },
  priceInput: {
    width: 70,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: INK,
    padding: "5px 8px",
    fontSize: 12,
  },
  smallBtn: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  approveBtn: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
    marginBottom: 10,
  },
};
