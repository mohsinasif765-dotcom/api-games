/**
 * Sync football_roulette meta.options multipliers with client TEAMS
 * (lib/football-phaser/config.ts — Bounty Football pitch).
 *
 * Bug: UI showed x2/x8 (and other Bounty odds) but DB paid flat x5 on
 * aldenaire/real_madrid/… so the win popup and wallet disagreed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

/** Same order/ids as TEAMS in lib/football-phaser/config.ts */
const OPTIONS = [
  { id: 'man_united', multiplier: 100 },
  { id: 'al_nassr', multiplier: 88 },
  { id: 'bayern', multiplier: 66 },
  { id: 'porto', multiplier: 50 },
  { id: 'juventus', multiplier: 30 },
  { id: 'man_city', multiplier: 20 },
  { id: 'psg', multiplier: 18 },
  { id: 'real_madrid', multiplier: 8 },
  { id: 'soccer_club', multiplier: 5 },
  { id: 'aldenaire', multiplier: 2 },
];

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
  const updated = await client.query(
    `UPDATE game_configs
     SET meta = jsonb_set(
       COALESCE(meta, '{}'::jsonb),
       '{options}',
       $1::jsonb,
       true
     )
     WHERE slug = 'football_roulette'
     RETURNING id, slug, tenant_id,
       (SELECT string_agg(o->>'id' || ':x' || (o->>'multiplier'), ', ' ORDER BY ord)
        FROM jsonb_array_elements(meta->'options') WITH ORDINALITY AS t(o, ord)) AS options_summary`,
    [JSON.stringify(OPTIONS)],
  );
  console.log(`updated ${updated.rowCount} game_configs`);
  for (const r of updated.rows) {
    console.log(
      `  ${r.id} tenant=${r.tenant_id ?? 'global'} → ${r.options_summary}`,
    );
  }
  console.log(
    'Note: tick reads options from game_configs (join). Redis gcfg cache TTL ~120s — wait or redis-invalidate.',
  );
} finally {
  await client.end();
}
