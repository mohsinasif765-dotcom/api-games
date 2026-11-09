import { fetchPlayerGameHistory } from '@/lib/server/history';
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
    const limit = Number(url.searchParams.get('limit') || 40);

    const rows = await fetchPlayerGameHistory({
      auth: authResult.auth,
      slug,
      limit,
    });

    return jsonOk({ rows });
  } catch (e) {
    console.error('[api/v1/games/history]', e);
    return jsonError('Failed to load history', 500);
  }
}
