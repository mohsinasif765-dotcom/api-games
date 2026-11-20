/**
 * Assign / enable games for a tenant by cloning template game_configs rows.
 *
 * Usage:
 *   node scripts/assign-tenant-games.mjs <tenant-slug> <slug1,slug2,...> [--reset-rtp]
 *
 * Template preference: demo tenant row → global (tenant_id NULL) → any active slug.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function invalidateRedis({ tenantSlug, tenantId, gameSlugs }) {
  for (const gameSlug of gameSlugs) {
    spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'redis-invalidate.mjs'),
        `--tenant=${tenantSlug}`,
        `--tenant-id=${tenantId}`,
        `--game=${gameSlug}`,
      ],
      { cwd: root, stdio: 'inherit' },
    );
  }
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
const gamesArg = process.argv[3];
const resetRtp = process.argv.includes('--reset-rtp');

if (!tenantSlug || !gamesArg) {
  console.error(
    'Usage: node scripts/assign-tenant-games.mjs <tenant-slug> <slug1,slug2,...> [--reset-rtp]',
  );
  process.exit(1);
}

const slugs = gamesArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!slugs.length) {
  console.error('No game slugs provided');
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

  const tenantRes = await client.query(
    `SELECT id, slug, rtp_target FROM tenants WHERE slug = $1`,
    [tenantSlug],
  );
  const tenant = tenantRes.rows[0];
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantSlug}`);
  }

  const demo = await client.query(`SELECT id FROM tenants WHERE slug = 'demo'`);
  const demoId = demo.rows[0]?.id ?? null;
  const results = [];

  for (const slug of slugs) {
    const tpl = await client.query(
      `SELECT slug, name, status, meta
       FROM game_configs
       WHERE slug = $1 AND status = 'active'
         AND ($2::uuid IS NULL OR tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY
         CASE
           WHEN tenant_id = $2 THEN 0
           WHEN tenant_id IS NULL THEN 1
           ELSE 2
         END
       LIMIT 1`,
      [slug, demoId],
    );
    if (!tpl.rows[0]) {
      results.push({ slug, ok: false, error: 'template not found' });
      continue;
    }

    const src = tpl.rows[0];
    let meta =
      src.meta && typeof src.meta === 'object' ? { ...src.meta } : {};
    if (Array.isArray(src.meta)) meta = { options: src.meta };
    if (resetRtp || meta.rtp == null) {
      meta = { ...meta, rtp: Number(tenant.rtp_target) };
    }

    const upsert = await client.query(
      `INSERT INTO game_configs (tenant_id, slug, name, status, meta)
       VALUES ($1, $2, $3, 'active', $4::jsonb)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET
         name = EXCLUDED.name,
         status = 'active',
         meta = CASE
           WHEN $5::boolean THEN EXCLUDED.meta
           ELSE game_configs.meta
         END
       RETURNING id, slug, status, meta->>'rtp' AS game_rtp`,
      [
        tenant.id,
        slug,
        src.name || slug,
        JSON.stringify(meta),
        resetRtp,
      ],
    );

    // If row existed and --reset-rtp not set, still ensure rtp key if missing
    if (!resetRtp) {
      await client.query(
        `UPDATE game_configs
         SET meta = jsonb_set(
           COALESCE(meta, '{}'::jsonb),
           '{rtp}',
           to_jsonb($2::numeric),
           true
         )
         WHERE id = $1
           AND (meta->>'rtp') IS NULL`,
        [upsert.rows[0].id, Number(tenant.rtp_target)],
      );
    }

    const row = await client.query(
      `SELECT id, slug, status, meta->>'rtp' AS game_rtp FROM game_configs WHERE id = $1`,
      [upsert.rows[0].id],
    );
    results.push({ slug, ok: true, ...row.rows[0] });
  }

  console.log(
    JSON.stringify(
      {
        tenant: {
          slug: tenant.slug,
          rtp_target: Number(tenant.rtp_target),
        },
        assigned: results,
      },
      null,
      2,
    ),
  );

  invalidateRedis({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    gameSlugs: results.filter((r) => r.ok).map((r) => r.slug),
  });
} finally {
  await client.end();
}
