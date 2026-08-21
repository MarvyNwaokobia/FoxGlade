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
      .then(() => pool!.query(`ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS username TEXT;`))
      // Session tracking (Marvy's request, 2026-08-21 — "is there a way to
      // identify new from existing users, track gameplay" — created_at
      // already existed but nothing else did). last_seen_at/session_count
      // are touched every time a real client session reconciles with the
      // server (see touchSession, called from GET /onboarding/:address,
      // which every session already hits once on connect) — piggybacking on
      // existing traffic instead of adding a new ping call.
      .then(() => pool!.query(`ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;`))
      .then(() =>
        pool!.query(`ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS session_count INTEGER NOT NULL DEFAULT 0;`)
      )
      // Case-insensitive uniqueness (a functional index on lower()) — two
      // players can't hold "Fox" and "fox" and be told apart in chat/leader-
      // boards by case alone. Multiple NULLs are fine: Postgres never treats
      // two NULLs as equal, so players who onboarded before this column
      // existed don't collide with each other on it.
      .then(() =>
        pool!.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS onboarding_username_lower_idx ON onboarding (lower(username));`
        )
      )
      .then(() =>
        pool!.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        wallet_address TEXT PRIMARY KEY,
        ville_banked INTEGER NOT NULL DEFAULT 0,
        ville_earned INTEGER NOT NULL DEFAULT 0,
        treasures_banked INTEGER NOT NULL DEFAULT 0,
        day INTEGER NOT NULL DEFAULT 1,
        equipped_weapon TEXT NOT NULL DEFAULT 'assault_rifle',
        owned JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
      )
      // A queryable log of the same milestones /event/stamp already sends
      // on-chain (death, dayComplete, dayAdvanced) — the chain has no way to
      // ask "what did this wallet do and when," so this mirrors each stamp
      // into Postgres too, best-effort, alongside the on-chain call.
      .then(() =>
        pool!.query(`
      CREATE TABLE IF NOT EXISTS player_events (
        id BIGSERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
      )
      .then(() =>
        pool!.query(
          `CREATE INDEX IF NOT EXISTS player_events_wallet_idx ON player_events (wallet_address, created_at);`
        )
      )
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

/** Live-check for the username step's input — case-insensitive, matching the
 *  unique index above. `excludeAddress` lets a player re-check their OWN
 *  current name (e.g. re-submitting after fixing something else) without it
 *  reading as taken by themselves. */
export async function isUsernameAvailable(username: string, excludeAddress?: string): Promise<boolean> {
  if (!pool) return true;
  const { rows } = await pool.query(
    excludeAddress
      ? `SELECT 1 FROM onboarding WHERE lower(username) = lower($1) AND wallet_address != $2`
      : `SELECT 1 FROM onboarding WHERE lower(username) = lower($1)`,
    excludeAddress ? [username, excludeAddress.toLowerCase()] : [username]
  );
  return rows.length === 0;
}

export async function getPetTokenId(walletAddress: string): Promise<string | null> {
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT pet_token_id FROM onboarding WHERE wallet_address = $1`, [
    walletAddress.toLowerCase(),
  ]);
  return rows[0]?.pet_token_id ?? null;
}

export interface PlayerStats {
  villeBanked: number;
  villeEarned: number;
  treasuresBanked: number;
  day: number;
  equippedWeapon: string;
  owned: string[];
  updatedAt: number;
}

/**
 * A snapshot of a player's progress, mirrored server-side so it can be read
 * by someone OTHER than the player (the public card page, engine/chain/
 * playerStatsSync.ts on the client) — everything it holds otherwise lives
 * only in the player's own localStorage (engine/save.ts). Pushed at a few
 * checkpoints (day rollover, a secured bank), not every state change: this
 * is a profile snapshot, not a source of truth gameplay reads from.
 */
export async function upsertPlayerStats(
  walletAddress: string,
  stats: Omit<PlayerStats, "updatedAt">
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO player_stats
       (wallet_address, ville_banked, ville_earned, treasures_banked, day, equipped_weapon, owned, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (wallet_address) DO UPDATE SET
       ville_banked = EXCLUDED.ville_banked,
       ville_earned = EXCLUDED.ville_earned,
       treasures_banked = EXCLUDED.treasures_banked,
       day = EXCLUDED.day,
       equipped_weapon = EXCLUDED.equipped_weapon,
       owned = EXCLUDED.owned,
       updated_at = now()`,
    [
      walletAddress.toLowerCase(),
      stats.villeBanked,
      stats.villeEarned,
      stats.treasuresBanked,
      stats.day,
      stats.equippedWeapon,
      JSON.stringify(stats.owned),
    ]
  );
}

export async function getPlayerStats(walletAddress: string): Promise<PlayerStats | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT ville_banked, ville_earned, treasures_banked, day, equipped_weapon, owned, updated_at
     FROM player_stats WHERE wallet_address = $1`,
    [walletAddress.toLowerCase()]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    villeBanked: row.ville_banked,
    villeEarned: row.ville_earned,
    treasuresBanked: row.treasures_banked,
    day: row.day,
    equippedWeapon: row.equipped_weapon,
    owned: Array.isArray(row.owned) ? row.owned : [],
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * Marks a real session — called from GET /onboarding/:address, which every
 * client already hits once per connect (accountSync.ts's reconcileAccount),
 * so this rides along on existing traffic rather than adding a ping route.
 * `sessionCount` after the increment tells you what you need: exactly 1
 * means this is the wallet's first-ever session (new user); anything higher
 * is a returning one. Creates the onboarding row if it doesn't exist yet
 * (e.g. a wallet connected but hasn't finished the wizard) — everything
 * else on that row keeps its column default.
 */
export async function touchSession(walletAddress: string): Promise<{ sessionCount: number; isNewUser: boolean }> {
  if (!pool) return { sessionCount: 0, isNewUser: false };
  const { rows } = await pool.query(
    `INSERT INTO onboarding (wallet_address, last_seen_at, session_count)
     VALUES ($1, now(), 1)
     ON CONFLICT (wallet_address) DO UPDATE SET
       last_seen_at = now(),
       session_count = onboarding.session_count + 1
     RETURNING session_count`,
    [walletAddress.toLowerCase()]
  );
  const sessionCount = rows[0]?.session_count ?? 0;
  return { sessionCount, isNewUser: sessionCount === 1 };
}

/** Best-effort mirror of an on-chain event stamp into a queryable log — see
 *  player_events in ensureSchema. Never throws: a logging failure shouldn't
 *  take down the on-chain relay call it rides alongside. */
export async function logEvent(walletAddress: string, eventType: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(`INSERT INTO player_events (wallet_address, event_type) VALUES ($1, $2)`, [
      walletAddress.toLowerCase(),
      eventType,
    ]);
  } catch (err) {
    console.error("player event log failed", err);
  }
}

export interface PlayerEvent {
  eventType: string;
  createdAt: number;
}

export async function getPlayerEvents(walletAddress: string, limit = 20): Promise<PlayerEvent[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT event_type, created_at FROM player_events
     WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2`,
    [walletAddress.toLowerCase(), limit]
  );
  return rows.map((r) => ({ eventType: r.event_type, createdAt: new Date(r.created_at).getTime() }));
}

export interface AdminStats {
  totalUsers: number;
  newUsersLast24h: number;
  returningUsersLast24h: number;
  eventCountsLast7d: { eventType: string; count: number }[];
}

/** The overview behind the admin dashboard question "how many of today's
 *  players are new vs returning, and what are they actually doing" —
 *  everything here reads off last_seen_at/session_count/player_events,
 *  none of which existed before 2026-08-21. */
export async function getAdminStats(): Promise<AdminStats> {
  if (!pool) return { totalUsers: 0, newUsersLast24h: 0, returningUsersLast24h: 0, eventCountsLast7d: [] };
  const [totals, events] = await Promise.all([
    pool.query(
      `SELECT
         count(*) AS total_users,
         count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS new_users_last_24h,
         count(*) FILTER (WHERE last_seen_at >= now() - interval '24 hours' AND session_count > 1)
           AS returning_users_last_24h
       FROM onboarding`
    ),
    pool.query(
      `SELECT event_type, count(*) AS count FROM player_events
       WHERE created_at >= now() - interval '7 days'
       GROUP BY event_type ORDER BY count DESC`
    ),
  ]);
  const t = totals.rows[0];
  return {
    totalUsers: Number(t.total_users),
    newUsersLast24h: Number(t.new_users_last_24h),
    returningUsersLast24h: Number(t.returning_users_last_24h),
    eventCountsLast7d: events.rows.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
  };
}

export interface PlayerSummary {
  walletAddress: string;
  username: string | null;
  createdAt: number;
  sessionCount: number;
  lastSeenAt: number | null;
  villeBanked: number | null;
  day: number | null;
}

/** Every wallet on file, newest first — the roster behind "who's actually
 *  playing" (Marvy's request, 2026-08-21, ahead of deciding whether/what to
 *  reset). Left-joins player_stats since a wallet can have an onboarding row
 *  (connected, maybe still mid-wizard) with no stats pushed yet. */
export async function listPlayers(): Promise<PlayerSummary[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT o.wallet_address, o.username, o.created_at, o.session_count, o.last_seen_at,
            p.ville_banked, p.day
     FROM onboarding o
     LEFT JOIN player_stats p ON p.wallet_address = o.wallet_address
     ORDER BY o.created_at DESC`
  );
  return rows.map((r) => ({
    walletAddress: r.wallet_address,
    username: r.username,
    createdAt: new Date(r.created_at).getTime(),
    sessionCount: r.session_count,
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null,
    villeBanked: r.ville_banked,
    day: r.day,
  }));
}
