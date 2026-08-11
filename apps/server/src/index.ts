import "dotenv/config";
import express from "express";
import { isAddress, isHex, parseUnits, type Address, type Hex } from "viem";
import { gameServerAddress, walletClient, withNonce } from "./chain.js";
import { ADDRESSES, ARMORY_ITEMS_ABI, TREASURE_NFT_ABI, VILLE_TOKEN_ABI } from "./contracts.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const RELAY_SECRET = process.env.RELAY_SECRET;

/**
 * Ceiling on a single claim, matching the game's own max carry cap
 * (apps/web/src/engine/config/shop.ts BAG_CAP.g_rucksack = 1300). Gameplay
 * itself is fully client-simulated (no authoritative server), so this relay
 * trusts the client's report of what happened — that's the accepted v1 trust
 * boundary (DESIGN.md §13.2): the gameServer key's integrity IS the security
 * boundary, not a claim-by-claim anti-cheat check. This cap + the rate limit
 * below are a deliberately light deterrent against casual abuse of this
 * endpoint, not a defense against a motivated attacker with the relay secret.
 */
const MAX_CLAIM_VILLE = 1300;
const MIN_CLAIM_INTERVAL_MS = 5_000;

// In-memory, per-process — fine on Railway's long-lived container, would NOT
// survive/coordinate across multiple instances or a serverless redeploy.
const lastClaimAt = new Map<string, number>();

app.get("/health", (_req, res) => {
  res.json({ ok: true, gameServer: gameServerAddress });
});

app.use((req, res, next) => {
  if (!RELAY_SECRET) {
    res.status(503).json({ error: "server misconfigured: RELAY_SECRET unset" });
    return;
  }
  if (req.header("x-relay-secret") !== RELAY_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

app.post("/treasure/claim", async (req, res) => {
  const { player, amount, rarityTier } = req.body ?? {};

  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_CLAIM_VILLE) {
    res.status(400).json({ error: `amount must be an integer in (0, ${MAX_CLAIM_VILLE}]` });
    return;
  }
  if (rarityTier !== 0 && rarityTier !== 1) {
    res.status(400).json({ error: "rarityTier must be 0 (common) or 1 (rare)" });
    return;
  }

  const key = (player as string).toLowerCase();
  const last = lastClaimAt.get(key) ?? 0;
  if (Date.now() - last < MIN_CLAIM_INTERVAL_MS) {
    res.status(429).json({ error: "too many claims, slow down" });
    return;
  }
  lastClaimAt.set(key, Date.now());

  try {
    const playerAddr = player as Address;
    const value = parseUnits(amount.toString(), 18);

    const villeTx = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.villeToken,
        abi: VILLE_TOKEN_ABI,
        functionName: "rewardTreasure",
        args: [playerAddr, value, BigInt(rarityTier)],
        nonce,
      })
    );

    const nftTx = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.treasureNFT,
        abi: TREASURE_NFT_ABI,
        functionName: "mintTreasure",
        args: [playerAddr, BigInt(rarityTier)],
        nonce,
      })
    );

    res.json({ villeTx, nftTx });
  } catch (err) {
    console.error("treasure claim failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

// Player-signed, relay-submitted marketplace purchases (buyItemFor). No
// amount to sanity-check here — the contract itself is the source of truth
// on price via priceOf(itemId), and the player's own EIP-712 signature is
// what authorizes spending their VILLE, not this relay's say-so. What this
// layer still owns: not relaying garbage input, and not letting one buyer
// spam the relay wallet's gas via rapid resubmission.
const MIN_BUY_INTERVAL_MS = 2_000;
const MAX_QTY = 20;
const MAX_DEADLINE_SKEW_S = 2 * 60 * 60; // reject a signature claiming to be valid absurdly far out
const lastBuyAt = new Map<string, number>();

app.post("/marketplace/buy", async (req, res) => {
  const { buyer, itemId, qty, deadline, v, r, s } = req.body ?? {};

  if (typeof buyer !== "string" || !isAddress(buyer)) {
    res.status(400).json({ error: "invalid buyer address" });
    return;
  }
  let itemIdBig: bigint;
  let deadlineBig: bigint;
  try {
    itemIdBig = BigInt(itemId);
    deadlineBig = BigInt(deadline);
  } catch {
    res.status(400).json({ error: "itemId/deadline must be numeric strings" });
    return;
  }
  if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
    res.status(400).json({ error: `qty must be an integer in (0, ${MAX_QTY}]` });
    return;
  }
  const nowS = Math.floor(Date.now() / 1000);
  if (deadlineBig < BigInt(nowS) || deadlineBig > BigInt(nowS + MAX_DEADLINE_SKEW_S)) {
    res.status(400).json({ error: "deadline expired or unreasonably far out" });
    return;
  }
  if (typeof v !== "number" || !isHex(r) || !isHex(s)) {
    res.status(400).json({ error: "invalid signature fields" });
    return;
  }

  const key = buyer.toLowerCase();
  const last = lastBuyAt.get(key) ?? 0;
  if (Date.now() - last < MIN_BUY_INTERVAL_MS) {
    res.status(429).json({ error: "too many purchase attempts, slow down" });
    return;
  }
  lastBuyAt.set(key, Date.now());

  try {
    const buyerAddr = buyer as Address;
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.armoryItems,
        abi: ARMORY_ITEMS_ABI,
        functionName: "buyItemFor",
        args: [buyerAddr, itemIdBig, BigInt(qty), deadlineBig, v, r as Hex, s as Hex],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    console.error("marketplace buy failed", err);
    // The contract's own revert reasons (NotForSale, InvalidSignature, ExpiredSignature)
    // surface here as a generic viem error; not worth parsing out for v1 — the
    // player-facing message is the same either way: "purchase failed, try again."
    res.status(500).json({ error: "on-chain call failed" });
  }
});

app.listen(PORT, () => {
  console.log(`foxglade-server listening on :${PORT}, gameServer=${gameServerAddress}`);
});
