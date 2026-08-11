import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche } from "viem/chains";

const PRIVATE_KEY = process.env.GAME_SERVER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("GAME_SERVER_PRIVATE_KEY is required");
}

const RPC_URL = process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc";

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const transport = http(RPC_URL);

export const publicClient = createPublicClient({ chain: avalanche, transport });
export const walletClient = createWalletClient({ account, chain: avalanche, transport });
export const gameServerAddress = account.address;

/**
 * Every on-chain write from this process shares ONE account, so it must share
 * ONE nonce sequence. Two concurrent claims both reading "pending" nonce from
 * the RPC at once is a real race (nonce collision -> one tx silently dropped
 * or stuck) at even modest traffic, so writes are serialized through this
 * queue and the nonce is tracked in-process rather than re-fetched per call.
 */
let chainQueue: Promise<unknown> = Promise.resolve();
let nextNonce: number | null = null;

async function currentNonce(): Promise<number> {
  if (nextNonce === null) {
    nextNonce = await publicClient.getTransactionCount({ address: gameServerAddress, blockTag: "pending" });
  }
  return nextNonce;
}

/** Run a chain-writing task with an exclusive, auto-incrementing nonce. */
export function withNonce<T>(fn: (nonce: number) => Promise<T>): Promise<T> {
  const task = chainQueue.then(async () => {
    const nonce = await currentNonce();
    try {
      const result = await fn(nonce);
      nextNonce = nonce + 1;
      return result;
    } catch (err) {
      // Nonce wasn't consumed (tx never got submitted) - re-derive next time
      // rather than drifting out of sync with the chain.
      nextNonce = null;
      throw err;
    }
  });
  // Keep the queue alive even after a failure so the NEXT call still waits its turn.
  chainQueue = task.catch(() => undefined);
  return task;
}
