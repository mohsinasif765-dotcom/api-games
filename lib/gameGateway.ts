import { io, Socket } from 'socket.io-client';

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

const DEFAULT_GATEWAY =
  process.env.NEXT_PUBLIC_REALTIME_GATEWAY_URL ||
  'https://realtime.rave-star.com';

let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;

function gatewayUrl() {
  return (
    process.env.NEXT_PUBLIC_REALTIME_GATEWAY_URL ||
    DEFAULT_GATEWAY
  ).replace(/\/$/, '');
}

export function getAuthTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token')?.trim();
  return token || null;
}

/**
 * Shared Socket.IO connection to the realtime gateway (game clock fan-out).
 */
export function getGameSocket(token?: string | null): Socket {
  const authToken = token || getAuthTokenFromUrl() || '';
  if (sharedSocket && sharedToken === authToken && sharedSocket.connected) {
    return sharedSocket;
  }
  if (sharedSocket) {
    try {
      sharedSocket.removeAllListeners();
      sharedSocket.disconnect();
    } catch (_) {}
    sharedSocket = null;
  }
  sharedToken = authToken;
  sharedSocket = io(gatewayUrl(), {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 1000,
    auth: authToken ? { token: authToken } : {},
    query: authToken ? { token: authToken } : {},
  });
  return sharedSocket;
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
): Promise<{ ok: boolean; seq?: number; error?: string }> {
  return new Promise((resolve) => {
    socket.emit('game:join', { slug }, (res: any) => {
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
  } catch (_) {}
}
