import { query } from './db';
import {
  CacheTTL,
  cacheGetJson,
  cacheSetJson,
  roundCacheKey,
} from './cache';

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
    return hit.round;
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
  await cacheSetJson(
    key,
    { round, tenantId },
    CacheTTL.ROUND,
  );
  return round;
}
