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
 *  framework needed for a single `CREATE TABLE IF NOT EXISTS`. */
export function ensureSchema(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (!migrated) {
    migrated = pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding (
        wallet_address TEXT PRIMARY KEY,
        hero_id TEXT NOT NULL DEFAULT 'man',
        egg_variant TEXT,
        has_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `).then(() => undefined);
  }
  return migrated;
}
