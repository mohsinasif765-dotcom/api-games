import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  const n = await c.query(`SELECT public.tick_game_rounds() AS n`);
  console.log("tick ok", n.rows[0]);
} catch (e) {
  console.error("tick FAIL", e.message);
}

const stuck = await c.query(`
  SELECT gc.slug, gr.id, gr.status, gr.winner_result, gr.spinning_ends_at, gr.betting_ends_at,
         now() AS db_now,
         gr.spinning_ends_at <= now() AS spin_due
  FROM game_rounds gr
  JOIN game_configs gc ON gc.id = gr.game_id
  WHERE gr.status <> 'finished'
  ORDER BY gc.slug
`);
console.log(stuck.rows);

const fails = await c.query(`
  SELECT status, return_message, start_time
  FROM cron.job_run_details
  WHERE status <> 'succeeded'
  ORDER BY start_time DESC
  LIMIT 5
`);
console.log("fail runs", fails.rows);

const recent = await c.query(`
  SELECT status, return_message, start_time
  FROM cron.job_run_details
  ORDER BY start_time DESC
  LIMIT 3
`);
console.log("recent", recent.rows);

await c.end();
