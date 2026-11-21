/**
 * Create/update play-daira tenant for api-games (merchant_callback → Play Daira gateway).
 *
 * Env (optional overrides):
 *   PLAY_DAIRA_GATEWAY_PUBLIC_URL
 *   API_GAMES_CB_APP_ID / API_GAMES_CB_APP_KEY  (must match playdaira-gateway)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
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

const GW =
  process.env.PLAY_DAIRA_GATEWAY_PUBLIC_URL ||
  'https://play-daira-gateway.app.zuvodev.com';
const CB_APP_ID =
  process.env.API_GAMES_CB_APP_ID ||
  `play_${randomBytes(8).toString('hex')}`;
const CB_APP_KEY =
  process.env.API_GAMES_CB_APP_KEY || randomBytes(24).toString('base64url');

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
  const rtpSql = path.join(root, 'db', 'tenant-rtp.sql');
  if (fs.existsSync(rtpSql)) {
    await client.query(fs.readFileSync(rtpSql, 'utf8'));
  }

  const tenantRes = await client.query(
    `INSERT INTO tenants (
       slug, name, status, usdt_balance, coin_to_usdt_rate, wallet_mode, rtp_target,
       cb_user_info_url, cb_change_balance_url, cb_get_sstoken_url, cb_update_sstoken_url,
       cb_app_id, cb_app_key, cb_timeout_ms
     ) VALUES (
       'play-daira', 'Play Daira', 'active', 5000, 0.0001, 'merchant_callback', 95,
       $1, $2, $3, $4,
       $5, $6, 8000
     )
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       status = 'active',
       usdt_balance = GREATEST(tenants.usdt_balance, EXCLUDED.usdt_balance),
       coin_to_usdt_rate = EXCLUDED.coin_to_usdt_rate,
       wallet_mode = 'merchant_callback',
       rtp_target = COALESCE(tenants.rtp_target, EXCLUDED.rtp_target),
       cb_user_info_url = EXCLUDED.cb_user_info_url,
       cb_change_balance_url = EXCLUDED.cb_change_balance_url,
       cb_get_sstoken_url = EXCLUDED.cb_get_sstoken_url,
       cb_update_sstoken_url = EXCLUDED.cb_update_sstoken_url,
       cb_app_id = EXCLUDED.cb_app_id,
       cb_app_key = EXCLUDED.cb_app_key,
       cb_timeout_ms = EXCLUDED.cb_timeout_ms
     RETURNING id, slug, name, usdt_balance, coin_to_usdt_rate, wallet_mode, rtp_target,
               cb_app_id`,
    [
      `${GW}/v1/api/apigames/get_user_info`,
      `${GW}/v1/api/apigames/change_balance`,
      `${GW}/v1/api/apigames/get_sstoken`,
      `${GW}/v1/api/apigames/update_sstoken`,
      CB_APP_ID,
      CB_APP_KEY,
    ],
  );
  const t = tenantRes.rows[0];

  await client.query(
    `INSERT INTO tenant_ledger (tenant_id, kind, amount_usdt, balance_after, note)
     SELECT $1, 'topup', 5000, $2, 'initial play-daira topup'
     WHERE NOT EXISTS (
       SELECT 1 FROM tenant_ledger WHERE tenant_id = $1 AND note = 'initial play-daira topup'
     )`,
    [t.id, t.usdt_balance],
  );

  console.log(
    JSON.stringify(
      {
        tenant: {
          id: t.id,
          slug: t.slug,
          name: t.name,
          wallet_mode: t.wallet_mode,
          rtp_target: Number(t.rtp_target),
          usdt_balance: Number(t.usdt_balance),
        },
        merchant_callback: {
          cb_app_id: t.cb_app_id,
          gateway: GW,
        },
        next: `node scripts/assign-tenant-games.mjs play-daira greedy_king,greedylion,football,greedy_baby`,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
