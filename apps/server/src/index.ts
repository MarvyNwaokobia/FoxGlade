import "dotenv/config";
import express from "express";
import { isAddress, isHex, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { gameServerAddress, publicClient, walletClient, withNonce } from "./chain.js";
import {
  ADDRESSES,
  ARMORY_ITEMS_ABI,
  GAME_EVENTS_ABI,
  HERO_NFT_ABI,
  PET_NFT_ABI,
  TREASURE_NFT_ABI,
  VILLE_TOKEN_ABI,
} from "./contracts.js";
import { pool, dbConfigured, ensureSchema, getPetTokenId, savePetTokenId } from "./db.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const RELAY_SECRET = process.env.RELAY_SECRET;

ensureSchema().catch((err) => console.error("onboarding schema migration failed", err));

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

/**
 * Onboarding sync — the hero/egg pick, mirrored server-side so a player who
 * reconnects the same Magic wallet on a NEW device doesn't see the wizard
 * again. Not required for gameplay (see db.ts's header): a player with no
 * wallet, or hitting this while the DB is unset, just keeps using
 * localStorage exactly as before — these two routes degrade to a 503 rather
 * than ever blocking the client's own local write.
 */
app.get("/onboarding/:address", async (req, res) => {
  if (!dbConfigured()) {
    res.status(503).json({ error: "onboarding persistence not configured" });
    return;
  }
  const { address } = req.params;
  if (!isAddress(address)) {
    res.status(400).json({ error: "invalid wallet address" });
    return;
  }
  try {
    const { rows } = await pool!.query(
      `SELECT hero_id, egg_variant, has_onboarded, completed_at FROM onboarding WHERE wallet_address = $1`,
      [address.toLowerCase()]
    );
    if (rows.length === 0) {
      res.json({ hasOnboarded: false, heroId: null, eggVariant: null, completedAt: null });
      return;
    }
    const row = rows[0];
    res.json({
      hasOnboarded: row.has_onboarded,
      heroId: row.hero_id,
      eggVariant: row.egg_variant,
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    });
  } catch (err) {
    console.error("onboarding fetch failed", err);
    res.status(500).json({ error: "onboarding fetch failed" });
  }
});

app.post("/onboarding", async (req, res) => {
  if (!dbConfigured()) {
    res.status(503).json({ error: "onboarding persistence not configured" });
    return;
  }
  const { address, heroId, eggVariant, hasOnboarded, completedAt } = req.body ?? {};
  if (typeof address !== "string" || !isAddress(address)) {
    res.status(400).json({ error: "invalid wallet address" });
    return;
  }
  if (typeof heroId !== "string" || (eggVariant !== null && typeof eggVariant !== "string")) {
    res.status(400).json({ error: "invalid heroId/eggVariant" });
    return;
  }
  try {
    await pool!.query(
      `INSERT INTO onboarding (wallet_address, hero_id, egg_variant, has_onboarded, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (wallet_address) DO UPDATE SET
         hero_id = EXCLUDED.hero_id,
         egg_variant = EXCLUDED.egg_variant,
         has_onboarded = EXCLUDED.has_onboarded,
         completed_at = EXCLUDED.completed_at,
         updated_at = now()`,
      [
        address.toLowerCase(),
        heroId,
        eggVariant ?? null,
        hasOnboarded === true,
        typeof completedAt === "number" ? new Date(completedAt) : null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("onboarding save failed", err);
    res.status(500).json({ error: "onboarding save failed" });
  }
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

// Onboarding mints — hero and pet egg. Both are gasless (this relay pays,
// player just needs a wallet connected), mirroring the treasure claim above.
// Each only fires once in the normal flow (onboarding confirm), but the same
// light per-wallet cooldown as everywhere else guards against a client
// resubmitting and draining the relay wallet's gas.
const MIN_ONBOARD_INTERVAL_MS = 5_000;
const lastHeroClaimAt = new Map<string, number>();
const lastPetClaimAt = new Map<string, number>();

app.post("/hero/claim", async (req, res) => {
  const { player, heroId } = req.body ?? {};

  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  if (!Number.isInteger(heroId) || heroId < 0 || heroId > 255) {
    res.status(400).json({ error: "heroId must be an integer in [0, 255]" });
    return;
  }

  const key = player.toLowerCase();
  const last = lastHeroClaimAt.get(key) ?? 0;
  if (Date.now() - last < MIN_ONBOARD_INTERVAL_MS) {
    res.status(429).json({ error: "too many claims, slow down" });
    return;
  }
  lastHeroClaimAt.set(key, Date.now());

  try {
    const playerAddr = player as Address;
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.heroNFT,
        abi: HERO_NFT_ABI,
        functionName: "mintHero",
        args: [playerAddr, heroId],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    console.error("hero claim failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

app.post("/pet/claim", async (req, res) => {
  const { player } = req.body ?? {};

  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }

  const key = player.toLowerCase();
  const last = lastPetClaimAt.get(key) ?? 0;
  if (Date.now() - last < MIN_ONBOARD_INTERVAL_MS) {
    res.status(429).json({ error: "too many claims, slow down" });
    return;
  }
  lastPetClaimAt.set(key, Date.now());

  try {
    const playerAddr = player as Address;
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.petNFT,
        abi: PET_NFT_ABI,
        functionName: "mintEgg",
        args: [playerAddr],
        nonce,
      })
    );
    // recordRun/evolve/revive all take the pet's tokenId, not the wallet, so
    // this is the one place that can ever learn it — decode it off the mint
    // receipt and remember it against the wallet for every later pet action.
    let tokenId: string | null = null;
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const [minted] = parseEventLogs({ abi: PET_NFT_ABI, eventName: "PetMinted", logs: receipt.logs });
      if (minted) {
        tokenId = minted.args.tokenId.toString();
        await savePetTokenId(playerAddr, tokenId);
      }
    } catch (err) {
      // The mint itself already succeeded (txHash above is real) — losing the
      // tokenId just means recordRun/evolve/revive silently no-op later until
      // this is re-derived some other way. Not worth failing the claim over.
      console.error("pet tokenId lookup failed after a successful mint", err);
    }
    res.json({ txHash, tokenId });
  } catch (err) {
    console.error("pet claim failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

// recordRun/evolve/revive all act on the pet the wallet already minted (see
// tokenId capture above) — a wallet with no on-chain pet yet is a clean 404,
// which the client treats as a silent no-op, same as "no wallet connected."
const MIN_PET_ACTION_INTERVAL_MS = 2_000;
const lastPetRunAt = new Map<string, number>();
const lastPetEvolveAt = new Map<string, number>();
const lastPetReviveAt = new Map<string, number>();

async function requirePetToken(player: string, res: express.Response): Promise<bigint | null> {
  const tokenId = await getPetTokenId(player);
  if (tokenId === null) {
    res.status(404).json({ error: "no on-chain pet for this wallet yet" });
    return null;
  }
  return BigInt(tokenId);
}

app.post("/pet/record-run", async (req, res) => {
  const { player } = req.body ?? {};
  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  const key = player.toLowerCase();
  const last = lastPetRunAt.get(key) ?? 0;
  if (Date.now() - last < MIN_PET_ACTION_INTERVAL_MS) {
    res.status(429).json({ error: "too many requests, slow down" });
    return;
  }
  lastPetRunAt.set(key, Date.now());

  const tokenId = await requirePetToken(player, res);
  if (tokenId === null) return;
  try {
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.petNFT,
        abi: PET_NFT_ABI,
        functionName: "recordRun",
        args: [tokenId],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    console.error("pet record-run failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

app.post("/pet/evolve", async (req, res) => {
  const { player, stage } = req.body ?? {};
  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  if (!Number.isInteger(stage) || stage < 1 || stage > 3) {
    res.status(400).json({ error: "stage must be an integer in [1, 3]" });
    return;
  }
  const key = player.toLowerCase();
  const last = lastPetEvolveAt.get(key) ?? 0;
  if (Date.now() - last < MIN_PET_ACTION_INTERVAL_MS) {
    res.status(429).json({ error: "too many requests, slow down" });
    return;
  }
  lastPetEvolveAt.set(key, Date.now());

  const tokenId = await requirePetToken(player, res);
  if (tokenId === null) return;
  try {
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.petNFT,
        abi: PET_NFT_ABI,
        functionName: "evolve",
        args: [tokenId, stage],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    // Most likely NotForward — the client already thinks this stage was
    // reached (a stale evolve resent after a refresh, say). Not worth
    // surfacing as a hard failure since the pet is already at/past this stage
    // either way.
    console.error("pet evolve failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

app.post("/pet/revive", async (req, res) => {
  const { player } = req.body ?? {};
  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  const key = player.toLowerCase();
  const last = lastPetReviveAt.get(key) ?? 0;
  if (Date.now() - last < MIN_ONBOARD_INTERVAL_MS) {
    res.status(429).json({ error: "too many requests, slow down" });
    return;
  }
  lastPetReviveAt.set(key, Date.now());

  const tokenId = await requirePetToken(player, res);
  if (tokenId === null) return;
  try {
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.petNFT,
        abi: PET_NFT_ABI,
        functionName: "revive",
        args: [tokenId],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    console.error("pet revive failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

// Gasless "just a stamp" events — death, a day's quota finished, turning in
// for the night. No reward, no game-logic validation beyond shape: this is a
// receipt of something that already happened locally, not a thing this relay
// grants. Rate-limited per wallet since death (the most frequent of the
// three) could otherwise be triggered rapidly and drain the relay wallet's
// gas for no player benefit.
const EVENT_TYPES = { death: 0, dayComplete: 1, dayAdvanced: 2 } as const;
const MIN_STAMP_INTERVAL_MS = 2_000;
const lastStampAt = new Map<string, number>();

app.post("/event/stamp", async (req, res) => {
  const { player, eventType } = req.body ?? {};

  if (typeof player !== "string" || !isAddress(player)) {
    res.status(400).json({ error: "invalid player address" });
    return;
  }
  if (typeof eventType !== "string" || !(eventType in EVENT_TYPES)) {
    res.status(400).json({ error: `eventType must be one of ${Object.keys(EVENT_TYPES).join(", ")}` });
    return;
  }

  const key = player.toLowerCase();
  const last = lastStampAt.get(key) ?? 0;
  if (Date.now() - last < MIN_STAMP_INTERVAL_MS) {
    res.status(429).json({ error: "too many events, slow down" });
    return;
  }
  lastStampAt.set(key, Date.now());

  try {
    const playerAddr = player as Address;
    const txHash = await withNonce((nonce) =>
      walletClient.writeContract({
        address: ADDRESSES.gameEvents,
        abi: GAME_EVENTS_ABI,
        functionName: "stamp",
        args: [playerAddr, EVENT_TYPES[eventType as keyof typeof EVENT_TYPES]],
        nonce,
      })
    );
    res.json({ txHash });
  } catch (err) {
    console.error("event stamp failed", err);
    res.status(500).json({ error: "on-chain call failed" });
  }
});

app.listen(PORT, () => {
  console.log(`foxglade-server listening on :${PORT}, gameServer=${gameServerAddress}`);
});
