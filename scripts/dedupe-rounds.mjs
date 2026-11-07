import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Keep newest non-finished round per game; finish the rest
const r = await c.query(`
  WITH ranked AS (
    SELECT gr.id,
           ROW_NUMBER() OVER (PARTITION BY gr.game_id ORDER BY gr.created_at DESC) AS rn
    FROM game_rounds gr
    WHERE gr.status <> 'finished'
  )
  UPDATE game_rounds gr
  SET status = 'finished', round_ends_at = now()
  FROM ranked
  WHERE gr.id = ranked.id AND ranked.rn > 1
  RETURNING gr.id
`);
console.log("finished dupes", r.rowCount);

await c.end();
