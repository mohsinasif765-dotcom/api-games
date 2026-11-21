#!/usr/bin/env node
/**
 * Compare the multipliers players SEE (client config) with what the server
 * PAYS (game_configs.meta.options) for every game, every tenant config.
 * Read-only. Exit code 1 on any mismatch — run before/after config changes.
 *
 *   node scripts/check-game-multipliers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/** Parse `GAME_SLUG` + `{ id: 'x', … multiplier: N }` pairs from a client config. */
function clientConfigs() {
  const out = {};
  for (const dir of fs.readdirSync('lib')) {
    const file = path.join('lib', dir, 'config.ts');
    if (!dir.endsWith('-phaser') || !fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const slug = src.match(/GAME_SLUG\s*=\s*'([^']+)'/)?.[1];
    if (!slug) continue;
    const opts = {};
    for (const m of src.matchAll(/id:\s*'([^']+)'[^{}]*?multiplier:\s*([0-9.]+)/g)) {
      opts[m[1]] = Number(m[2]);
    }
    if (Object.keys(opts).length) out[slug] = { file, opts };
  }
  return out;
}

const url = fs.readFileSync('.env.local', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim();
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query('BEGIN READ ONLY');
const { rows } = await db.query(`
  SELECT gc.slug, COALESCE(t.slug, 'GLOBAL') AS tenant, gc.meta->'options' AS options
  FROM game_configs gc LEFT JOIN tenants t ON t.id = gc.tenant_id
  WHERE gc.status = 'active'
  ORDER BY gc.slug, tenant`);
await db.query('COMMIT');
await db.end();

const client = clientConfigs();
let problems = 0;
for (const row of rows) {
  const ui = client[row.slug];
  if (!ui) continue; // non-option games (e.g. teen patti)
  const server = Object.fromEntries((row.options || []).map((o) => [o.id, Number(o.multiplier)]));
  const ids = new Set([...Object.keys(ui.opts), ...Object.keys(server)]);
  const diffs = [...ids].filter((id) => ui.opts[id] !== server[id]);
  if (diffs.length) {
    problems++;
    console.log(`✖ ${row.slug} [${row.tenant}] ` +
      diffs.map((id) => `${id}: UI x${ui.opts[id] ?? '—'} ≠ pays x${server[id] ?? '—'}`).join(', '));
  } else {
    console.log(`✔ ${row.slug} [${row.tenant}]`);
  }
}
process.exitCode = problems ? 1 : 0;
