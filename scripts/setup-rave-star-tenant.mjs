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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const cbAppId = `rave_${randomBytes(8).toString('hex')}`;
  const cbAppKey = randomBytes(24).toString('base64url');

  const tenantRes = await client.query(
    `INSERT INTO tenants (
       slug, name, status, usdt_balance, coin_to_usdt_rate, wallet_mode,
       cb_user_info_url, cb_change_balance_url, cb_get_sstoken_url, cb_update_sstoken_url,
       cb_app_id, cb_app_key, cb_timeout_ms
     ) VALUES (
       'rave-star', 'Rave Star', 'active', 1000, 0.0001, 'local',
       'https://gateway.rave-star.com/v1/api/get_user_info',
       'https://gateway.rave-star.com/v1/api/change_balance',
       'https://gateway.rave-star.com/v1/api/get_sstoken',
       'https://gateway.rave-star.com/v1/api/update_sstoken',
       $1, $2, 8000
     )
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       status = 'active',
       usdt_balance = GREATEST(tenants.usdt_balance, EXCLUDED.usdt_balance),
       coin_to_usdt_rate = EXCLUDED.coin_to_usdt_rate,
       cb_user_info_url = EXCLUDED.cb_user_info_url,
       cb_change_balance_url = EXCLUDED.cb_change_balance_url,
       cb_get_sstoken_url = EXCLUDED.cb_get_sstoken_url,
       cb_update_sstoken_url = EXCLUDED.cb_update_sstoken_url,
       cb_app_id = COALESCE(tenants.cb_app_id, EXCLUDED.cb_app_id),
       cb_app_key = COALESCE(tenants.cb_app_key, EXCLUDED.cb_app_key),
       cb_timeout_ms = EXCLUDED.cb_timeout_ms
     RETURNING id, slug, name, usdt_balance, coin_to_usdt_rate, wallet_mode,
               cb_app_id, cb_app_key`,
    [cbAppId, cbAppKey],
  );
  const t = tenantRes.rows[0];

  await client.query(
    `INSERT INTO tenant_ledger (tenant_id, kind, amount_usdt, balance_after, note)
     SELECT $1, 'topup', 1000, $2, 'initial rave-star topup'
     WHERE NOT EXISTS (
       SELECT 1 FROM tenant_ledger WHERE tenant_id = $1 AND note = 'initial rave-star topup'
     )`,
    [t.id, t.usdt_balance],
  );

  const playerRes = await client.query(
    `INSERT INTO players (tenant_id, external_id, username, coins)
     VALUES ($1, 'rave_demo_player', 'RavePlayer', 500000)
     ON CONFLICT (tenant_id, external_id)
     DO UPDATE SET
       username = EXCLUDED.username,
       coins = GREATEST(players.coins, EXCLUDED.coins)
     RETURNING id, coins, username, external_id`,
    [t.id],
  );
  const p = playerRes.rows[0];

  const raw = `pk_live_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash('sha256').update(raw).digest('hex');
  await client.query(
    `INSERT INTO player_api_keys (tenant_id, player_id, key_prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, ARRAY['game:play']::text[])`,
    [t.id, p.id, prefix, hash],
  );

  const out = {
    tenant: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      wallet_mode: t.wallet_mode,
      usdt_balance: Number(t.usdt_balance),
      coin_to_usdt_rate: Number(t.coin_to_usdt_rate),
    },
    merchant_callback_creds: {
      cb_app_id: t.cb_app_id,
      cb_app_key: t.cb_app_key,
      note: 'Put these on Rave gateway so it can verify api-games signed callbacks when wallet_mode=merchant_callback',
    },
    player: {
      id: p.id,
      external_id: p.external_id,
      username: p.username,
      coins: Number(p.coins),
    },
    api_key: raw,
    launch: {
      greedylion: `/greedylion?apiKey=${encodeURIComponent(raw)}&tenant=rave-star`,
      football: `/football?apiKey=${encodeURIComponent(raw)}&tenant=rave-star`,
    },
  };

  const outPath = path.join(root, 'rave-star-credentials.local.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath} (gitignored locally if configured)`);
} finally {
  await client.end();
}
