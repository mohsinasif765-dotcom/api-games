import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const cols = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='game_rounds' ORDER BY 1`);
console.log("game_rounds cols:", cols.rows.map((r) => r.column_name));

const rls = await c.query(`
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('game_rounds','game_configs','game_bets','players')
`);
console.log("rls:", rls.rows);

const policies = await c.query(`
  SELECT schemaname, tablename, policyname, cmd, qual, with_check
  FROM pg_policies WHERE schemaname='public'
`);
console.log("policies:", policies.rows);

const pubs = await c.query(`
  SELECT pubname, schemaname, tablename
  FROM pg_publication_tables
  WHERE tablename IN ('game_rounds','game_configs','game_bets')
`).catch((e) => ({ rows: [], error: e.message }));
console.log("publications:", pubs.rows || pubs);

await c.end();
