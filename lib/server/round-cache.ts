import { query } from './db';
import {
  CacheTTL,
  cacheGetJson,
  cacheSetJsonMs,
  roundCacheKey,
} from './cache';

/** Don't bother caching a snapshot that expires sooner than this. */
const MIN_CACHE_MS = 150;

/**
 * When the current phase (betting / spinning) ends, in epoch ms.
 * Values are Date objects from pg, or ISO strings once round-tripped via Redis.
 */
function phaseEndMs(round: Record<string, unknown> | null): number | null {
  if (!round) return null;
  const raw =
    round.status === 'betting'
      ? round.betting_ends_at
      : round.status === 'spinning'
        ? (round.spinning_ends_at ?? round.round_ends_at)
        : null;
  if (raw == null) return null;
  const ms = new Date(raw as string | Date).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Active round for a game, cached in Redis for at most CacheTTL.ROUND seconds
 * — and never past the end of the current phase. Serving a cached 'betting'
 * round after betting_ends_at would hold every client on a stale phase (the
 * spin starts late), so near and after a phase boundary we read Postgres
 * directly (cheap: game_rounds_active_idx).
 */
export async function loadActiveRoundCached(
  gameId: string,
  tenantId: string | null,
): Promise<Record<string, unknown> | null> {
  const key = roundCacheKey(gameId);
  const hit = await cacheGetJson<{
    round: Record<string, unknown> | null;
    tenantId: string | null;
  }>(key);
  if (
    hit &&
    (!tenantId || !hit.tenantId || hit.tenantId === tenantId)
  ) {
    const endsAt = phaseEndMs(hit.round);
    if (endsAt == null || endsAt > Date.now()) return hit.round;
    // Phase already over: the round has (or is about to) advance — re-read.
  }

  let roundRes = tenantId
    ? await query(
        `SELECT *
         FROM game_rounds
         WHERE game_id = $1 AND status <> 'finished'
           AND (tenant_id = $2 OR tenant_id IS NULL)
         ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1`,
        [gameId, tenantId],
      )
    : await query(
        `SELECT *
         FROM game_rounds
         WHERE game_id = $1 AND status <> 'finished'
         ORDER BY created_at DESC
         LIMIT 1`,
        [gameId],
      );

  if (!roundRes.rows[0] && tenantId) {
    roundRes = await query(
      `INSERT INTO game_rounds (game_id, tenant_id, status, betting_ends_at)
       VALUES ($1, $2, 'betting', now() + interval '30 seconds')
       RETURNING *`,
      [gameId, tenantId],
    );
  }

  const round = (roundRes.rows[0] as Record<string, unknown> | undefined) ?? null;
  const maxMs = CacheTTL.ROUND * 1000;
  const endsAt = phaseEndMs(round);
  const ttlMs =
    endsAt == null ? maxMs : Math.min(maxMs, endsAt - Date.now());
  if (ttlMs >= MIN_CACHE_MS) {
    await cacheSetJsonMs(key, { round, tenantId }, ttlMs);
  }
  return round;
}
