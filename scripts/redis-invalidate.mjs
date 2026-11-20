/**
 * Invalidate api-games Redis cache keys (tenant / game config).
 * Safe no-op when REDIS_URL is unset.
 *
 * Usage:
 *   node scripts/redis-invalidate.mjs --tenant=ludo-shudo
 *   node scripts/redis-invalidate.mjs --tenant-id=UUID --game=greedy_king
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const tenantSlug = process.argv
  .find((a) => a.startsWith('--tenant='))
  ?.slice('--tenant='.length);
const tenantId = process.argv
  .find((a) => a.startsWith('--tenant-id='))
  ?.slice('--tenant-id='.length);
const gameSlug = process.argv
  .find((a) => a.startsWith('--game='))
  ?.slice('--game='.length);

const url = process.env.REDIS_URL?.trim();
if (!url) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'REDIS_URL unset' }));
  process.exit(0);
}

const db = Number(process.env.API_GAMES_REDIS_DB ?? 2);
const redis = new Redis(url, {
  maxRetriesPerRequest: 1,
  db: Number.isFinite(db) ? db : 2,
  connectTimeout: 5000,
  lazyConnect: true,
});

const keys = [];
if (tenantSlug) keys.push(`ag:tenant:${tenantSlug}`);
if (tenantId) {
  keys.push(`ag:tenant:id:${tenantId}`);
  if (gameSlug) {
    keys.push(`ag:gcfg:${tenantId}:${gameSlug}`);
  }
}
if (gameSlug) {
  keys.push(`ag:gcfg:global:${gameSlug}`);
  // Also wipe any tenant-scoped copies if tenantId known above
}

try {
  await redis.connect();
  if (keys.length) {
    await redis.del(...keys);
  }
  // When only --tenant=slug, also scan gcfg for that tenant if we resolve id from argv
  console.log(JSON.stringify({ ok: true, deleted: keys }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
