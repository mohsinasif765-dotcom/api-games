import { ensureRedisConnected } from './redis';

export const CacheTTL = {
  API_KEY: 60,
  TENANT: 60,
  GAME_CONFIG: 120,
  ROUND: 2,
  LAST_USED_DEBOUNCE: 300,
} as const;

export function apiKeyCacheKey(keyHash: string) {
  return `ag:apikey:${keyHash}`;
}

export function tenantIdCacheKey(tenantId: string) {
  return `ag:tenant:id:${tenantId}`;
}

export function tenantSlugCacheKey(slug: string) {
  return `ag:tenant:${slug}`;
}

export function gameConfigCacheKey(tenantId: string | null, slug: string) {
  return `ag:gcfg:${tenantId ?? 'global'}:${slug}`;
}

export function roundCacheKey(gameId: string) {
  return `ag:round:${gameId}`;
}

export function lastUsedDebounceKey(apiKeyId: string) {
  return `ag:apikey:used:${apiKeyId}`;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const redis = await ensureRedisConnected();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('[cache] get', key, e);
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const redis = await ensureRedisConnected();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSec));
  } catch (e) {
    console.error('[cache] set', key, e);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const filtered = keys.filter(Boolean);
  if (!filtered.length) return;
  const redis = await ensureRedisConnected();
  if (!redis) return;
  try {
    await redis.del(...filtered);
  } catch (e) {
    console.error('[cache] del', filtered, e);
  }
}

/** Like cacheSetJson but with millisecond TTL (for phase-boundary caching). */
export async function cacheSetJsonMs(
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  const redis = await ensureRedisConnected();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'PX', Math.max(1, Math.floor(ttlMs)));
  } catch (e) {
    console.error('[cache] set', key, e);
  }
}

/** Returns true if key was newly set (debounce window open). */
export async function cacheSetNx(
  key: string,
  ttlSec: number,
): Promise<boolean> {
  const redis = await ensureRedisConnected();
  if (!redis) return true; // no redis → allow DB write
  try {
    const res = await redis.set(key, '1', 'EX', Math.max(1, ttlSec), 'NX');
    return res === 'OK';
  } catch {
    return true;
  }
}

export async function invalidateTenantCache(opts: {
  tenantId?: string | null;
  slug?: string | null;
}): Promise<void> {
  const keys: string[] = [];
  if (opts.tenantId) keys.push(tenantIdCacheKey(opts.tenantId));
  if (opts.slug) keys.push(tenantSlugCacheKey(opts.slug));
  await cacheDel(...keys);
}

export async function invalidateGameConfigCache(
  tenantId: string | null | undefined,
  slug: string,
): Promise<void> {
  await cacheDel(
    gameConfigCacheKey(tenantId ?? null, slug),
    gameConfigCacheKey(null, slug),
  );
}
