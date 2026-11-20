import { query } from './db';
import {
  CacheTTL,
  cacheGetJson,
  cacheSetJson,
  gameConfigCacheKey,
} from './cache';

export type GameConfigRow = {
  id: string;
  slug: string;
  name: string | null;
  status: string;
  meta: unknown;
  tenant_id?: string | null;
};

export async function loadGameConfigCached(
  slug: string,
  tenantId: string | null,
): Promise<GameConfigRow | null> {
  const cacheKey = gameConfigCacheKey(tenantId, slug);
  const hit = await cacheGetJson<GameConfigRow>(cacheKey);
  if (hit?.id) return hit;

  const { rows } = await query<GameConfigRow>(
    `SELECT id, slug, name, status, meta, tenant_id
     FROM game_configs
     WHERE slug = $1
       AND status = 'active'
       AND ($2::uuid IS NULL OR tenant_id = $2 OR tenant_id IS NULL)
     ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [slug, tenantId],
  );
  const row = rows[0] ?? null;
  if (row) {
    await cacheSetJson(cacheKey, row, CacheTTL.GAME_CONFIG);
  }
  return row;
}
