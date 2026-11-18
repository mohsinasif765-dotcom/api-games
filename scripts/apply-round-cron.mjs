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
  // Ensure rtp_target exists before tick joins tenants.rtp_target
  const rtpSql = fs.readFileSync(path.join(root, 'db', 'tenant-rtp.sql'), 'utf8');
  await client.query(rtpSql);

  let sql = fs.readFileSync(path.join(root, 'db', 'round-cron.sql'), 'utf8');
  // Apply DDL/functions without the bare schedule line (handled below)
  sql = sql.replace(
    /SELECT cron\.schedule\('tick-game-rounds',[\s\S]*?;\s*$/m,
    '',
  );
  await client.query(sql);

  try {
    await client.query(`SELECT cron.unschedule('tick-game-rounds')`);
  } catch {
    // job may not exist
  }

  const sched = await client.query(`
    SELECT cron.schedule(
      'tick-game-rounds',
      '1 second',
      $$SELECT public.tick_game_rounds()$$
    ) AS jobid
  `);
  console.log('cron scheduled jobid:', sched.rows[0]?.jobid);

  const kick = await client.query(`SELECT public.tick_game_rounds() AS n`);
  console.log('immediate tick advanced:', kick.rows[0]?.n);
  console.log('round-cron (RTP-aware) applied OK');
} finally {
  await client.end();
}
