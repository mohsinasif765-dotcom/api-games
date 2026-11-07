import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const ext = await c.query(`SELECT extname, extversion FROM pg_extension ORDER BY 1`);
console.log("extensions:", ext.rows);

const funcs = await c.query(`
  SELECT n.nspname, p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'cron')
  ORDER BY 1, 2
`);
console.log(
  "public/cron funcs:",
  funcs.rows.filter((r) =>
    /round|game|tick|cron|bet|spin|winner|payout/i.test(r.proname),
  ),
);

try {
  const jobs = await c.query(`SELECT jobid, jobname, schedule, command, active FROM cron.job`);
  console.log("cron.job:", jobs.rows);
} catch (e) {
  console.log("cron.job error:", e.message);
}

const tables = await c.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' ORDER BY 1
`);
console.log("public tables:", tables.rows.map((r) => r.table_name));

for (const t of ["game_rounds", "game_configs", "game_bets", "games"]) {
  const cols = await c.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [t],
  );
  if (cols.rows.length) {
    console.log(`\n${t}:`, cols.rows.map((r) => `${r.column_name}:${r.udt_name}`).join(", "));
  }
}

await c.end();
