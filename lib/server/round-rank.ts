import { query } from './db';
import type { AuthContext } from './api-keys';

export type RoundRankRow = {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string | null;
  amount: number;
};

export async function fetchRoundRanking(params: {
  auth: AuthContext;
  roundId: string;
  limit?: number;
}): Promise<RoundRankRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 3, 1), 10);

  const { rows } = await query<{
    player_id: string;
    username: string | null;
    avatar_url: string | null;
    amount: string | number;
  }>(
    `SELECT
       p.id AS player_id,
       p.username,
       p.avatar_url,
       COALESCE(SUM(
         CASE
           WHEN COALESCE(b.payout_amount, 0) > 0 THEN b.payout_amount
           ELSE 0
         END
       ), 0) AS amount
     FROM game_bets b
     JOIN players p ON p.id = b.player_id
     WHERE b.round_id = $1
       AND (b.tenant_id = $2 OR b.tenant_id IS NULL)
     GROUP BY p.id, p.username, p.avatar_url
     HAVING COALESCE(SUM(
       CASE
         WHEN COALESCE(b.payout_amount, 0) > 0 THEN b.payout_amount
         ELSE 0
       END
     ), 0) > 0
     ORDER BY amount DESC, p.username ASC NULLS LAST
     LIMIT $3`,
    [params.roundId, params.auth.tenant.id, limit],
  );

  if (rows.length > 0) {
    return rows.map((row, i) => ({
      rank: i + 1,
      playerId: row.player_id,
      username: row.username?.trim() || 'Player',
      avatarUrl: row.avatar_url,
      amount: Number(row.amount) || 0,
    }));
  }

  // Fallback: top bettors on the winning option
  const fallback = await query<{
    player_id: string;
    username: string | null;
    avatar_url: string | null;
    amount: string | number;
  }>(
    `SELECT
       p.id AS player_id,
       p.username,
       p.avatar_url,
       COALESCE(SUM(b.amount), 0) AS amount
     FROM game_bets b
     JOIN players p ON p.id = b.player_id
     JOIN game_rounds r ON r.id = b.round_id
     WHERE b.round_id = $1
       AND (b.tenant_id = $2 OR b.tenant_id IS NULL)
       AND b.bet_option = r.winner_result
     GROUP BY p.id, p.username, p.avatar_url
     ORDER BY amount DESC, p.username ASC NULLS LAST
     LIMIT $3`,
    [params.roundId, params.auth.tenant.id, limit],
  );

  return fallback.rows.map((row, i) => ({
    rank: i + 1,
    playerId: row.player_id,
    username: row.username?.trim() || 'Player',
    avatarUrl: row.avatar_url,
    amount: Number(row.amount) || 0,
  }));
}
