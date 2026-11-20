/**
 * Framework-agnostic API response helpers (Next + Express gateway).
 */

export type ApiOkBody<T> = { ok: true; data: T };
export type ApiErrBody = {
  ok: false;
  error: string;
  code?: string;
  [key: string]: unknown;
};

export type ApiResult<T = unknown> = {
  status: number;
  body: ApiOkBody<T> | ApiErrBody;
};

export function okResult<T>(data: T, status = 200): ApiResult<T> {
  return { status, body: { ok: true, data } };
}

export function errResult(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): ApiResult<never> {
  return {
    status,
    body: { ok: false, error: message, ...extra },
  };
}
