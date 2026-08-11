import { parseSignature } from "viem";
import { publicClient, getWalletClient } from "@/engine/chain/client";
import { ADDRESSES, ARMORY_ITEMS_ABI, VILLE_TOKEN_ABI } from "@/engine/chain/contracts";
import { useWallet } from "@/engine/chain/wallet";

const PURCHASE_TYPES = {
  Purchase: [
    { name: "buyer", type: "address" },
    { name: "itemId", type: "uint256" },
    { name: "qty", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const DOMAIN = {
  name: "FoxgladeArmory",
  chainId: 43114,
  verifyingContract: ADDRESSES.armoryItems,
} as const;

function requireWallet(): { address: `0x${string}` } {
  const address = useWallet.getState().address;
  if (!address) throw new Error("Connect a wallet first");
  return { address: address as `0x${string}` };
}

/** priceOf(itemId) in VILLE wei — 0 means not listed for sale on-chain. */
export async function onChainPriceOf(itemId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "priceOf",
    args: [itemId],
  });
}

/** Real on-chain VILLE balance for the connected wallet (18 decimals). */
export async function onChainVilleBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.villeToken,
    abi: VILLE_TOKEN_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

/**
 * Gasless primary purchase: sign a Purchase intent (Magic shows its own quick
 * in-page "sign" prompt, no gas, no tx sent from here) and hand the signature
 * to the Railway relay, which submits `buyItemFor` and pays gas. Throws on
 * any failure — callers own the UI's pending/error state.
 */
export async function buyItemOnChain(itemId: bigint, qty: number): Promise<{ txHash: string }> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");

  const nonce = await publicClient.readContract({
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "nonceOf",
    args: [address],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30-minute window

  const signature = await walletClient.signTypedData({
    account: address,
    domain: DOMAIN,
    types: PURCHASE_TYPES,
    primaryType: "Purchase",
    message: { buyer: address, itemId, qty: BigInt(qty), nonce, deadline },
  });
  const { v, r, s } = parseSignature(signature);

  const res = await fetch("/api/chain/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer: address,
      itemId: itemId.toString(),
      qty,
      deadline: deadline.toString(),
      v: Number(v),
      r,
      s,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Purchase failed");
  return { txHash: data.txHash };
}

/** One-time approval so ArmoryItems can move this player's listed items. Real, player-paid tx. */
export async function approveItemsForTrading(): Promise<void> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");
  await walletClient.writeContract({
    account: address,
    chain: walletClient.chain,
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "setApprovalForAll",
    args: [ADDRESSES.armoryItems, true],
  });
}

export async function isApprovedForTrading(address: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "isApprovedForAll",
    args: [address, ADDRESSES.armoryItems],
  });
}

/** List an owned item for resale. Real, player-paid tx (Marvy's hybrid call, DESIGN.md §14.9). */
export async function listForResale(itemId: bigint, qty: number, priceVille: number): Promise<void> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");
  const price = BigInt(priceVille) * 10n ** 18n;
  await walletClient.writeContract({
    account: address,
    chain: walletClient.chain,
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "listForResale",
    args: [itemId, BigInt(qty), price],
  });
}

export async function cancelResale(resaleId: bigint): Promise<void> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");
  await walletClient.writeContract({
    account: address,
    chain: walletClient.chain,
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "cancelResale",
    args: [resaleId],
  });
}

/** Buy a resale listing. Real, player-paid tx — requires prior VILLE `approve`. */
export async function buyResaleOnChain(resaleId: bigint, priceVille: number): Promise<void> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");
  const price = BigInt(priceVille) * 10n ** 18n;

  const allowance = await publicClient.readContract({
    address: ADDRESSES.villeToken,
    abi: VILLE_TOKEN_ABI,
    functionName: "allowance",
    args: [address, ADDRESSES.armoryItems],
  });
  if (allowance < price) {
    await walletClient.writeContract({
      account: address,
      chain: walletClient.chain,
      address: ADDRESSES.villeToken,
      abi: VILLE_TOKEN_ABI,
      functionName: "approve",
      args: [ADDRESSES.armoryItems, price],
    });
  }

  await walletClient.writeContract({
    account: address,
    chain: walletClient.chain,
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "buyResale",
    args: [resaleId],
  });
}

export interface ResaleListing {
  resaleId: bigint;
  seller: `0x${string}`;
  itemId: bigint;
  qty: bigint;
  price: bigint;
  active: boolean;
}

/** Scan active resale listings. Simple linear scan — fine at this catalogue's scale. */
export async function getActiveResaleListings(): Promise<ResaleListing[]> {
  const count = await publicClient.readContract({
    address: ADDRESSES.armoryItems,
    abi: ARMORY_ITEMS_ABI,
    functionName: "nextResaleId",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const entries = await Promise.all(
    ids.map((resaleId) =>
      publicClient
        .readContract({
          address: ADDRESSES.armoryItems,
          abi: ARMORY_ITEMS_ABI,
          functionName: "resaleListings",
          args: [resaleId],
        })
        .then(([seller, itemId, qty, price, active]) => ({ resaleId, seller, itemId, qty, price, active }))
    )
  );
  return entries.filter((e) => e.active);
}
