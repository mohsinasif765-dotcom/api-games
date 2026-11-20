import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var __gameRedis: Redis | null | undefined;
  // eslint-disable-next-line no-var
  var __gameRedisDisabled: boolean | undefined;
}

/**
 * Zuvo built-in Redis (same pattern as ludo-shudo-gateway).
 * Isolated logical DB via API_GAMES_REDIS_DB (default 2).
 * Returns null when REDIS_URL is missing — callers must fall back to Postgres.
 */
export function getRedis(): Redis | null {
  if (global.__gameRedisDisabled) return null;
  if (global.__gameRedis !== undefined) return global.__gameRedis;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    global.__gameRedis = null;
    return null;
  }

  const db = Number(process.env.API_GAMES_REDIS_DB ?? 2);
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 3000,
    db: Number.isFinite(db) ? db : 2,
  });

  client.on('error', (err) => {
    console.error('[redis:api-games]', err.message);
  });

  global.__gameRedis = client;
  return client;
}

export async function ensureRedisConnected(): Promise<Redis | null> {
  const client = getRedis();
  if (!client) return null;
  if (client.status === 'ready' || client.status === 'connecting') {
    if (client.status === 'connecting') {
      try {
        await client.connect();
      } catch {
        // already connecting / connected
      }
    }
    return client;
  }
  try {
    if (client.status === 'wait') await client.connect();
    return client;
  } catch (e) {
    console.error('[redis:api-games] connect failed', e);
    return null;
  }
}
