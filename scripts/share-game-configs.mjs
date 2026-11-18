/**
 * DEPRECATED for RTP tenants.
 *
 * Nulling tenant_id makes one shared round stream for all tenants, so
 * per-tenant / per-game RTP cannot work. Prefer:
 *   node scripts/assign-tenant-games.mjs <tenant> <slugs>
 *   node scripts/set-tenant-rtp.mjs <tenant> <rtp> [--game=slug]
 *
 * This script is kept only to inspect / temporarily flatten catalog templates.
 * Pass --force to actually null tenant_id on active configs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const force = process.argv.includes('--force');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  if (!force) {
    console.log(
      JSON.stringify(
        {
          warning:
            'share-game-configs breaks per-tenant RTP. Use assign-tenant-games.mjs instead. Re-run with --force only if you intentionally want shared global configs.',
        },
        null,
        2,
      ),
    );
    const catalog = await c.query(
      `SELECT slug, tenant_id, status FROM game_configs WHERE status = 'active' ORDER BY slug, tenant_id NULLS FIRST`,
    );
    console.log('active configs:', catalog.rows);
    process.exit(0);
  }

  const updated = await c.query(
    `UPDATE game_configs
     SET tenant_id = NULL
     WHERE tenant_id IS NOT NULL
       AND status = 'active'
     RETURNING slug`,
  );
  console.log(
    'shared configs:',
    updated.rows.map((r) => r.slug),
  );

  const rave = await c.query(`SELECT id FROM tenants WHERE slug = 'rave-star'`);
  const tenantId = rave.rows[0]?.id;
  const found = await c.query(
    `SELECT id, slug, tenant_id FROM game_configs
     WHERE slug = 'greedy_baby' AND status = 'active'
       AND ($1::uuid IS NULL OR tenant_id = $1 OR tenant_id IS NULL)
     ORDER BY CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [tenantId],
  );
  console.log('greedy_baby for rave-star:', found.rows[0] || null);
} finally {
  await c.end();
}
