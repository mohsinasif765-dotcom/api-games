/**
 * Monte-Carlo check of pick_weighted_option RTP bias (runs in Postgres).
 *
 * Usage:
 *   node scripts/simulate-rtp.mjs [rtp=92] [n=20000]
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

const rtp = Number(process.argv[2] || 92);
const n = Math.floor(Number(process.argv[3] || 20000));

const options = [
  { id: 'a', multiplier: 45 },
  { id: 'b', multiplier: 25 },
  { id: 'c', multiplier: 15 },
  { id: 'd', multiplier: 10 },
  { id: 'e', multiplier: 5 },
  { id: 'f', multiplier: 5 },
  { id: 'g', multiplier: 5 },
  { id: 'h', multiplier: 5 },
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const fair = await client.query(
    `
    WITH picks AS (
      SELECT public.pick_weighted_option($1::jsonb, NULL) AS winner
      FROM generate_series(1, $2)
    ),
    scored AS (
      SELECT p.winner,
             (SELECT (o->>'multiplier')::numeric
              FROM jsonb_array_elements($1::jsonb) o
              WHERE o->>'id' = p.winner
              LIMIT 1) AS mult
      FROM picks p
    )
    SELECT
      avg(mult) AS avg_payout_if_unit_on_winner_only,
      -- Empirical RTP if unit stake on every option each round:
      -- payout = sum over options of (1 if option=winner else 0)*mult = winner.mult
      -- wager = count(options); ratio = winner.mult / n_options
      avg(mult) / $3::numeric AS empirical_even_bet_rtp
    FROM scored
    `,
    [JSON.stringify(options), n, options.length],
  );

  const biased = await client.query(
    `
    WITH picks AS (
      SELECT public.pick_weighted_option($1::jsonb, $2::numeric) AS winner
      FROM generate_series(1, $3)
    ),
    scored AS (
      SELECT p.winner,
             (SELECT (o->>'multiplier')::numeric
              FROM jsonb_array_elements($1::jsonb) o
              WHERE o->>'id' = p.winner
              LIMIT 1) AS mult
      FROM picks p
    )
    SELECT
      avg(mult) / $4::numeric AS empirical_even_bet_rtp
    FROM scored
    `,
    [JSON.stringify(options), rtp, n, options.length],
  );

  // Single-option theoretical fair RTP proxy
  const sumInv = options.reduce((s, o) => s + 1 / o.multiplier, 0);
  const r0 = 1 / sumInv;

  console.log(
    JSON.stringify(
      {
        n,
        target_rtp_percent: rtp,
        fair_proxy_R0_percent: Number((r0 * 100).toFixed(4)),
        fair_even_bet_rtp_percent: Number(
          (Number(fair.rows[0].empirical_even_bet_rtp) * 100).toFixed(4),
        ),
        biased_even_bet_rtp_percent: Number(
          (Number(biased.rows[0].empirical_even_bet_rtp) * 100).toFixed(4),
        ),
        note: 'even-bet RTP = E[winner.mult] / n_options; single-option fair proxy is R0',
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
