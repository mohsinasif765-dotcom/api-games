import { placeBet } from '@/lib/server/bets';
import { ApiErrorCode } from '@/lib/server/error-codes';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;

    const { slug } = await ctx.params;
    const body = (await req.json()) as {
      option?: string;
      amount?: number;
      round_id?: string;
      p_option?: string;
      p_amount?: number;
      p_round_id?: string;
    };

    const result = await placeBet({
      auth: authResult.auth,
      slug,
      option: body.option ?? body.p_option ?? '',
      amount: body.amount ?? body.p_amount ?? 0,
      roundId: body.round_id ?? body.p_round_id,
    });

    return jsonOk(result, { status: 201 });
  } catch (e) {
    const err = e as Error & { status?: number; code?: string };
    console.error('[api/v1/games/bets]', err);
    return jsonError(err.message || 'Bet failed', err.status || 500, {
      code: err.code || ApiErrorCode.BET_FAILED,
    });
  }
}
