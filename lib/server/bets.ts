import { query, getPool } from './db';
import type { AuthContext } from './api-keys';
import { ApiErrorCode, apiError } from './error-codes';
import {
  loadTenantBilling,
  merchantChangeBalance,
  newRequestId,
} from './merchant-callbacks';

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
       WHERE slug = $1 AND (tenant_id = $2 OR tenant_id IS NULL) AND status = 'active'
       ORDER BY tenant_id NULLS LAST
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
        `SELECT id, status FROM game_rounds WHERE id = $1 AND game_id = $2 FOR UPDATE`,
        [roundId, gameId],
      );
      const round = roundCheck.rows[0];
      if (!round) {
        throw apiError('Round not found', 404, ApiErrorCode.ROUND_NOT_FOUND);
      }
      if (round.status !== 'betting') {
        throw apiError('Betting closed', 409, ApiErrorCode.BETTING_CLOSED);
      }
    } else {
      const active = await client.query<{ id: string }>(
        `SELECT id FROM game_rounds
         WHERE game_id = $1 AND status = 'betting'
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [gameId],
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
      const mirrored =
        merchantCoins != null
          ? merchantCoins
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

/** Process pending merchant win credits (idempotent). */
export async function settlePendingMerchantCredits(limit = 40): Promise<{
  processed: number;
  failed: number;
}> {
  const client = await getPool().connect();
  let processed = 0;
  let failed = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{
      bet_id: string;
      payout_amount: string | number;
      player_id: string;
      tenant_id: string;
      external_id: string | null;
      sstoken: string | null;
    }>(
      `SELECT
         b.id AS bet_id,
         b.payout_amount,
         b.player_id,
         b.tenant_id,
         p.external_id,
         p.sstoken
       FROM game_bets b
       JOIN players p ON p.id = b.player_id
       WHERE b.merchant_credit_status = 'pending'
         AND b.is_win = true
         AND b.payout_amount > 0
       ORDER BY b.created_at ASC
       LIMIT $1
       FOR UPDATE OF b SKIP LOCKED`,
      [limit],
    );
    await client.query('COMMIT');

    for (const row of rows) {
      const tenant = await loadTenantBilling(row.tenant_id);
      if (!tenant || tenant.wallet_mode !== 'merchant_callback') {
        await query(
          `UPDATE game_bets SET merchant_credit_status = 'none' WHERE id = $1`,
          [row.bet_id],
        );
        continue;
      }
      const ext = row.external_id?.trim();
      if (!ext) {
        await query(
          `UPDATE game_bets SET merchant_credit_status = 'failed' WHERE id = $1`,
          [row.bet_id],
        );
        failed += 1;
        continue;
      }

      const payout = Math.floor(Number(row.payout_amount));
      const credit = await merchantChangeBalance(tenant, {
        externalId: ext,
        amount: payout,
        requestId: `payout:${row.bet_id}`,
        reason: 'win_payout',
        sstoken: row.sstoken,
      });

      if (!credit.ok) {
        await query(
          `UPDATE game_bets SET merchant_credit_status = 'failed' WHERE id = $1`,
          [row.bet_id],
        );
        failed += 1;
        continue;
      }

      if (credit.coins != null) {
        await query(`UPDATE players SET coins = $1 WHERE id = $2`, [
          credit.coins,
          row.player_id,
        ]);
      }

      await query(
        `UPDATE game_bets SET merchant_credit_status = 'done' WHERE id = $1`,
        [row.bet_id],
      );
      processed += 1;
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }

  return { processed, failed };
}
