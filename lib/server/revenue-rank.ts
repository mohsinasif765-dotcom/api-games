import { query } from './db';
import type { AuthContext } from './api-keys';

export type RevenueRankRow = {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string | null;
  revenue: number;
};

export async function fetchTodayRevenueRank(params: {
  auth: AuthContext;
  slug: string;
  limit?: number;
}): Promise<RevenueRankRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const { rows } = await query<{
    player_id: string;
    username: string | null;
    avatar_url: string | null;
    revenue: string | number;
  }>(
    `SELECT
       p.id AS player_id,
       p.username,
       p.avatar_url,
       COALESCE(SUM(CASE
         WHEN COALESCE(b.payout_amount, 0) > 0 THEN b.payout_amount
         ELSE 0
       END), 0) AS revenue
     FROM game_bets b
     JOIN players p ON p.id = b.player_id
     JOIN game_rounds r ON r.id = b.round_id
     JOIN game_configs g ON g.id = r.game_id
     WHERE g.slug = $1
       AND (g.tenant_id = $2 OR g.tenant_id IS NULL)
       AND b.created_at >= date_trunc('day', now())
       AND r.status = 'finished'
     GROUP BY p.id, p.username, p.avatar_url
     HAVING COALESCE(SUM(CASE
       WHEN COALESCE(b.payout_amount, 0) > 0 THEN b.payout_amount
       ELSE 0
     END), 0) > 0
     ORDER BY revenue DESC, p.username ASC NULLS LAST
     LIMIT $3`,
    [params.slug, params.auth.tenant.id, limit],
  );

  return rows.map((row, i) => ({
    rank: i + 1,
    playerId: row.player_id,
    username: row.username?.trim() || 'Player',
    avatarUrl: row.avatar_url,
    revenue: Number(row.revenue) || 0,
  }));
}
