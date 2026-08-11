import { keccak256, stringToBytes } from "viem";
import { SHOP_ITEMS, type ShopItem } from "@/engine/config/shop";

/**
 * Deterministic on-chain item id from a local shop id — both sides (this app,
 * and any future tooling) compute the SAME uint256 from the string, so there's
 * no manual id-table to keep in sync anywhere. `ArmoryItems.setPrice` was
 * called with these exact values for every on-chain-sellable item (see the
 * Safe batch that shipped alongside this).
 */
export function onChainItemId(localId: string): bigint {
  return BigInt(keccak256(stringToBytes(localId)));
}

/**
 * Only PERMANENTS are sellable on-chain (DESIGN.md §14.9 marketplace slice).
 * Consumables (bandages, bombs, charts, lockboxes) stay purely local — they're
 * bought repeatedly, mid-run, and a signed on-chain purchase's latency (even
 * relayed) doesn't fit "quickly buy a bomb and keep moving". Permanents are a
 * one-time unlock, which is exactly what real on-chain ownership is for.
 */
export function isOnChainSellable(item: ShopItem): boolean {
  return !item.consumable && item.price > 0;
}

export const ON_CHAIN_ITEMS = SHOP_ITEMS.filter(isOnChainSellable);
