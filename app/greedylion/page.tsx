'use client';

import { useEffect, useState } from 'react';
import { preconnect } from 'react-dom';
import { GreedySky } from '@/components/GreedySky';
import { GameSplash } from '@/components/GameSplash';
import { useGameViewport } from '@/components/useGameViewport';
import { GreedyKingController } from '@/lib/greedy-king-phaser/GreedyKingController';
import { CRITICAL_IMAGES } from '@/lib/greedy-king-phaser/config';
import { preloadImages } from '@/lib/preloadImages';
import { GreedyHud } from './GreedyHud';
import { SPLASH_PLACEHOLDER } from './splashPlaceholder';
import styles from './greedy-phaser.module.css';

/** Hard cap on the splash: even on a dead network the player gets the UI. */
const SPLASH_FAILSAFE_MS = 10_000;
/** Short beat after 100% so the bar visibly completes. */
const SPLASH_EXIT_DELAY_MS = 300;
const DESIGN_WIDTH = 390;
const MIN_STAGE_HEIGHT = 680;
const MAX_STAGE_WIDTH = 448;

const GAME_API_ORIGIN = (() => {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_GAME_API_BASE ||
        'https://games.app.zuvodev.com/api/v1',
    ).origin;
  } catch {
    return null;
  }
})();

/**
 * Greedy Lion shell: HTML HUD + DOM wheel effects (no Phaser/WebGL).
 *
 * Cold start runs in parallel: critical images preload and the API session
 * (/boot) start at the same time; the splash hides when both are done (or
 * after SPLASH_FAILSAFE_MS, whichever comes first).
 */
export default function GreedyKingPage() {
  // Open the TLS connection to the game API while the page is still loading.
  if (GAME_API_ORIGIN) preconnect(GAME_API_ORIGIN, { crossOrigin: 'anonymous' });

  const [controller, setController] = useState<GreedyKingController | null>(
    null,
  );
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const { viewportRef, width, height, scale } = useGameViewport(
    DESIGN_WIDTH,
    MIN_STAGE_HEIGHT,
    1,
  );
  const stageWidth = Math.min(MAX_STAGE_WIDTH, Math.max(DESIGN_WIDTH, width / scale));
  const stageHeight = Math.max(MIN_STAGE_HEIGHT, height / scale);

  useEffect(() => {
    let destroyed = false;
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

    // Armed first: nothing below (network, decode) can leave the player
    // staring at a spinner.
    const failsafe = window.setTimeout(closeSplash, SPLASH_FAILSAFE_MS);

    const ctrl = new GreedyKingController();
    // Hand the controller to React after this effect commits (HUD/WheelFx
    // subscribe in their own effects; `ready` is replayed via their state).
    queueMicrotask(() => {
      if (!destroyed) setController(ctrl);
    });

    // Session (auth + balance + round).
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

    // Art visible on the first frame after the splash.
    void preloadImages(CRITICAL_IMAGES, (pct) => {
      if (destroyed) return;
      // Images are ~90% of the bar; the last 10% is the session.
      setLoadProgress((prev) =>
        Math.max(prev, Math.round(pct * (sessionDone ? 1 : 0.9))),
      );
    }).then(() => {
      assetsDone = true;
      maybeCloseSplash();
    });

    return () => {
      destroyed = true;
      window.clearTimeout(failsafe);
      if (exitTimer != null) window.clearTimeout(exitTimer);
      ctrl.destroy();
    };
  }, []);

  const loading = splash || !controller;

  return (
    <div data-loading={loading} className={`game-viewport ${styles.viewportBackground}`}>
      {!loading && <GreedySky />}
      {loading && (
        <GameSplash
          name="Greedy Lion"
          src="/greedy-lion/splash.webp"
          background="#1a4f6e"
          progress={loadProgress}
          placeholder={SPLASH_PLACEHOLDER}
        />
      )}
      <div className="game-viewport-content" ref={viewportRef}>
        <div
          className={styles.root}
          style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})` }}
        >
          <GreedyHud
            controller={controller}
          />
        </div>
      </div>
    </div>
  );
}
