'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { FootballController } from '@/lib/football-phaser/FootballController';
import { FootballHud } from './FootballHud';
import styles from './football-phaser.module.css';

/**
 * Hybrid shell: Phaser canvas (wheel) + HTML overlay (bets / chrome).
 * Ported from SK Live football-phaser.
 */
export default function FootballPhaserPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<FootballController | null>(
    null,
  );
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: FootballController | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createFootballGame }, { FootballController }] =
        await Promise.all([
          import('@/lib/football-phaser/createGame'),
          import('@/lib/football-phaser/FootballController'),
        ]);

      if (destroyed) return;

      instance = new FootballController();
      offProgress = instance.on('loadProgress', (pct) => {
        setLoadProgress(pct);
        if (pct >= 100) {
          window.setTimeout(() => {
            if (!destroyed) {
              setSplash(false);
              void import('@/lib/flutter-bridge').then(({ notifyReady }) =>
                notifyReady({ game: 'football' }),
              );
            }
          }, 450);
        }
      });
      setController(instance);
      await instance.start();

      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (destroyed || !hostRef.current || !instance) return;

      game = createFootballGame({
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

  return (
    <div className={styles.root}>
      <FootballHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
