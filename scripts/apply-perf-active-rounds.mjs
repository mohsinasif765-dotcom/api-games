#!/usr/bin/env node
/**
 * Apply db/perf-active-rounds.sql (partial index for live-round lookups) and
 * print before/after timings of the queries it speeds up.
 *
 *   node scripts/apply-perf-active-rounds.mjs
 */
import fs from 'node:fs';
import pg from 'pg';

const url = fs
  .readFileSync('.env.local', 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim();
const sql = fs.readFileSync('db/perf-active-rounds.sql', 'utf8');

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
// DATABASE_URL goes through Supavisor in *transaction* mode: a session-level
// SET sticks to the pooled backend and leaks to other clients. Anything we SET
// must be RESET before we disconnect (see finally below).
// Index build on a ~270MB table can exceed a short pooler default.
await client.query("SET statement_timeout = '15min'");
try {

async function timeActiveLookups(label) {
  const { rows } = await client.query(
    "SELECT id FROM game_configs WHERE status = 'active'",
  );
  const t0 = performance.now();
  for (const { id } of rows) {
    await client.query(
      `SELECT 1 FROM game_rounds
       WHERE game_id = $1 AND status <> 'finished'
       ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
  }
  const ms = performance.now() - t0;
  console.log(
    `${label}: ${rows.length} active-round lookups in ${ms.toFixed(0)}ms ` +
      `(${(ms / rows.length).toFixed(1)}ms each, incl. network)`,
  );
}

await timeActiveLookups('before');

const t0 = performance.now();
// Strip comments; CONCURRENTLY must be its own autocommit statement.
const statement = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .trim();
await client.query(statement);
console.log(`index created in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

const { rows: valid } = await client.query(`
  SELECT i.indisvalid
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'game_rounds_active_idx'`);
if (!valid[0]?.indisvalid) {
  console.error(
    'Index exists but is INVALID (build interrupted). Drop and re-run:\n' +
      '  DROP INDEX CONCURRENTLY IF EXISTS game_rounds_active_idx;',
  );
  process.exitCode = 1;
  throw new Error('invalid index');
}

await client.query('ANALYZE public.game_rounds');
await timeActiveLookups('after ');
} finally {
  await client.query('RESET statement_timeout').catch(() => {});
  await client.end();
}
