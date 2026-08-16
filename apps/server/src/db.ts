import { Pool } from "pg";

/**
 * Postgres, added on the same Railway project as this service (2026-08-14) —
 * everything before this was local-only (browser localStorage). First and
 * only table it owns so far: onboarding, keyed by WALLET ADDRESS, not a
 * session or device id. Gameplay itself still needs no wallet and no DB row
 * (DESIGN.md §14.9's "additive, not required" chain layer applies here too);
 * this only recovers the hero/egg pick on a NEW device once a player
 * reconnects the same Magic wallet — see engine/chain/onboardingSync.ts on
 * the client.
 */
const DATABASE_URL = process.env.DATABASE_URL;

export const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 5 }) : null;

/** Whether persistence is even available — lets routes degrade to a clear
 *  503 instead of throwing when DATABASE_URL isn't set (e.g. local dev
 *  without a Postgres of your own). */
export function dbConfigured(): boolean {
  return pool !== null;
}

let migrated: Promise<void> | null = null;

/** Idempotent — safe to call on every boot. One small table, no migration
 *  framework needed for a single `CREATE TABLE IF NOT EXISTS` (+ an `ADD
 *  COLUMN IF NOT EXISTS` for pet_token_id, added after the table already
 *  existed in production). */
export function ensureSchema(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (!migrated) {
    migrated = pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS onboarding (
        wallet_address TEXT PRIMARY KEY,
        hero_id TEXT NOT NULL DEFAULT 'man',
        egg_variant TEXT,
        has_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        pet_token_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `
      )
      .then(() => pool!.query(`ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS pet_token_id TEXT;`))
      .then(() => undefined);
  }
  return migrated;
}

/** PetNFT's on-chain functions (recordRun/evolve/revive) take a tokenId, not
 *  a wallet — this is the only place that remembers which token a wallet's
 *  egg mint produced. Stored as TEXT since a uint256 tokenId can exceed
 *  JS/Postgres bigint's safe range in principle, even though in practice
 *  this contract's ids are small sequential integers. */
export async function savePetTokenId(walletAddress: string, tokenId: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO onboarding (wallet_address, pet_token_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (wallet_address) DO UPDATE SET pet_token_id = EXCLUDED.pet_token_id, updated_at = now()`,
    [walletAddress.toLowerCase(), tokenId]
  );
}

export async function getPetTokenId(walletAddress: string): Promise<string | null> {
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT pet_token_id FROM onboarding WHERE wallet_address = $1`, [
    walletAddress.toLowerCase(),
  ]);
  return rows[0]?.pet_token_id ?? null;
}
