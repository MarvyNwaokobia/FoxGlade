import { publicClient, getWalletClient } from "@/engine/chain/client";
import { ADDRESSES, SEASON_REWARDS_ABI } from "@/engine/chain/contracts";
import { useWallet } from "@/engine/chain/wallet";

function requireWallet(): { address: `0x${string}` } {
  const address = useWallet.getState().address;
  if (!address) throw new Error("Connect a wallet first");
  return { address: address as `0x${string}` };
}

/** The season currently open for scoring — 0 if none has ever been started. */
export async function currentSeasonId(): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.seasonRewards,
    abi: SEASON_REWARDS_ABI,
    functionName: "currentSeasonId",
  });
}

/** Native AVAX (wei) this wallet can claim for a finalized season — 0 until
 * the season is over and Marvy has run `finalizeSeason` from the Safe. */
export async function claimableReward(seasonId: bigint, address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.seasonRewards,
    abi: SEASON_REWARDS_ABI,
    functionName: "claimable",
    args: [seasonId, address],
  });
}

/** Winner-initiated claim — a real, player-paid tx (the contract pays the
 * player's own wallet directly, so the payout tx is attributable to them;
 * DESIGN.md §7/§11). No relay: nothing to sponsor here. */
export async function claimSeasonReward(seasonId: bigint): Promise<void> {
  const { address } = requireWallet();
  const walletClient = getWalletClient(address);
  if (!walletClient) throw new Error("Wallet not ready");
  await walletClient.writeContract({
    account: address,
    chain: walletClient.chain,
    address: ADDRESSES.seasonRewards,
    abi: SEASON_REWARDS_ABI,
    functionName: "claimReward",
    args: [seasonId],
  });
}
