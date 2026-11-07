'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { GreedyKingController } from '@/lib/greedy-king-phaser/GreedyKingController';
import { GreedyHud } from './GreedyHud';
import styles from './greedy-phaser.module.css';

/**
 * Hybrid shell: Phaser canvas (wheel visuals) + HTML overlay (all text / chrome).
 * Ported from SK Live greedy-phaser.
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

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createGreedyKingGame }, { GreedyKingController }] =
        await Promise.all([
          import('@/lib/greedy-king-phaser/createGame'),
          import('@/lib/greedy-king-phaser/GreedyKingController'),
        ]);

      if (destroyed) return;

      instance = new GreedyKingController();
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

      game = createGreedyKingGame({
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
      <GreedyHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
