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

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  // Make catalog shared across tenants (tenant_id NULL = global)
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

  // Smoke: greedy_baby visible for rave-star style lookup
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
