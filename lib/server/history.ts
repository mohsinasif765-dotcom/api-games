import { query } from './db';
import type { AuthContext } from './api-keys';

export type HistoryBetDetail = {
  option: string;
  amount: number;
};

export type HistoryRow = {
  roundId: string;
  roundNumber: number | null;
  playedAt: string;
  bets: HistoryBetDetail[];
  winnerId: string | null;
  resultAmount: number;
};

type BetJoinRow = {
  bet_option: string;
  amount: string | number;
  payout_amount: string | number | null;
  is_win: boolean | null;
  created_at: string;
  round_id: string;
  round_number: number | null;
  winner_result: string | null;
  round_created_at: string;
};

export async function fetchPlayerGameHistory(params: {
  auth: AuthContext;
  slug: string;
  limit?: number;
}): Promise<HistoryRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);

  const { rows } = await query<BetJoinRow>(
    `SELECT
       b.bet_option,
       b.amount,
       COALESCE(b.payout_amount, 0) AS payout_amount,
       b.is_win,
       b.created_at,
       r.id AS round_id,
       r.round_number,
       r.winner_result,
       COALESCE(r.round_ends_at, r.created_at) AS round_created_at
     FROM game_bets b
     JOIN game_rounds r ON r.id = b.round_id
     JOIN game_configs g ON g.id = r.game_id
     WHERE b.player_id = $1
       AND g.slug = $2
       AND (g.tenant_id = $3 OR g.tenant_id IS NULL)
       AND r.status = 'finished'
     ORDER BY COALESCE(r.round_ends_at, r.created_at) DESC, b.created_at ASC
     LIMIT $4`,
    [params.auth.player.id, params.slug, params.auth.tenant.id, limit * 8],
  );

  const byRound = new Map<string, HistoryRow>();
  for (const row of rows) {
    const roundId = row.round_id;
    let entry = byRound.get(roundId);
    if (!entry) {
      entry = {
        roundId,
        roundNumber: row.round_number,
        playedAt: row.round_created_at,
        bets: [],
        winnerId: row.winner_result,
        resultAmount: 0,
      };
      byRound.set(roundId, entry);
    }
    entry.bets.push({
      option: row.bet_option,
      amount: Number(row.amount) || 0,
    });
    entry.resultAmount += Number(row.payout_amount) || 0;
    if (row.winner_result) entry.winnerId = row.winner_result;
  }

  return Array.from(byRound.values()).slice(0, limit);
}
