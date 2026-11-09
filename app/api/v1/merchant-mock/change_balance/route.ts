import { createHash, createHmac } from 'node:crypto';
import { query } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Body = {
  uid?: string;
  user_id?: string;
  amount?: number;
  request_id?: string;
  reason?: string;
  sstoken?: string;
};

function verifySign(
  appId: string,
  appKey: string,
  timestamp: string,
  bodyJson: string,
  sign: string | null,
  signMd5: string | null,
) {
  const hmac = createHmac('sha256', appKey)
    .update(`${appId}${timestamp}${bodyJson}`)
    .digest('hex');
  const md5 = createHash('md5')
    .update(`${appKey}${timestamp}${bodyJson}`)
    .digest('hex');
  return (
    (!!sign && sign.toLowerCase() === hmac.toLowerCase()) ||
    (!!signMd5 && signMd5.toLowerCase() === md5.toLowerCase())
  );
}

/**
 * Local merchant wallet mock for wallet_mode=merchant_callback.
 * Debit/credit players.coins by external_id (uid).
 */
export async function POST(req: Request) {
  try {
    const appId = req.headers.get('x-app-id')?.trim() || '';
    const timestamp = req.headers.get('x-timestamp')?.trim() || '';
    const sign = req.headers.get('x-sign');
    const signMd5 = req.headers.get('x-sign-md5');
    const bodyJson = await req.text();
    const body = JSON.parse(bodyJson || '{}') as Body;

    const tenantRes = await query<{
      id: string;
      cb_app_key: string | null;
    }>(
      `SELECT id, cb_app_key FROM tenants
       WHERE cb_app_id = $1 AND status = 'active' LIMIT 1`,
      [appId],
    );
    const tenant = tenantRes.rows[0];
    if (!tenant?.cb_app_key) {
      return NextResponse.json(
        { ok: false, code: 401, error: 'unknown app_id' },
        { status: 401 },
      );
    }
    if (
      !verifySign(
        appId,
        tenant.cb_app_key,
        timestamp,
        bodyJson,
        sign,
        signMd5,
      )
    ) {
      return NextResponse.json(
        { ok: false, code: 401, error: 'invalid signature params' },
        { status: 401 },
      );
    }

    const uid = String(body.uid || body.user_id || '').trim();
    const amount = Math.floor(Number(body.amount ?? 0));
    if (!uid || !Number.isFinite(amount) || amount === 0) {
      return NextResponse.json(
        { ok: false, code: 400, error: 'uid/amount required' },
        { status: 400 },
      );
    }

    if (amount < 0) {
      const { rows } = await query<{ coins: string }>(
        `UPDATE players
         SET coins = coins + $1
         WHERE tenant_id = $2 AND external_id = $3 AND coins >= $4
         RETURNING coins`,
        [amount, tenant.id, uid, Math.abs(amount)],
      );
      if (!rows[0]) {
        return NextResponse.json(
          { ok: false, code: 402, error: 'Insufficient balance' },
          { status: 402 },
        );
      }
      return NextResponse.json({
        ok: true,
        code: 0,
        data: { coins: Number(rows[0].coins), balance: Number(rows[0].coins) },
      });
    }

    const { rows } = await query<{ coins: string }>(
      `UPDATE players
       SET coins = coins + $1
       WHERE tenant_id = $2 AND external_id = $3
       RETURNING coins`,
      [amount, tenant.id, uid],
    );
    if (!rows[0]) {
      return NextResponse.json(
        { ok: false, code: 404, error: 'user not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      code: 0,
      data: { coins: Number(rows[0].coins), balance: Number(rows[0].coins) },
    });
  } catch (e) {
    console.error('[merchant-mock/change_balance]', e);
    return NextResponse.json(
      { ok: false, code: 500, error: 'mock change_balance failed' },
      { status: 500 },
    );
  }
}
