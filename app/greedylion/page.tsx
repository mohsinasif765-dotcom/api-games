'use client';

import { useEffect, useRef, useState } from 'react';
import type { GreedyKingController } from '@/lib/greedy-king-phaser/GreedyKingController';
import { GreedyHud } from './GreedyHud';
import styles from './greedy-phaser.module.css';

/** Hard cap on the splash: even on a dead network the player gets the UI. */
const SPLASH_FAILSAFE_MS = 10_000;
/** Short beat after 100% so the bar visibly completes. */
const SPLASH_EXIT_DELAY_MS = 300;

/**
 * Hybrid shell: Phaser canvas (wheel visuals) + HTML overlay (all text / chrome).
 * Ported from SK Live greedy-phaser.
 *
 * Boot runs in parallel: Phaser asset preload and the API session (/boot)
 * start at the same time, and the splash hides when both are done (or after
 * SPLASH_FAILSAFE_MS, whichever comes first).
 */
export default function GreedyKingPhaserPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<GreedyKingController | null>(
    null,
  );
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: GreedyKingController | null = null;
    let offProgress: (() => void) | null = null;
    let assetsDone = false;
    let sessionDone = false;
    let splashClosed = false;
    let exitTimer: number | null = null;

    const closeSplash = () => {
      if (destroyed || splashClosed) return;
      splashClosed = true;
      setLoadProgress(100);
      setSplash(false);
      void import('@/lib/flutter-bridge').then(({ notifyReady }) =>
        notifyReady({ game: 'greedylion' }),
      );
    };

    const maybeCloseSplash = () => {
      if (!assetsDone || !sessionDone || exitTimer != null) return;
      exitTimer = window.setTimeout(closeSplash, SPLASH_EXIT_DELAY_MS);
    };

    // Armed first: nothing below (network, chunk load, Phaser) can leave the
    // player staring at a spinner.
    const failsafe = window.setTimeout(closeSplash, SPLASH_FAILSAFE_MS);

    const boot = async () => {
      const [{ createGreedyKingGame }, { GreedyKingController }] =
        await Promise.all([
          import('@/lib/greedy-king-phaser/createGame'),
          import('@/lib/greedy-king-phaser/GreedyKingController'),
        ]);
      if (destroyed) return;

      const ctrl = new GreedyKingController();
      instance = ctrl;
      offProgress = ctrl.on('loadProgress', (pct) => {
        // Assets are ~90% of the bar; the last 10% is the session.
        setLoadProgress((prev) =>
          Math.max(prev, Math.round(pct * (sessionDone ? 1 : 0.9))),
        );
        if (pct >= 100) {
          assetsDone = true;
          maybeCloseSplash();
        }
      });
      setController(ctrl);

      // Session (auth + balance + round) — does not block asset loading.
      void ctrl
        .start()
        .catch((e) => {
          console.error('[greedylion] session boot failed', e);
          ctrl.toast('Connection problem — retrying…');
        })
        .finally(() => {
          sessionDone = true;
          if (assetsDone) setLoadProgress(100);
          maybeCloseSplash();
        });

      // Wait for HUD wheel host to mount, then start Phaser preload.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (destroyed || !hostRef.current) return;

      game = createGreedyKingGame({
        parent: hostRef.current,
        controller: ctrl,
      });
    };

    void boot().catch((e) => {
      console.error('[greedylion] boot failed', e);
      closeSplash();
    });

    return () => {
      destroyed = true;
      window.clearTimeout(failsafe);
      if (exitTimer != null) window.clearTimeout(exitTimer);
      offProgress?.();
      game?.destroy(true);
      game = null;
      instance?.destroy();
      instance = null;
    };
  }, []);

  return (
    <div className={styles.root}>
      <GreedyHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
