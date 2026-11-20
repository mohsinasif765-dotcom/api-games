import { NextResponse } from 'next/server';
import type { AuthContext } from './api-keys';
import { authenticateAdmin, authenticatePlayer } from './auth';
import { okResult, errResult, type ApiResult } from './respond';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function apiResultToNext(result: ApiResult) {
  return NextResponse.json(result.body, { status: result.status });
}

export async function requirePlayerAuth(req: Request): Promise<
  | { ok: true; auth: AuthContext }
  | { ok: false; response: NextResponse }
> {
  const result = await authenticatePlayer(req);
  if (!result.ok) {
    return { ok: false, response: apiResultToNext(result.result) };
  }
  return { ok: true, auth: result.auth };
}

export function requireAdmin(req: Request): NextResponse | null {
  const result = authenticateAdmin(req);
  if (!result.ok) return apiResultToNext(result.result);
  return null;
}

export { authenticateAdmin, authenticatePlayer, okResult, errResult };
export type { ApiResult };
