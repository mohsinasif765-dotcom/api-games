import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

await c.query(`
  ALTER TABLE game_rounds
    ADD COLUMN IF NOT EXISTS boot_amount bigint NOT NULL DEFAULT 0;

  ALTER TABLE game_configs
    ADD COLUMN IF NOT EXISTS max_bet bigint,
    ADD COLUMN IF NOT EXISTS config_data jsonb NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE game_bets
    ADD COLUMN IF NOT EXISTS user_id uuid;

  -- Keep user_id mirrored from player_id for legacy UI selects
  UPDATE game_bets SET user_id = player_id WHERE user_id IS NULL;
`);

// Grant PostgREST roles read access if they exist
for (const role of ["anon", "authenticated", "service_role"]) {
  try {
    await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    console.log("granted", role);
  } catch (e) {
    console.log("skip grant", role, e.message);
  }
}

console.log("compat cols ok");
await c.end();
