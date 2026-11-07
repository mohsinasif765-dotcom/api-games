'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { GreedyBabyController } from '@/lib/greedy-baby-phaser/GreedyBabyController';
import { GreedyBabyHud } from './GreedyBabyHud';
import styles from './greedy-baby.module.css';

/**
 * Hybrid shell: Phaser canvas (wheel visuals) + HTML overlay (all text / chrome).
 * Ported from SK Live greedy-phaser.
 */
export default function GreedyBabyPhaserPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<GreedyBabyController | null>(
    null,
  );
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: GreedyBabyController | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createGreedyBabyGame }, { GreedyBabyController }] =
        await Promise.all([
          import('@/lib/greedy-baby-phaser/createGame'),
          import('@/lib/greedy-baby-phaser/GreedyBabyController'),
        ]);

      if (destroyed) return;

      instance = new GreedyBabyController();
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

      // Wait for HUD wheel host to mount
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (destroyed || !hostRef.current || !instance) return;

      game = createGreedyBabyGame({
        parent: hostRef.current,
        controller: instance,
      });
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
      <GreedyBabyHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
