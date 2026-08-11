import "dotenv/config";
import express from "express";
import { isAddress, parseUnits, type Address } from "viem";
import { gameServerAddress, walletClient, withNonce } from "./chain.js";
import { ADDRESSES, TREASURE_NFT_ABI, VILLE_TOKEN_ABI } from "./contracts.js";

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

app.listen(PORT, () => {
  console.log(`foxglade-server listening on :${PORT}, gameServer=${gameServerAddress}`);
});
