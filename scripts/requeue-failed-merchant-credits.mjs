#!/usr/bin/env node
/**
 * Re-queue merchant win credits that ended in 'failed' (before 2026-11-21 a
 * single failure was final, so these wins were never paid to the merchant).
 *
 *   node scripts/requeue-failed-merchant-credits.mjs            # list only
 *   node scripts/requeue-failed-merchant-credits.mjs --write    # re-queue
 *
 * MONEY: run only after confirming with the merchant that these payouts were
 * NOT applied on their side (or that they de-duplicate by request_id
 * "payout:<bet id>"). The gateway's credit worker then retries them with backoff.
 */
import fs from 'node:fs';
import pg from 'pg';

const WRITE = process.argv.includes('--write');
const url = fs.readFileSync('.env.local', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim();
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query('BEGIN');
  const { rows } = await db.query(`
    SELECT b.id, b.created_at, b.payout_amount, p.external_id, t.slug AS tenant, gc.slug AS game
    FROM game_bets b
    JOIN players p ON p.id = b.player_id
    JOIN tenants t ON t.id = b.tenant_id
    JOIN game_rounds r ON r.id = b.round_id
    JOIN game_configs gc ON gc.id = r.game_id
    WHERE b.merchant_credit_status = 'failed' AND b.is_win AND b.payout_amount > 0
    ORDER BY b.created_at`);
  let total = 0;
  for (const r of rows) {
    total += Number(r.payout_amount);
    console.log(`${r.created_at.toISOString()}  ${r.tenant.padEnd(11)} ${r.game.padEnd(18)} player=${r.external_id} payout=${r.payout_amount}  bet=${r.id}`);
  }
  console.log(`\n${rows.length} failed credits, ${total} coins total`);
  if (WRITE && rows.length) {
    await db.query(
      `UPDATE game_bets
       SET merchant_credit_status = 'pending', merchant_credit_attempts = 0,
           merchant_credit_next_at = NULL, merchant_credit_error = NULL
       WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)],
    );
    await db.query('COMMIT');
    console.log('✔ re-queued — the gateway credit worker will pay them');
  } else {
    await db.query('ROLLBACK');
    if (!WRITE) console.log('(list only — add --write to re-queue)');
  }
} finally {
  await db.end();
}
