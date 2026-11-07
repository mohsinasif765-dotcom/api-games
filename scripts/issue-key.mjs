import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const tenantSlug = process.argv[2] || 'demo';
const username = process.argv[3] || 'smoke_player';
const coins = Number(process.argv[4] || 100000);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const tenant = await client.query(
    `SELECT id, slug, name FROM tenants WHERE slug = $1 LIMIT 1`,
    [tenantSlug],
  );
  if (!tenant.rows[0]) throw new Error(`Tenant ${tenantSlug} not found`);

  const externalId = `ext_${username}_${Date.now()}`;
  const player = await client.query(
    `INSERT INTO players (tenant_id, external_id, username, coins)
     VALUES ($1, $2, $3, $4)
     RETURNING id, coins`,
    [tenant.rows[0].id, externalId, username, coins],
  );

  const raw = `pk_live_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash('sha256').update(raw).digest('hex');

  await client.query(
    `INSERT INTO player_api_keys (tenant_id, player_id, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [tenant.rows[0].id, player.rows[0].id, prefix, hash],
  );

  console.log(
    JSON.stringify(
      {
        api_key: raw,
        tenant: tenant.rows[0].slug,
        player_id: player.rows[0].id,
        coins: Number(player.rows[0].coins),
        open: `/?apiKey=${raw}&tenant=${tenant.rows[0].slug}`,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
