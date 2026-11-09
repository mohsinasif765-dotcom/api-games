import { ApiErrorCode } from '@/lib/server/error-codes';
import { fetchRoundRanking } from '@/lib/server/round-rank';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;

    await ctx.params;
    const url = new URL(req.url);
    const roundId = url.searchParams.get('roundId')?.trim();
    if (!roundId) {
      return jsonError('roundId required', 400, {
        code: ApiErrorCode.ROUND_ID_REQUIRED,
      });
    }
    const limit = Number(url.searchParams.get('limit') || 3);

    const rows = await fetchRoundRanking({
      auth: authResult.auth,
      roundId,
      limit,
    });

    return jsonOk({ rows });
  } catch (e) {
    console.error('[api/v1/games/round-rank]', e);
    return jsonError('Failed to load round ranking', 500);
  }
}
