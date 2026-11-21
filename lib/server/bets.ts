import { query, getPool } from './db';
import type { AuthContext } from './api-keys';
import { ApiErrorCode, apiError } from './error-codes';
import {
  loadTenantBilling,
  merchantChangeBalance,
  newRequestId,
} from './merchant-callbacks';

type Queryable = { query: typeof query };

/**
 * Win payouts already settled for this player but not yet credited to the
 * merchant wallet (status pending/processing). In merchant mode the merchant
 * balance doesn't include them yet, so every balance we show or mirror must
 * add them — otherwise a fresh win "disappears" until the credit lands.
 */
export async function pendingMerchantCredits(
  playerId: string,
  opts: { excludeBetId?: string; db?: Queryable } = {},
): Promise<number> {
  const db = opts.db ?? { query };
  const { rows } = await db.query<{ total: string | number }>(
    `SELECT COALESCE(SUM(payout_amount), 0) AS total
     FROM game_bets
     WHERE player_id = $1
       AND is_win = true
       AND merchant_credit_status IN ('pending', 'processing')
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [playerId, opts.excludeBetId ?? null],
  );
  return Number(rows[0]?.total ?? 0);
}

export type PlaceBetInput = {
  auth: AuthContext;
  slug: string;
  option: string;
  amount: number;
  roundId?: string;
};

export async function placeBet(input: PlaceBetInput) {
  const amount = Math.floor(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError('Invalid bet amount', 400, ApiErrorCode.INVALID_BET_AMOUNT);
  }
  if (!input.option?.trim()) {
    throw apiError('bet_option required', 400, ApiErrorCode.BET_OPTION_REQUIRED);
  }

  const tenant = await loadTenantBilling(input.auth.tenant.id);
  if (!tenant || tenant.status !== 'active') {
    throw apiError(
      'Tenant suspended or missing',
      403,
      ApiErrorCode.TENANT_SUSPENDED,
    );
  }
  if (Number(tenant.usdt_balance) <= 0 && Number(tenant.coin_to_usdt_rate) > 0) {
    throw apiError(
      'Tenant prepaid USDT exhausted',
      402,
      ApiErrorCode.TENANT_USDT_EXHAUSTED,
    );
  }

  const merchantMode = tenant.wallet_mode === 'merchant_callback';
  const externalId = input.auth.player.external_id?.trim();
  if (merchantMode && !externalId) {
    throw apiError(
      'Player external_id required for merchant wallet',
      400,
      ApiErrorCode.EXTERNAL_ID_REQUIRED,
    );
  }

  let merchantRequestId: string | null = null;
  let merchantCoins: number | undefined;

  if (merchantMode && externalId) {
    merchantRequestId = newRequestId('debit');
    const sstokenRes = await query<{ sstoken: string | null }>(
      `SELECT sstoken FROM players WHERE id = $1`,
      [input.auth.player.id],
    );
    const debit = await merchantChangeBalance(tenant, {
      externalId,
      amount: -amount,
      requestId: merchantRequestId,
      reason: `bet:${input.slug}`,
      sstoken: sstokenRes.rows[0]?.sstoken,
    });
    if (!debit.ok) {
      throw apiError(
        debit.error || 'Merchant debit failed',
        402,
        ApiErrorCode.MERCHANT_DEBIT_FAILED,
      );
    }
    merchantCoins = debit.coins;
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const configRes = await client.query<{ id: string }>(
      `SELECT id FROM game_configs
       WHERE slug = $1
         AND status = 'active'
         AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [input.slug, input.auth.tenant.id],
    );
    const gameId = configRes.rows[0]?.id;
    if (!gameId) {
      throw apiError('Game not found', 404, ApiErrorCode.GAME_NOT_FOUND);
    }

    let roundId = input.roundId?.trim() || null;
    if (roundId) {
      const roundCheck = await client.query(
        `SELECT id, status, tenant_id
         FROM game_rounds
         WHERE id = $1 AND game_id = $2
         FOR UPDATE`,
        [roundId, gameId],
      );
      const round = roundCheck.rows[0];
      if (!round) {
        throw apiError('Round not found', 404, ApiErrorCode.ROUND_NOT_FOUND);
      }
      if (
        round.tenant_id &&
        round.tenant_id !== input.auth.tenant.id
      ) {
        throw apiError('Round not found', 404, ApiErrorCode.ROUND_NOT_FOUND);
      }
      if (round.status !== 'betting') {
        throw apiError('Betting closed', 409, ApiErrorCode.BETTING_CLOSED);
      }
    } else {
      const active = await client.query<{ id: string }>(
        `SELECT id FROM game_rounds
         WHERE game_id = $1
           AND status = 'betting'
           AND (tenant_id = $2 OR tenant_id IS NULL)
         ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [gameId, input.auth.tenant.id],
      );
      roundId = active.rows[0]?.id ?? null;
      if (!roundId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO game_rounds (game_id, tenant_id, status, betting_ends_at)
           VALUES ($1, $2, 'betting', now() + interval '30 seconds')
           RETURNING id`,
          [gameId, input.auth.tenant.id],
        );
        roundId = created.rows[0].id;
      }
    }

    const playerRes = await client.query<{ coins: string }>(
      `SELECT coins FROM players WHERE id = $1 FOR UPDATE`,
      [input.auth.player.id],
    );

    if (merchantMode) {
      // Merchant balance after the debit, plus wins it hasn't been credited yet.
      const pending =
        merchantCoins != null
          ? await pendingMerchantCredits(input.auth.player.id, {
              db: client as unknown as Queryable,
            })
          : 0;
      const mirrored =
        merchantCoins != null
          ? merchantCoins + pending
          : Number(playerRes.rows[0]?.coins ?? 0) - amount;
      if (mirrored < 0) {
        throw apiError(
          'Insufficient balance',
          402,
          ApiErrorCode.INSUFFICIENT_BALANCE,
        );
      }
      await client.query(`UPDATE players SET coins = $1 WHERE id = $2`, [
        Math.max(0, mirrored),
        input.auth.player.id,
      ]);
    } else {
      const coins = Number(playerRes.rows[0]?.coins ?? 0);
      if (coins < amount) {
        throw apiError(
          'Insufficient balance',
          402,
          ApiErrorCode.INSUFFICIENT_BALANCE,
        );
      }
      await client.query(`UPDATE players SET coins = coins - $1 WHERE id = $2`, [
        amount,
        input.auth.player.id,
      ]);
    }

    const betRes = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO game_bets (
         tenant_id, round_id, player_id, bet_option, amount, merchant_debit_req
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        input.auth.tenant.id,
        roundId,
        input.auth.player.id,
        input.option.trim(),
        amount,
        merchantRequestId,
      ],
    );

    await client.query(`UPDATE game_rounds SET pot = pot + $1 WHERE id = $2`, [
      amount,
      roundId,
    ]);

    const balRes = await client.query<{ coins: string }>(
      `SELECT coins FROM players WHERE id = $1`,
      [input.auth.player.id],
    );

    await client.query('COMMIT');

    return {
      bet_id: betRes.rows[0].id,
      round_id: roundId,
      option: input.option.trim(),
      amount,
      balance: Number(balRes.rows[0].coins),
      created_at: betRes.rows[0].created_at,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    if (merchantMode && merchantRequestId && externalId) {
      try {
        await merchantChangeBalance(tenant, {
          externalId,
          amount,
          requestId: newRequestId(`rev:${merchantRequestId}`),
          reason: 'bet_rollback',
        });
      } catch (revErr) {
        console.error('[placeBet] merchant reverse failed', revErr);
      }
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function adjustBalance(
  playerId: string,
  delta: number,
): Promise<number> {
  const amount = Math.floor(Number(delta));
  if (!Number.isFinite(amount) || amount === 0) {
    throw apiError('Invalid amount', 400, ApiErrorCode.INVALID_AMOUNT);
  }

  if (amount < 0) {
    const { rows } = await query<{ coins: string }>(
      `UPDATE players
       SET coins = coins + $1
       WHERE id = $2 AND coins >= $3
       RETURNING coins`,
      [amount, playerId, Math.abs(amount)],
    );
    if (!rows[0]) {
      throw apiError(
        'Insufficient balance',
        402,
        ApiErrorCode.INSUFFICIENT_BALANCE,
      );
    }
    return Number(rows[0].coins);
  }

  const { rows } = await query<{ coins: string }>(
    `UPDATE players SET coins = coins + $1 WHERE id = $2 RETURNING coins`,
    [amount, playerId],
  );
  if (!rows[0]) {
    throw apiError('Player not found', 404, ApiErrorCode.PLAYER_NOT_FOUND);
  }
  return Number(rows[0].coins);
}

const CREDIT_MAX_ATTEMPTS = 10;
/** A claimed credit is retried by any worker once this lease expires (crash safety). */
const CREDIT_LEASE_SECONDS = 60;

/** 5s, 10s, 20s … capped at 30 min. */
function creditBackoffSeconds(attempt: number) {
  return Math.min(1800, 5 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Credit settled wins to merchant wallets.
 *
 * Rows are claimed atomically (status → 'processing' with a lease) so two
 * gateway instances or overlapping runs can never pay the same win. Failures
 * are retried with exponential backoff (CREDIT_MAX_ATTEMPTS) instead of being
 * dropped; every attempt reuses request_id `payout:<bet id>` so a merchant that
 * already applied it can de-duplicate.
 */
export async function settlePendingMerchantCredits(limit = 40): Promise<{
  processed: number;
  failed: number;
}> {
  let processed = 0;
  let failed = 0;

  const claimed = await query<{
    bet_id: string;
    payout_amount: string | number;
    player_id: string;
    tenant_id: string;
    attempts: number;
  }>(
    `UPDATE game_bets b
     SET merchant_credit_status = 'processing',
         merchant_credit_next_at = now() + make_interval(secs => $2)
     WHERE b.id IN (
       SELECT id FROM game_bets
       WHERE merchant_credit_status IN ('pending', 'processing')
         AND is_win = true
         AND payout_amount > 0
         AND (merchant_credit_next_at IS NULL OR merchant_credit_next_at <= now())
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING b.id AS bet_id, b.payout_amount, b.player_id, b.tenant_id,
               b.merchant_credit_attempts AS attempts`,
    [limit, CREDIT_LEASE_SECONDS],
  );
  if (claimed.rows.length === 0) return { processed, failed };

  const players = await query<{
    id: string;
    external_id: string | null;
    sstoken: string | null;
  }>(
    `SELECT id, external_id, sstoken FROM players WHERE id = ANY($1::uuid[])`,
    [[...new Set(claimed.rows.map((r) => r.player_id))]],
  );
  const playerById = new Map(players.rows.map((p) => [p.id, p]));

  const markRetryOrFail = async (betId: string, attempts: number, error: string) => {
    const next = attempts + 1;
    const giveUp = next >= CREDIT_MAX_ATTEMPTS;
    await query(
      `UPDATE game_bets
       SET merchant_credit_status = $2,
           merchant_credit_attempts = $3,
           merchant_credit_next_at = CASE WHEN $2 = 'pending'
             THEN now() + make_interval(secs => $4) ELSE NULL END,
           merchant_credit_error = $5
       WHERE id = $1`,
      [betId, giveUp ? 'failed' : 'pending', next, creditBackoffSeconds(next), error.slice(0, 500)],
    );
    if (giveUp) failed += 1;
  };

  for (const row of claimed.rows) {
    const tenant = await loadTenantBilling(row.tenant_id);
    if (!tenant || tenant.wallet_mode !== 'merchant_callback') {
      await query(
        `UPDATE game_bets
         SET merchant_credit_status = 'none', merchant_credit_next_at = NULL
         WHERE id = $1`,
        [row.bet_id],
      );
      continue;
    }
    const player = playerById.get(row.player_id);
    const ext = player?.external_id?.trim();
    if (!ext) {
      await markRetryOrFail(row.bet_id, CREDIT_MAX_ATTEMPTS, 'player has no external_id');
      continue;
    }

    const payout = Math.floor(Number(row.payout_amount));
    let credit: Awaited<ReturnType<typeof merchantChangeBalance>>;
    try {
      credit = await merchantChangeBalance(tenant, {
        externalId: ext,
        amount: payout,
        requestId: `payout:${row.bet_id}`,
        reason: 'win_payout',
        sstoken: player?.sstoken,
      });
    } catch (e) {
      credit = { ok: false, error: (e as Error).message };
    }

    if (!credit.ok) {
      console.warn(
        `[settle-merchant] credit failed bet=${row.bet_id} attempt=${row.attempts + 1}: ${credit.error}`,
      );
      await markRetryOrFail(row.bet_id, row.attempts, credit.error || 'merchant credit failed');
      continue;
    }

    await query(
      `UPDATE game_bets
       SET merchant_credit_status = 'done',
           merchant_credit_attempts = merchant_credit_attempts + 1,
           merchant_credit_next_at = NULL,
           merchant_credit_error = NULL
       WHERE id = $1`,
      [row.bet_id],
    );
    if (credit.coins != null) {
      // Mirror = merchant balance + this player's other not-yet-credited wins.
      await query(
        `UPDATE players
         SET coins = $1 + (
           SELECT COALESCE(SUM(payout_amount), 0) FROM game_bets
           WHERE player_id = $2 AND is_win = true
             AND merchant_credit_status IN ('pending', 'processing')
         )
         WHERE id = $2`,
        [credit.coins, row.player_id],
      );
    }
    processed += 1;
  }

  return { processed, failed };
}
