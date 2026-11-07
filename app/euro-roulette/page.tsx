'use client';

import { useEffect, useRef, useState } from 'react';
import { Fredoka } from 'next/font/google';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { EuroRouletteController } from '@/lib/euro-roulette-phaser/EuroRouletteController';
import { EuroRouletteHud } from './EuroRouletteHud';
import styles from './euro-roulette.module.css';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['600', '700'],
});

export default function EuroRoulettePage() {
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

  return (
    <div className={`${styles.root} ${fredoka.className}`}>
      <EuroRouletteHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
