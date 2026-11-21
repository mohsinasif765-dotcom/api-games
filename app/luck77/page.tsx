'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameViewport } from '@/components/useGameViewport';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { Lucky77Controller } from '@/lib/lucky-77-phaser/Lucky77Controller';
import { Lucky77Hud } from './Lucky77Hud';
import styles from './lucky-77.module.css';

const STAGE_WIDTH = 390;
const MIN_STAGE_HEIGHT = 710;

export default function Lucky77Page() {
  const { viewportRef, height, scale } = useGameViewport(
    STAGE_WIDTH,
    MIN_STAGE_HEIGHT,
    424 / STAGE_WIDTH,
  );
  const stageHeight = Math.max(MIN_STAGE_HEIGHT, height / scale);
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<Lucky77Controller | null>(null);
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: Lucky77Controller | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createLucky77Game }, { Lucky77Controller }] = await Promise.all([
        import('@/lib/lucky-77-phaser/createGame'),
        import('@/lib/lucky-77-phaser/Lucky77Controller'),
      ]);

      if (destroyed) return;

      instance = new Lucky77Controller();
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

      game = createLucky77Game({
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

  const loading = splash || !controller;

  return (
    <div data-loading={loading} className={`game-viewport ${styles.viewport}`}>
      <div className="game-viewport-content" ref={viewportRef}>
        <div
          className={styles.root}
          style={{ width: STAGE_WIDTH, height: stageHeight, transform: `scale(${scale})` }}
        >
          <Lucky77Hud
            controller={controller}
            splash={loading}
            loadProgress={loadProgress}
            canvasHostRef={hostRef}
          />
        </div>
      </div>
    </div>
  );
}
