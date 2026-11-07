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

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:3001/api/v1';

async function issueKey(client) {
  const tenant = await client.query(
    `SELECT id, slug FROM tenants WHERE slug = 'demo' LIMIT 1`,
  );
  if (!tenant.rows[0]) throw new Error('demo tenant missing');
  const externalId = `smoke_${Date.now()}`;
  const player = await client.query(
    `INSERT INTO players (tenant_id, external_id, username, coins)
     VALUES ($1, $2, $3, $4) RETURNING id, coins`,
    [tenant.rows[0].id, externalId, 'smoke', 100000],
  );
  const raw = `pk_live_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash('sha256').update(raw).digest('hex');
  await client.query(
    `INSERT INTO player_api_keys (tenant_id, player_id, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [tenant.rows[0].id, player.rows[0].id, prefix, hash],
  );
  return raw;
}

async function call(pathname, { method = 'GET', key, body } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': key,
      'X-Tenant-Id': 'demo',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const key = await issueKey(client);
  const me = await call('/me', { key });
  const config = await call('/games/car_roulette/config', { key });
  const round = await call('/games/car_roulette/round', { key });
  const roundId = round.json?.data?.round?.id;
  const bet = await call('/games/car_roulette/bets', {
    method: 'POST',
    key,
    body: { option: 'bmw', amount: 200, round_id: roundId },
  });
  const me2 = await call('/me', { key });

  const summary = {
    base,
    me: me.status,
    config: config.status,
    round: round.status,
    bet: bet.status,
    meAfter: me2.status,
    balanceBefore: me.json?.data?.player?.coins ?? null,
    balanceAfter: me2.json?.data?.player?.coins ?? null,
    betOk: bet.json?.ok === true,
    errors: [me, config, round, bet]
      .filter((x) => x.status >= 400 || x.json?.ok === false)
      .map((x) => ({ status: x.status, error: x.json?.error || x.json })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length || !summary.betOk) process.exitCode = 1;
} finally {
  await client.end();
}
