/**
 * Balanced RTP profile for ludo-shudo.
 *
 * Goals:
 * - Platform: ~4–7% long-run hold (not bleed)
 * - Players: still feel wins — no "rigged" vibe (<90)
 * - Mix: high-volatility wheels slightly tighter; frequent-hit games slightly looser
 *
 * Usage:
 *   node scripts/configure-ludo-shudo-rtp.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const TENANT = 'ludo-shudo';

/** Tenant-wide fallback when a game has no meta.rtp */
const TENANT_DEFAULT_RTP = 95;

/**
 * Per-game RTP (percent). Logic:
 * - High mult / jackpot-feel wheels → 93 (platform protected, big hits still land)
 * - Mid social wheels → 94–95
 * - Frequent small-hit / 50-50 style → 96 (retention)
 */
const GAME_RTP = {
  greedy_king: 93, // Greedy Lion — high multipliers
  greedy_baby: 93,
  football_roulette: 94,
  car_roulette: 94,
  fruit_party: 95,
  pizza_express: 95,
  hero_chest: 94,
  euro_roulette: 95,
  teen_patti: 96,
  lucky_777: 95,
  fruit_777: 95,
};

const ASSIGN_SLUGS = Object.keys(GAME_RTP).join(',');

function runNode(script, args) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`${script} failed with status ${r.status}`);
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

// Prefer session pooler for DDL/multi-statement if 6543 is set
if (process.env.DATABASE_URL.includes(':6543/')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(':6543/', ':5432/');
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(fs.readFileSync(path.join(root, 'db', 'tenant-rtp.sql'), 'utf8'));

  const exists = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [TENANT]);
  if (!exists.rows[0]) {
    throw new Error(
      `Tenant ${TENANT} missing. Run: node scripts/setup-ludo-shudo-tenant.mjs`,
    );
  }
} finally {
  await client.end();
}

console.log(`\n=== ${TENANT}: assign games ===`);
runNode('assign-tenant-games.mjs', [TENANT, ASSIGN_SLUGS, '--reset-rtp']);

console.log(`\n=== ${TENANT}: tenant default RTP ${TENANT_DEFAULT_RTP} ===`);
runNode('set-tenant-rtp.mjs', [TENANT, String(TENANT_DEFAULT_RTP)]);

for (const [slug, rtp] of Object.entries(GAME_RTP)) {
  console.log(`\n=== ${TENANT}: ${slug} → ${rtp} ===`);
  runNode('set-tenant-rtp.mjs', [TENANT, String(rtp), `--game=${slug}`]);
}

const verify = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await verify.connect();
try {
  const rows = await verify.query(
    `SELECT
       gc.slug,
       gc.status,
       gc.meta->>'rtp' AS game_rtp,
       t.rtp_target AS tenant_default,
       COALESCE((gc.meta->>'rtp')::numeric, t.rtp_target, 96) AS effective_rtp
     FROM game_configs gc
     JOIN tenants t ON t.id = gc.tenant_id
     WHERE t.slug = $1
     ORDER BY gc.slug`,
    [TENANT],
  );
  const avg =
    rows.rows.reduce((s, r) => s + Number(r.effective_rtp), 0) /
    Math.max(rows.rows.length, 1);

  console.log(
    JSON.stringify(
      {
        tenant: TENANT,
        philosophy: {
          platform_hold_target: '4–7%',
          player_floor: '≥93 on high-vol, ≥95–96 on frequent-hit',
          tenant_default: TENANT_DEFAULT_RTP,
          portfolio_avg_rtp: Number(avg.toFixed(2)),
        },
        games: rows.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await verify.end();
}
