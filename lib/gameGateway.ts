import { io, Socket } from 'socket.io-client';
import { getStoredApiKey, getTenantFromUrl } from './game-api-client';

export type GameLiveSnapshot = {
  slug: string;
  seq?: number;
  round_id?: string | null;
  status?: string | null;
  winner_result?: string | null;
  winner_user_id?: string | null;
  betting_ends_at?: string | null;
  spinning_ends_at?: string | null;
  round_ends_at?: string | null;
  phase_ends_at?: string | null;
  server_now?: string;
  pot?: number;
  boot_amount?: number;
  kind?: string;
  empty?: boolean;
  [key: string]: unknown;
};

/**
 * Realtime endpoint = the game API gateway itself (Socket.IO on the same
 * origin as NEXT_PUBLIC_GAME_API_BASE). Override with
 * NEXT_PUBLIC_REALTIME_GATEWAY_URL only if realtime is hosted elsewhere.
 */
const DEFAULT_GAME_API_BASE = 'https://games.app.zuvodev.com/api/v1';

let sharedSocket: Socket | null = null;
let sharedIdentity: string | null = null;

function gatewayUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_REALTIME_GATEWAY_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const apiBase =
    process.env.NEXT_PUBLIC_GAME_API_BASE?.trim() || DEFAULT_GAME_API_BASE;
  try {
    // Absolute base → its origin; relative (/api/v1, local Next) → this page.
    const origin =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    return new URL(apiBase, origin).origin;
  } catch {
    return new URL(DEFAULT_GAME_API_BASE).origin;
  }
}

export function getAuthTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token')?.trim();
  return token || null;
}

/**
 * Shared Socket.IO connection to the game gateway (round phase push).
 *
 * Auth is the player API key (same as the REST API). WebSocket-only so it
 * works behind several gateway instances without sticky sessions; if it
 * can't connect, controllers keep their HTTP round polling.
 */
export function getGameSocket(token?: string | null): Socket {
  const apiKey = getStoredApiKey();
  const tenant = getTenantFromUrl();
  const legacyToken = token || getAuthTokenFromUrl();
  const identity = [apiKey ?? '', tenant ?? '', legacyToken ?? ''].join('|');

  if (sharedSocket && sharedIdentity === identity) return sharedSocket;
  if (sharedSocket) {
    try {
      sharedSocket.removeAllListeners();
      sharedSocket.disconnect();
    } catch {}
    sharedSocket = null;
  }

  const auth: Record<string, string> = {};
  if (apiKey) auth.apiKey = apiKey;
  if (tenant) auth.tenant = tenant;
  if (legacyToken) auth.token = legacyToken;

  sharedIdentity = identity;
  sharedSocket = io(gatewayUrl(), {
    transports: ['websocket'],
    // The gateway authenticates sockets by API key only; without one, don't
    // hammer it with doomed reconnects — controllers fall back to HTTP polling.
    autoConnect: !!apiKey,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 8000,
    auth,
  });
  return sharedSocket;
}

/**
 * One RTT-timed clock sample over the socket (feed into ClockSync.sample).
 * Resolves null on timeout / disconnect.
 */
export async function socketClockSample(
  socket: Socket,
  timeoutMs = 3000,
): Promise<{ sentAt: number; receivedAt: number; serverNow: string } | null> {
  if (!socket.connected) return null;
  const sentAt = Date.now();
  try {
    const res = (await socket
      .timeout(timeoutMs)
      .emitWithAck('clock:ping', {})) as { server_now?: string };
    if (!res?.server_now) return null;
    return { sentAt, receivedAt: Date.now(), serverNow: res.server_now };
  } catch {
    return null;
  }
}

export function snapshotToRound(snap: GameLiveSnapshot) {
  if (!snap || snap.empty || !snap.round_id) return null;
  return {
    id: snap.round_id,
    status: snap.status,
    winner_result: snap.winner_result ?? null,
    winner_user_id: snap.winner_user_id ?? null,
    betting_ends_at: snap.betting_ends_at ?? null,
    spinning_ends_at: snap.spinning_ends_at ?? null,
    round_ends_at: snap.round_ends_at ?? null,
    pot: snap.pot,
    boot_amount: snap.boot_amount,
  };
}

export function msUntilPhaseEnd(
  snap: GameLiveSnapshot | null | undefined,
  fallbackEndsAt?: string | null,
  skewMs = 0,
): number {
  const endsAt = snap?.phase_ends_at || fallbackEndsAt;
  if (!endsAt) return 0;
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(endMs)) return 0;
  // Use fixed skew (deviceNow - serverNow at sync time), not recomputed each tick.
  // Recomputing skew every tick freezes countdown on snapshot.server_now.
  const nowAligned = Date.now() - skewMs;
  return Math.max(0, endMs - nowAligned);
}

/** Compute clock skew once when a snapshot arrives. */
export function clockSkewMs(snap: GameLiveSnapshot | null | undefined): number {
  if (!snap?.server_now) return 0;
  const serverMs = new Date(snap.server_now).getTime();
  if (!Number.isFinite(serverMs)) return 0;
  return Date.now() - serverMs;
}

export function joinGameRoom(
  socket: Socket,
  slug: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; seq?: number; error?: string }> {
  return new Promise((resolve) => {
    socket
      .timeout(timeoutMs)
      .emit('game:join', { slug }, (err: Error | null, res?: { ok?: boolean; error?: unknown; seq?: number }) => {
        if (err) {
          resolve({ ok: false, error: 'join timeout' });
          return;
        }
        if (res?.ok === false || res?.error) {
          resolve({ ok: false, error: String(res?.error || 'join failed') });
          return;
        }
        resolve({ ok: true, seq: res?.seq });
      });
  });
}

export function leaveGameRoom(socket: Socket, slug: string) {
  try {
    socket.emit('game:leave', { slug });
  } catch {}
}
