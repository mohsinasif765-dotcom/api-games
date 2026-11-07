'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { Lucky777Controller } from '@/lib/lucky-777-phaser/Lucky777Controller';
import { Lucky777Hud } from './Lucky777Hud';
import styles from './lucky-777.module.css';

export default function Lucky777Page() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<Lucky777Controller | null>(null);
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: Lucky777Controller | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createLucky777Game }, { Lucky777Controller }] = await Promise.all([
        import('@/lib/lucky-777-phaser/createGame'),
        import('@/lib/lucky-777-phaser/Lucky777Controller'),
      ]);

      if (destroyed) return;

      instance = new Lucky777Controller();
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

      game = createLucky777Game({
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
      <Lucky777Hud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
