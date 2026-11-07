import { query } from './db';
import type { AuthContext } from './api-keys';

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
    throw Object.assign(new Error('Invalid bet amount'), { status: 400 });
  }
  if (!input.option?.trim()) {
    throw Object.assign(new Error('bet_option required'), { status: 400 });
  }

  const client = await (await import('./db')).getPool().connect();
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
      throw Object.assign(new Error('Game not found'), { status: 404 });
    }

    let roundId = input.roundId?.trim() || null;
    if (roundId) {
      const roundCheck = await client.query(
        `SELECT id, status FROM game_rounds WHERE id = $1 AND game_id = $2 FOR UPDATE`,
        [roundId, gameId],
      );
      const round = roundCheck.rows[0];
      if (!round) {
        throw Object.assign(new Error('Round not found'), { status: 404 });
      }
      if (round.status !== 'betting') {
        throw Object.assign(new Error('Betting closed'), { status: 409 });
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
    const coins = Number(playerRes.rows[0]?.coins ?? 0);
    if (coins < amount) {
      throw Object.assign(new Error('Insufficient balance'), { status: 402 });
    }

    await client.query(`UPDATE players SET coins = coins - $1 WHERE id = $2`, [
      amount,
      input.auth.player.id,
    ]);

    const betRes = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO game_bets (tenant_id, round_id, player_id, bet_option, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [
        input.auth.tenant.id,
        roundId,
        input.auth.player.id,
        input.option.trim(),
        amount,
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
    throw Object.assign(new Error('Invalid amount'), { status: 400 });
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
      throw Object.assign(new Error('Insufficient balance'), { status: 402 });
    }
    return Number(rows[0].coins);
  }

  const { rows } = await query<{ coins: string }>(
    `UPDATE players SET coins = coins + $1 WHERE id = $2 RETURNING coins`,
    [amount, playerId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Player not found'), { status: 404 });
  }
  return Number(rows[0].coins);
}
