/**
 * Set tenant default RTP and/or per-game RTP override.
 *
 * Usage:
 *   node scripts/set-tenant-rtp.mjs <tenant-slug> <rtp> [--propagate]
 *   node scripts/set-tenant-rtp.mjs <tenant-slug> <rtp> --game=<slug>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function invalidateRedis({ tenantSlug, tenantId, gameSlug }) {
  const args = [path.join(root, 'scripts', 'redis-invalidate.mjs')];
  if (tenantSlug) args.push(`--tenant=${tenantSlug}`);
  if (tenantId) args.push(`--tenant-id=${tenantId}`);
  if (gameSlug) args.push(`--game=${gameSlug}`);
  spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

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

const tenantSlug = process.argv[2];
const rtpRaw = process.argv[3];
const propagate = process.argv.includes('--propagate');
const gameFlag = process.argv.find((a) => a.startsWith('--game='));
const gameSlug = gameFlag ? gameFlag.slice('--game='.length).trim() : null;

if (!tenantSlug || rtpRaw == null) {
  console.error(
    'Usage: node scripts/set-tenant-rtp.mjs <tenant-slug> <rtp> [--propagate | --game=<slug>]',
  );
  process.exit(1);
}

const rtp = Number(rtpRaw);
if (!Number.isFinite(rtp) || rtp <= 0 || rtp > 100) {
  console.error('rtp must be a number in (0, 100]');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(
    fs.readFileSync(path.join(root, 'db', 'tenant-rtp.sql'), 'utf8'),
  );

  let tenantRes;
  if (gameSlug) {
    tenantRes = await client.query(
      `SELECT id, slug, rtp_target FROM tenants WHERE slug = $1`,
      [tenantSlug],
    );
  } else {
    tenantRes = await client.query(
      `UPDATE tenants SET rtp_target = $2
       WHERE slug = $1
       RETURNING id, slug, rtp_target`,
      [tenantSlug, rtp],
    );
  }
  const tenant = tenantRes.rows[0];
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantSlug}`);
  }

  let games = [];

  if (gameSlug) {
    const updated = await client.query(
      `UPDATE game_configs
       SET meta = jsonb_set(
         COALESCE(meta, '{}'::jsonb),
         '{rtp}',
         to_jsonb($3::numeric),
         true
       ),
       status = 'active'
       WHERE tenant_id = $1 AND slug = $2
       RETURNING slug, status, meta->>'rtp' AS game_rtp`,
      [tenant.id, gameSlug, rtp],
    );
    if (!updated.rows[0]) {
      throw new Error(
        `Game '${gameSlug}' not assigned to ${tenantSlug}. Run assign-tenant-games.mjs first.`,
      );
    }
    games = updated.rows;
  } else if (propagate) {
    const updated = await client.query(
      `UPDATE game_configs
       SET meta = jsonb_set(
         COALESCE(meta, '{}'::jsonb),
         '{rtp}',
         to_jsonb($2::numeric),
         true
       )
       WHERE tenant_id = $1 AND status = 'active'
       RETURNING slug, status, meta->>'rtp' AS game_rtp`,
      [tenant.id, rtp],
    );
    games = updated.rows;
  } else {
    const listed = await client.query(
      `SELECT slug, status, meta->>'rtp' AS game_rtp,
              COALESCE((meta->>'rtp')::numeric, $2::numeric) AS effective_rtp
       FROM game_configs
       WHERE tenant_id = $1
       ORDER BY slug`,
      [tenant.id, rtp],
    );
    games = listed.rows;
  }

  console.log(
    JSON.stringify(
      {
        tenant: {
          slug: tenant.slug,
          rtp_target: Number(tenant.rtp_target),
        },
        mode: gameSlug ? `game:${gameSlug}` : propagate ? 'propagate' : 'default',
        games,
      },
      null,
      2,
    ),
  );

  invalidateRedis({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    gameSlug: gameSlug || null,
  });
} finally {
  await client.end();
}
