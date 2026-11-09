import { fetchTodayRevenueRank } from '@/lib/server/revenue-rank';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;

    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 20);

    const rows = await fetchTodayRevenueRank({
      auth: authResult.auth,
      slug,
      limit,
    });

    return jsonOk({ rows });
  } catch (e) {
    console.error('[api/v1/games/revenue-rank]', e);
    return jsonError('Failed to load revenue rank', 500);
  }
}
