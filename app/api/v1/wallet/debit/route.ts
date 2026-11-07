import { adjustBalance } from '@/lib/server/bets';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;
    const body = (await req.json()) as { amount?: number };
    const amount = Math.floor(Number(body.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonError('amount must be a positive integer', 400);
    }
    const balance = await adjustBalance(authResult.auth.player.id, -amount);
    return jsonOk({ balance, debited: amount });
  } catch (e) {
    const err = e as Error & { status?: number };
    return jsonError(err.message || 'Debit failed', err.status || 500);
  }
}
