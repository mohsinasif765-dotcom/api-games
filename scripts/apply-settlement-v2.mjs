#!/usr/bin/env node
/**
 * Apply db/round-cron.sql (canonical tick: roulette support + locked cron)
 * and db/settlement-v2.sql (config fixes + merchant retry columns) in ONE
 * transaction, then verify rounds keep advancing.
 *
 *   node scripts/apply-settlement-v2.mjs
 *
 * DATABASE_URL is a Supavisor transaction pooler: no session-level SET here.
 */
import fs from 'node:fs';
import pg from 'pg';

const url = fs.readFileSync('.env.local', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await client.query('BEGIN');
  await client.query(fs.readFileSync('db/round-cron.sql', 'utf8'));
  await client.query(fs.readFileSync('db/settlement-v2.sql', 'utf8'));
  await client.query('COMMIT');
  console.log('✔ applied round-cron.sql + settlement-v2.sql');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('✖ rolled back:', e.message);
  process.exit(1);
}

// Sanity: helper semantics match the client (lib/euro-roulette-phaser/config.ts).
const checks = await client.query(`
  SELECT
    public.roulette_option_matches(0, 'zero')   AS zero_ok,
    public.roulette_option_matches(7, 'red')    AS seven_red,
    public.roulette_option_matches(7, 'odd')    AS seven_odd,
    public.roulette_option_matches(7, 'dozen1') AS seven_dozen1,
    public.roulette_option_matches(7, 'black')  AS seven_black,
    public.roulette_option_matches(0, 'even')   AS zero_even,
    public.option_multiplier('[{"id":"red","multiplier":2}]'::jsonb, 'red') AS red_mult`);
console.log('helpers:', checks.rows[0]);

const cfg = await client.query(`
  SELECT slug, meta->>'kind' AS kind,
         (SELECT string_agg(o->>'id' || ':' || (o->>'multiplier'), ' ')
            FROM jsonb_array_elements(meta->'options') o) AS options
  FROM game_configs WHERE slug IN ('euro_roulette', 'greedy_king') ORDER BY slug`);
for (const r of cfg.rows) console.log(`${r.slug.padEnd(14)} kind=${r.kind ?? '-'} ${r.options}`);

console.log('waiting 45s for euro rounds to settle under the new tick…');
await sleep(45_000);
const euro = await client.query(`
  SELECT gr.status, gr.winner_result
  FROM game_rounds gr JOIN game_configs gc ON gc.id = gr.game_id
  WHERE gc.slug = 'euro_roulette' AND gr.created_at > now() - interval '2 minutes'
  ORDER BY gr.created_at DESC LIMIT 6`);
console.log('recent euro rounds:', euro.rows.map((r) => `${r.status}:${r.winner_result ?? '-'}`).join(' '));

const runs = await client.query(`
  SELECT count(*) FILTER (WHERE status = 'failed') AS failed, count(*) AS total
  FROM cron.job_run_details
  WHERE jobid = 3 AND start_time > now() - interval '45 seconds'`);
const overdue = await client.query(`
  SELECT count(*)::int AS n FROM game_rounds
  WHERE status <> 'finished'
    AND ((status = 'betting' AND betting_ends_at < now() - interval '3 seconds')
      OR (status = 'spinning' AND COALESCE(spinning_ends_at, round_ends_at) < now() - interval '3 seconds'))`);
console.log(`cron runs 45s: ${runs.rows[0].total}, failed: ${runs.rows[0].failed}; overdue rounds: ${overdue.rows[0].n}`);
if (Number(runs.rows[0].failed) > 0 || overdue.rows[0].n > 0) {
  console.error('✖ verification failed');
  process.exitCode = 1;
} else {
  console.log('✔ rounds advancing normally');
}
await client.end();
