'use client';

import { useEffect } from 'react';
import { callNative } from '@/lib/flutter-bridge';
import { DEFAULT_WARMUP_GAMES } from '@/lib/warmup/manifest';
import { runWarmup, type WarmupResult } from '@/lib/warmup/runWarmup';

declare global {
  interface Window {
    /** Final result, for hosts that poll via evaluateJavascript. */
    __gameWarmup?: WarmupResult;
  }
}

/**
 * Headless warm-up: /warmup?games=greedylion[,…][&force=1]
 * Reports to the host via callHandler('warmupDone', result),
 * window.__gameWarmup and document.title = 'warmup:done'.
 */
export function WarmupRunner() {
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const games = (params.get('games') || DEFAULT_WARMUP_GAMES.join(','))
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    void runWarmup(games, { force: params.get('force') === '1' })
      .catch(
        (e): WarmupResult => ({
          ok: false,
          skipped: `error: ${(e as Error)?.message ?? e}`,
          games,
          total: 0,
          loaded: 0,
          failed: 0,
          fromCache: 0,
          bytes: 0,
          ms: 0,
        }),
      )
      .then((result) => {
        if (cancelled) return;
        window.__gameWarmup = result;
        document.title = 'warmup:done';
        callNative('warmupDone', result);
        console.info('[warmup]', result);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
