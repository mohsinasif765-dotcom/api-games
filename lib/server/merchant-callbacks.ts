import { createHash, createHmac, randomUUID } from 'node:crypto';
import { query } from './db';

export type TenantCallbackConfig = {
  id: string;
  slug: string;
  status: string;
  usdt_balance: string | number;
  coin_to_usdt_rate: string | number;
  wallet_mode: 'local' | 'merchant_callback';
  cb_user_info_url: string | null;
  cb_change_balance_url: string | null;
  cb_get_sstoken_url: string | null;
  cb_update_sstoken_url: string | null;
  cb_app_id: string | null;
  cb_app_key: string | null;
  cb_timeout_ms: number;
};

export type MerchantUserInfo = {
  uid: string;
  nickname?: string | null;
  avatar?: string | null;
  coins: number;
};

export type ChangeBalanceResult = {
  ok: boolean;
  coins?: number;
  error?: string;
};

export async function loadTenantBilling(
  tenantId: string,
): Promise<TenantCallbackConfig | null> {
  const { rows } = await query<TenantCallbackConfig>(
    `SELECT
       id, slug, status, usdt_balance, coin_to_usdt_rate, wallet_mode,
       cb_user_info_url, cb_change_balance_url, cb_get_sstoken_url, cb_update_sstoken_url,
       cb_app_id, cb_app_key, cb_timeout_ms
     FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

/** Canonical FunPlay-style sign: HMAC-SHA256(app_key, app_id + timestamp + bodyJson) */
export function signMerchantPayload(
  appId: string,
  appKey: string,
  timestamp: string,
  bodyJson: string,
): string {
  return createHmac('sha256', appKey)
    .update(`${appId}${timestamp}${bodyJson}`)
    .digest('hex');
}

function md5FallbackSign(
  appKey: string,
  timestamp: string,
  bodyJson: string,
): string {
  return createHash('md5')
    .update(`${appKey}${timestamp}${bodyJson}`)
    .digest('hex');
}

async function postMerchant<T = Record<string, unknown>>(
  tenant: TenantCallbackConfig,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  if (!tenant.cb_app_id || !tenant.cb_app_key) {
    return { ok: false, error: 'Tenant callback credentials missing' };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyJson = JSON.stringify(payload);
  const sign = signMerchantPayload(
    tenant.cb_app_id,
    tenant.cb_app_key,
    timestamp,
    bodyJson,
  );
  const altSign = md5FallbackSign(tenant.cb_app_key, timestamp, bodyJson);
  const timeout = Math.max(1000, Number(tenant.cb_timeout_ms) || 8000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-id': tenant.cb_app_id,
        'x-timestamp': timestamp,
        'x-sign': sign,
        'x-sign-md5': altSign,
      },
      body: bodyJson,
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      ok?: boolean;
      code?: number | string;
      message?: string;
      error?: string;
      data?: T;
    };
    const success =
      res.ok &&
      (json.ok === true ||
        json.code === 0 ||
        json.code === '0' ||
        json.code === 200 ||
        (json as { status?: string }).status === 'ok');
    if (!success) {
      return {
        ok: false,
        status: res.status,
        error:
          json.message ||
          json.error ||
          `Merchant callback HTTP ${res.status}`,
        data: (json.data ?? json) as T,
      };
    }
    return { ok: true, data: (json.data ?? json) as T, status: res.status };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.name === 'AbortError' ? 'Merchant timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function merchantGetUserInfo(
  tenant: TenantCallbackConfig,
  externalId: string,
  sstoken?: string | null,
): Promise<{ ok: boolean; user?: MerchantUserInfo; error?: string }> {
  if (!tenant.cb_user_info_url) {
    return { ok: false, error: 'cb_user_info_url not configured' };
  }
  const res = await postMerchant<{
    uid?: string;
    user_id?: string;
    nickname?: string;
    username?: string;
    avatar?: string;
    avatar_url?: string;
    coins?: number | string;
    balance?: number | string;
  }>(tenant, tenant.cb_user_info_url, {
    uid: externalId,
    user_id: externalId,
    sstoken: sstoken || undefined,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  const d = res.data;
  const uid = String(d.uid || d.user_id || externalId);
  const coins = Math.max(0, Math.floor(Number(d.coins ?? d.balance ?? 0)));
  return {
    ok: true,
    user: {
      uid,
      nickname: d.nickname || d.username || null,
      avatar: d.avatar || d.avatar_url || null,
      coins,
    },
  };
}

export async function merchantChangeBalance(
  tenant: TenantCallbackConfig,
  params: {
    externalId: string;
    amount: number;
    requestId: string;
    reason: string;
    sstoken?: string | null;
  },
): Promise<ChangeBalanceResult> {
  if (!tenant.cb_change_balance_url) {
    return { ok: false, error: 'cb_change_balance_url not configured' };
  }
  const res = await postMerchant<{
    coins?: number | string;
    balance?: number | string;
  }>(tenant, tenant.cb_change_balance_url, {
    uid: params.externalId,
    user_id: params.externalId,
    amount: params.amount,
    request_id: params.requestId,
    reason: params.reason,
    sstoken: params.sstoken || undefined,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const coins = Math.floor(
    Number(res.data?.coins ?? res.data?.balance ?? NaN),
  );
  return {
    ok: true,
    coins: Number.isFinite(coins) ? coins : undefined,
  };
}

export async function merchantGetSsToken(
  tenant: TenantCallbackConfig,
  externalId: string,
): Promise<{ ok: boolean; sstoken?: string; expiresAt?: string; error?: string }> {
  if (!tenant.cb_get_sstoken_url) {
    return { ok: false, error: 'cb_get_sstoken_url not configured' };
  }
  const res = await postMerchant<{
    sstoken?: string;
    token?: string;
    expires_at?: string;
    expires_in?: number;
  }>(tenant, tenant.cb_get_sstoken_url, {
    uid: externalId,
    user_id: externalId,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  const sstoken = res.data.sstoken || res.data.token;
  if (!sstoken) return { ok: false, error: 'Merchant returned no sstoken' };
  let expiresAt = res.data.expires_at;
  if (!expiresAt && res.data.expires_in) {
    expiresAt = new Date(
      Date.now() + Number(res.data.expires_in) * 1000,
    ).toISOString();
  }
  return { ok: true, sstoken, expiresAt };
}

export async function merchantUpdateSsToken(
  tenant: TenantCallbackConfig,
  externalId: string,
  sstoken: string,
): Promise<{ ok: boolean; sstoken?: string; expiresAt?: string; error?: string }> {
  if (!tenant.cb_update_sstoken_url) {
    return { ok: false, error: 'cb_update_sstoken_url not configured' };
  }
  const res = await postMerchant<{
    sstoken?: string;
    token?: string;
    expires_at?: string;
    expires_in?: number;
  }>(tenant, tenant.cb_update_sstoken_url, {
    uid: externalId,
    user_id: externalId,
    sstoken,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  const next = res.data.sstoken || res.data.token || sstoken;
  let expiresAt = res.data.expires_at;
  if (!expiresAt && res.data.expires_in) {
    expiresAt = new Date(
      Date.now() + Number(res.data.expires_in) * 1000,
    ).toISOString();
  }
  return { ok: true, sstoken: next, expiresAt };
}

export function newRequestId(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}
