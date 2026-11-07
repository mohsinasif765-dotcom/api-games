import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
  console.log("pg_cron enabled");
} catch (e) {
  console.log("pg_cron FAIL:", e.message);
}
await c.end();
