'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { Lucky77Controller } from '@/lib/lucky-77-phaser/Lucky77Controller';
import { Lucky77Hud } from './Lucky77Hud';
import styles from './lucky-77.module.css';

export default function Lucky77Page() {
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

  return (
    <div className={styles.root}>
      <Lucky77Hud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
