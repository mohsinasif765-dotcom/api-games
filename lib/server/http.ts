import { NextResponse } from 'next/server';
import {
  extractApiKey,
  extractTenantSlug,
  resolveApiKey,
  type AuthContext,
} from './api-keys';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function requirePlayerAuth(req: Request): Promise<
  | { ok: true; auth: AuthContext }
  | { ok: false; response: NextResponse }
> {
  const rawKey = extractApiKey(req);
  const tenantSlug = extractTenantSlug(req);
  const auth = await resolveApiKey(rawKey, tenantSlug);
  if (!auth) {
    return { ok: false, response: jsonError('Invalid or missing API key', 401) };
  }
  return { ok: true, auth };
}

export function requireAdmin(req: Request): NextResponse | null {
  const secret = process.env.GATEWAY_ADMIN_SECRET?.trim();
  if (!secret) {
    return jsonError('GATEWAY_ADMIN_SECRET is not configured', 500);
  }
  const provided =
    req.headers.get('x-admin-secret')?.trim() ||
    (req.headers.get('authorization')?.toLowerCase().startsWith('bearer ')
      ? req.headers.get('authorization')!.slice(7).trim()
      : null);
  if (provided !== secret) {
    return jsonError('Unauthorized admin', 401);
  }
  return null;
}
