'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  GameLiveSnapshot,
  getAuthTokenFromUrl,
  getGameSocket,
  joinGameRoom,
  leaveGameRoom,
  snapshotToRound,
} from '@/lib/gameGateway';
import { fetchGameRound } from '@/lib/game-api-client';

type RoundLike = ReturnType<typeof snapshotToRound>;

type Options = {
  slug: string;
  enabled?: boolean;
  onRound?: (round: NonNullable<RoundLike>, snap: GameLiveSnapshot) => void;
  onBetting?: (round: NonNullable<RoundLike>, snap: GameLiveSnapshot) => void;
  onSpinning?: (round: NonNullable<RoundLike>, snap: GameLiveSnapshot) => void;
};

function phaseKey(snap: GameLiveSnapshot) {
  return [
    snap.round_id || '',
    snap.status || '',
    snap.phase_ends_at || snap.betting_ends_at || '',
    snap.winner_result || '',
    snap.winner_user_id || '',
  ].join('|');
}

/**
 * Gateway Socket.IO round sync. Countdown is exposed as refs for rAF
 * (GameCountdown) — no setState-per-tick.
 */
export function useGameRoundSocket({
  slug,
  enabled = true,
  onRound,
  onBetting,
  onSpinning,
}: Options) {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<GameLiveSnapshot | null>(null);
  const lastSeqRef = useRef(0);
  const lastStatusRef = useRef<string | null>(null);
  const lastRoundIdRef = useRef<string | null>(null);
  const lastPhaseKeyRef = useRef('');
  const skewMsRef = useRef(0);
  const endsAtMsRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onRound, onBetting, onSpinning });
  callbacksRef.current = { onRound, onBetting, onSpinning };

  const syncClock = useCallback(
    (snap: GameLiveSnapshot, updateSkew: boolean) => {
      const ends =
        snap.status === 'betting'
          ? snap.betting_ends_at || snap.phase_ends_at
          : snap.phase_ends_at || snap.spinning_ends_at || snap.betting_ends_at;
      endsAtMsRef.current = ends ? new Date(ends).getTime() : null;

      // Only realign skew on join / phase change — not every 4s heartbeat
      // (heartbeat re-skew was causing countdown hitch then catch-up).
      if (updateSkew && snap.server_now) {
        const serverMs = new Date(snap.server_now).getTime();
        if (Number.isFinite(serverMs)) {
          skewMsRef.current = Date.now() - serverMs;
        }
      }
    },
    [],
  );

  const applySnapshot = useCallback(
    (snap: GameLiveSnapshot, force = false) => {
      if (!snap || snap.empty) return;
      const seq = Number(snap.seq || 0);
      if (!force && seq > 0 && seq <= lastSeqRef.current) return;
      if (seq > 0) lastSeqRef.current = seq;

      const key = phaseKey(snap);
      const phaseChanged = key !== lastPhaseKeyRef.current;
      lastPhaseKeyRef.current = key;

      syncClock(snap, phaseChanged || force);

      // Only store snapshot in React when phase actually changes (not every 4s heartbeat).
      if (phaseChanged || force) {
        setSnapshot(snap);
      }

      const round = snapshotToRound(snap);
      if (!round) return;

      const prevStatus = lastStatusRef.current;
      const prevRoundId = lastRoundIdRef.current;
      const isHydrate = prevStatus === null && prevRoundId === null;
      const statusChanged =
        round.status !== prevStatus || round.id !== prevRoundId;
      lastStatusRef.current = round.status || null;
      lastRoundIdRef.current = round.id || null;

      if (phaseChanged) {
        callbacksRef.current.onRound?.(round, snap);
      }
      // Skip betting/spinning side-effects on first snapshot (mid-round join).
      if (statusChanged && !isHydrate) {
        if (round.status === 'betting') {
          callbacksRef.current.onBetting?.(round, snap);
        } else if (round.status === 'spinning') {
          callbacksRef.current.onSpinning?.(round, snap);
        }
      }
    },
    [syncClock],
  );

  useEffect(() => {
    if (!enabled || !slug) return;

    // API-key / Zuvo mode: ignore legacy Rave Star realtime gateway (wrong DB).
    const usingApiKey =
      typeof window !== 'undefined' &&
      !!(
        new URLSearchParams(window.location.search).get('apiKey') ||
        window.sessionStorage.getItem('game_api_key')
      );
    if (usingApiKey) {
      setConnected(false);
      return;
    }

    const token = getAuthTokenFromUrl();
    const socket = getGameSocket(token);

    const onConnect = async () => {
      setConnected(true);
      const res = await joinGameRoom(socket, slug);
      if (!res.ok) {
        console.warn('[gameSocket] join failed:', res.error);
      }
    };
    const onDisconnect = () => setConnected(false);
    const onSnapshot = (snap: GameLiveSnapshot) => applySnapshot(snap, true);
    const onEvent = (snap: GameLiveSnapshot) => applySnapshot(snap, false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:snapshot', onSnapshot);
    socket.on('game:event', onEvent);

    if (socket.connected) {
      void onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:snapshot', onSnapshot);
      socket.off('game:event', onEvent);
      leaveGameRoom(socket, slug);
    };
  }, [slug, enabled, applySnapshot]);

  // Zuvo / API-key mode: Rave Star socket may connect but won't see our DB rounds.
  // Always poll local gateway so betting → spinning → next round drives the UI.
  useEffect(() => {
    if (!enabled || !slug) return;
    let cancelled = false;

    const poll = async () => {
      const res = await fetchGameRound(slug);
      if (cancelled || !res.ok || !res.data.round) return;
      const r = res.data.round as Record<string, unknown>;
      const status = (r.status as string) || null;
      const bettingEnds = (r.betting_ends_at as string) || null;
      const spinningEnds = (r.spinning_ends_at as string) || null;
      const roundEnds = (r.round_ends_at as string) || null;
      const snap: GameLiveSnapshot = {
        slug,
        round_id: (r.id as string) || null,
        status,
        winner_result: (r.winner_result as string) || null,
        winner_user_id: (r.winner_user_id as string) || null,
        betting_ends_at: bettingEnds,
        spinning_ends_at: spinningEnds,
        round_ends_at: roundEnds,
        phase_ends_at:
          status === 'betting'
            ? bettingEnds || roundEnds
            : spinningEnds || roundEnds || bettingEnds,
        pot: Number(r.pot ?? 0),
        boot_amount: Number(r.boot_amount ?? 0),
        server_now: res.data.server_now,
        seq: 0,
      };
      applySnapshot(snap, false);
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slug, enabled, applySnapshot]);

  // Seed clock from initial DB round when socket not yet connected
  const seedClockFromRound = useCallback(
    (
      round: {
        betting_ends_at?: string | null;
        round_ends_at?: string | null;
        status?: string | null;
      } | null,
    ) => {
      if (!round || round.status !== 'betting') return;
      const ends = round.betting_ends_at || round.round_ends_at;
      if (!ends) return;
      endsAtMsRef.current = new Date(ends).getTime();
    },
    [],
  );

  return {
    connected,
    snapshot,
    /** Refs for GameCountdown rAF — do not drive React state from these. */
    clock: { endsAtMsRef, skewMsRef },
    clockActive: snapshot?.status === 'betting' || false,
    seedClockFromRound,
    round: snapshotToRound(snapshot || { slug, empty: true }),
  };
}
