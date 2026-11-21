'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Fredoka } from 'next/font/google';
import { GameSplash } from '@/components/GameSplash';
import { useGameViewport } from '@/components/useGameViewport';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { EuroRouletteController } from '@/lib/euro-roulette-phaser/EuroRouletteController';
import { EuroRouletteHud } from './EuroRouletteHud';
import styles from './euro-roulette.module.css';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const MIN_FRAME_WIDTH = 360;
const MIN_FRAME_HEIGHT = 630;

export default function EuroRoulettePage() {
  const { viewportRef, scale, width, height } = useGameViewport(
    MIN_FRAME_WIDTH,
    MIN_FRAME_HEIGHT,
    1,
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<EuroRouletteController | null>(
    null,
  );
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: EuroRouletteController | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createEuroRouletteGame }, { EuroRouletteController }] =
        await Promise.all([
          import('@/lib/euro-roulette-phaser/createGame'),
          import('@/lib/euro-roulette-phaser/EuroRouletteController'),
        ]);

      if (destroyed) return;

      instance = new EuroRouletteController();
      offProgress = instance.on('loadProgress', (pct) => {
        setLoadProgress(pct);
        if (pct >= 100) {
          window.setTimeout(() => {
            if (!destroyed) setSplash(false);
          }, 450);
        }
      });
      setController(instance);
      await instance.start();

      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (destroyed || !hostRef.current || !instance) return;

      game = createEuroRouletteGame({
        parent: hostRef.current,
        controller: instance,
      });

      // Failsafe: never leave splash stuck if progress events were missed
      window.setTimeout(() => {
        if (!destroyed) {
          setLoadProgress((p) => (p < 100 ? 100 : p));
          setSplash(false);
        }
      }, 8000);
    };

    void boot();

    return () => {
      destroyed = true;
      offProgress?.();
      game?.destroy(true);
      game = null;
      instance?.destroy();
      instance = null;
    };
  }, []);

  const loading = splash || !controller;

  return (
    <div
      data-loading={loading}
      className={`game-viewport ${styles.root} ${fredoka.className}`}
      style={{
        '--available-frame-w': `${width ? width / scale : MIN_FRAME_WIDTH}px`,
        '--frame-h': `${height ? height / scale : MIN_FRAME_HEIGHT}px`,
        '--game-scale': scale,
      } as CSSProperties}
    >
      {loading && (
        <GameSplash
          name="Euro Roulette"
          src="/euro-roulette/splash.webp"
          background="#0a1628"
          progress={loadProgress}
        />
      )}
      <div ref={viewportRef} className="game-viewport-content">
        <div className={styles.frame} style={{ transform: `scale(${scale})` }}>
          <EuroRouletteHud
            controller={controller}
            canvasHostRef={hostRef}
          />
        </div>
      </div>
    </div>
  );
}
