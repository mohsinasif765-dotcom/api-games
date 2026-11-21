#!/usr/bin/env node
/**
 * Apply db/round-engine.sql (locked tick wrapper + pg_cron switch) and verify
 * rounds keep advancing afterwards.
 *
 *   node scripts/apply-round-engine.mjs
 *
 * NOTE: DATABASE_URL is a Supavisor *transaction* pooler — never use
 * session-level SET here (it leaks to other clients on the pooled backend).
 */
import fs from 'node:fs';
import pg from 'pg';

const url = fs
  .readFileSync('.env.local', 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(fs.readFileSync('db/round-engine.sql', 'utf8'));
  await client.query('COMMIT');
  console.log('✔ applied db/round-engine.sql');

  const job = await client.query(
    `SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'tick-game-rounds'`,
  );
  console.log('cron job:', job.rows[0]);

  console.log('waiting 5s for cron runs…');
  await new Promise((r) => setTimeout(r, 5000));

  const runs = await client.query(
    `SELECT status, return_message,
            round(extract(epoch from (end_time - start_time))::numeric, 3) AS secs
     FROM cron.job_run_details
     WHERE jobid = $1 AND start_time > now() - interval '5 seconds'
     ORDER BY start_time DESC`,
    [job.rows[0].jobid],
  );
  // 'running' = the in-flight run at query time; only 'failed' is a problem.
  const failed = runs.rows.filter((r) => r.status === 'failed');
  console.log(
    `cron runs in last 5s: ${runs.rows.length}, failed: ${failed.length}`,
    failed[0] ?? '',
  );

  const overdue = await client.query(`
    SELECT count(*)::int AS n FROM game_rounds
    WHERE status <> 'finished'
      AND ((status = 'betting' AND betting_ends_at < now() - interval '3 seconds')
        OR (status = 'spinning' AND COALESCE(spinning_ends_at, round_ends_at) < now() - interval '3 seconds'))`);
  console.log(`rounds overdue by >3s: ${overdue.rows[0].n}`);

  if (failed.length || runs.rows.length === 0 || overdue.rows[0].n > 0) {
    console.error('✖ verification failed — see rollback in db/round-engine.sql');
    process.exitCode = 1;
  } else {
    console.log('✔ cron healthy with locked tick');
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await client.end();
}
