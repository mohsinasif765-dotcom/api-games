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
const configs = await c.query(
  `SELECT gc.id, gc.slug, gc.status, gc.tenant_id, t.slug AS tenant_slug
   FROM game_configs gc
   LEFT JOIN tenants t ON t.id = gc.tenant_id
   WHERE gc.slug IN ('greedy_baby', 'greedy_king')
   ORDER BY gc.slug, t.slug NULLS FIRST`,
);
console.log('configs', configs.rows);
const rounds = await c.query(
  `SELECT gr.id, gr.status, gr.tenant_id, gc.slug
   FROM game_rounds gr
   JOIN game_configs gc ON gc.id = gr.game_id
   WHERE gc.slug = 'greedy_baby'
   ORDER BY gr.created_at DESC
   LIMIT 5`,
);
console.log('rounds', rounds.rows);
await c.end();
