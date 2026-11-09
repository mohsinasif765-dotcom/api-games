export type GameApiError = {
  ok: false;
  error: string;
  status: number;
};

export type MeResponse = {
  player: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    external_id: string | null;
    coins: number;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
    wallet_mode?: 'local' | 'merchant_callback';
  };
  scopes: string[];
};

function apiBase() {
  return (process.env.NEXT_PUBLIC_GAME_API_BASE || '/api/v1').replace(/\/$/, '');
}

export function getApiKeyFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('apiKey')?.trim() || null;
}

export function getSsTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    new URLSearchParams(window.location.search).get('sstoken')?.trim() || null
  );
}

export function storeSsToken(sstoken: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('game_sstoken', sstoken);
}

export function getStoredSsToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    getSsTokenFromUrl() ||
    window.sessionStorage.getItem('game_sstoken') ||
    null
  );
}

export function getTenantFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('tenant')?.trim() || null;
}

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    getApiKeyFromUrl() ||
    window.sessionStorage.getItem('game_api_key') ||
    window.localStorage.getItem('game_api_key')
  );
}

export function storeApiKey(apiKey: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('game_api_key', apiKey);
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  apiKey?: string | null;
  tenant?: string | null;
};

export async function gameApiFetch<T>(
  path: string,
  opts: RequestOpts = {},
): Promise<{ ok: true; data: T } | GameApiError> {
  const apiKey = opts.apiKey ?? getStoredApiKey();
  const tenant = opts.tenant ?? getTenantFromUrl();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (tenant) headers['X-Tenant-Id'] = tenant;

  const res = await fetch(`${apiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  let json: { ok?: boolean; data?: T; error?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      error: json?.error || `Request failed (${res.status})`,
      status: res.status,
    };
  }

  return { ok: true, data: json.data as T };
}

export async function fetchMe(apiKey?: string | null) {
  return gameApiFetch<MeResponse>('/me', { apiKey });
}

export async function fetchGameConfig(slug: string) {
  return gameApiFetch<{
    id: string;
    slug: string;
    name: string | null;
    status: string;
    meta: unknown;
  }>(`/games/${encodeURIComponent(slug)}/config`);
}

export async function fetchGameRound(slug: string) {
  return gameApiFetch<{
    game_id: string;
    slug: string;
    round: Record<string, unknown> | null;
    server_now: string;
  }>(`/games/${encodeURIComponent(slug)}/round`);
}

export async function placeGameBet(params: {
  slug: string;
  option: string;
  amount: number;
  roundId?: string;
}) {
  return gameApiFetch<{
    bet_id: string;
    round_id: string;
    option: string;
    amount: number;
    balance: number;
    created_at: string;
  }>(`/games/${encodeURIComponent(params.slug)}/bets`, {
    method: 'POST',
    body: {
      option: params.option,
      amount: params.amount,
      round_id: params.roundId,
    },
  });
}

export type GameHistoryRow = {
  roundId: string;
  roundNumber: number | null;
  playedAt: string;
  bets: Array<{ option: string; amount: number }>;
  winnerId: string | null;
  resultAmount: number;
};

export async function fetchGameHistory(slug: string, limit = 40) {
  return gameApiFetch<{ rows: GameHistoryRow[] }>(
    `/games/${encodeURIComponent(slug)}/history?limit=${limit}`,
  );
}

export type RevenueRankRow = {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string | null;
  revenue: number;
};

export async function fetchRevenueRank(slug: string, limit = 20) {
  return gameApiFetch<{ rows: RevenueRankRow[] }>(
    `/games/${encodeURIComponent(slug)}/revenue-rank?limit=${limit}`,
  );
}

export type RoundRankRow = {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string | null;
  amount: number;
};

export async function fetchRoundRank(slug: string, roundId: string, limit = 3) {
  return gameApiFetch<{ rows: RoundRankRow[] }>(
    `/games/${encodeURIComponent(slug)}/round-rank?roundId=${encodeURIComponent(roundId)}&limit=${limit}`,
  );
}
