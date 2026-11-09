import { settlePendingMerchantCredits } from '@/lib/server/bets';
import { jsonError, jsonOk, requireAdmin } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * Drain pending merchant win credits.
 * Auth: x-admin-secret / GATEWAY_ADMIN_SECRET (same as /api/v1/keys).
 * Schedule externally every few seconds when using wallet_mode=merchant_callback.
 */
export async function POST(req: Request) {
  const adminErr = requireAdmin(req);
  if (adminErr) return adminErr;

  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 200);
    const result = await settlePendingMerchantCredits(limit);
    return jsonOk(result);
  } catch (e) {
    console.error('[api/v1/internal/settle-merchant]', e);
    return jsonError('Settle failed', 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
