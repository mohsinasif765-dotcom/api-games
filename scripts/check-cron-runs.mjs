import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

await new Promise((r) => setTimeout(r, 3500));

const runs = await c.query(`
  SELECT jobid, status, return_message, start_time, end_time
  FROM cron.job_run_details
  ORDER BY start_time DESC
  LIMIT 8
`);
console.log("recent runs:", runs.rows);

const car = await c.query(`
  SELECT status, winner_result, betting_ends_at, spinning_ends_at, pot, created_at
  FROM game_rounds gr
  JOIN game_configs gc ON gc.id = gr.game_id
  WHERE gc.slug = 'car_roulette'
  ORDER BY gr.created_at DESC
  LIMIT 3
`);
console.log("car rounds:", car.rows);

await c.end();
