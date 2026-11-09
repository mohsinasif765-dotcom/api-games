import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name ILIKE '%game%'
     ORDER BY table_name`,
  );
  console.log('tables', tables.rows.map((r) => r.table_name));

  const configs = await c.query(
    `SELECT id, slug, name, status, meta FROM game_configs WHERE slug ILIKE '%greedy%' OR name ILIKE '%greedy%' OR slug ILIKE '%lion%'`,
  );
  console.log('configs', configs.rows);

  const allActive = await c.query(
    `SELECT id, slug, name, status FROM game_configs WHERE status = 'active' ORDER BY slug`,
  );
  console.log(
    'active games',
    allActive.rows.map((r) => r.slug),
  );

  for (const g of configs.rows) {
    const rounds = await c.query(
      `SELECT id, status, round_number, betting_ends_at, spinning_ends_at, round_ends_at, created_at
       FROM game_rounds WHERE game_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [g.id],
    );
    console.log('rounds for', g.slug, rounds.rows);
  }

  const now = await c.query('SELECT now() AS db_now');
  console.log('db_now', now.rows[0]);

  try {
    const jobs = await c.query(
      `SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobid`,
    );
    console.log('cron jobs', jobs.rows);
  } catch (e) {
    console.log('cron lookup failed', e.message);
  }
} finally {
  await c.end();
}
