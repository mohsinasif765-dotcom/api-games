import {
  extractApiKey,
  extractTenantSlug,
  resolveApiKey,
  type AuthContext,
} from './api-keys';
import { ApiErrorCode } from './error-codes';
import { errResult, type ApiResult } from './respond';

/** Framework-agnostic player auth (Express gateway + Next). */
export async function authenticatePlayer(
  req: Request,
): Promise<
  | { ok: true; auth: AuthContext }
  | { ok: false; result: ApiResult<never> }
> {
  const rawKey = extractApiKey(req);
  const tenantSlug = extractTenantSlug(req);
  const auth = await resolveApiKey(rawKey, tenantSlug);
  if (!auth) {
    return {
      ok: false,
      result: errResult('Invalid or missing API key', 401, {
        code: ApiErrorCode.INVALID_API_KEY,
      }),
    };
  }
  return { ok: true, auth };
}

/** Framework-agnostic admin check. */
export function authenticateAdmin(
  req: Request,
): { ok: true } | { ok: false; result: ApiResult<never> } {
  const secret = process.env.GATEWAY_ADMIN_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      result: errResult('GATEWAY_ADMIN_SECRET is not configured', 500, {
        code: ApiErrorCode.ADMIN_SECRET_MISSING,
      }),
    };
  }
  const provided =
    req.headers.get('x-admin-secret')?.trim() ||
    (req.headers.get('authorization')?.toLowerCase().startsWith('bearer ')
      ? req.headers.get('authorization')!.slice(7).trim()
      : null);
  if (provided !== secret) {
    return {
      ok: false,
      result: errResult('Unauthorized admin', 401, {
        code: ApiErrorCode.UNAUTHORIZED_ADMIN,
      }),
    };
  }
  return { ok: true };
}
