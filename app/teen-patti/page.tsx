'use client';

import { useEffect, useRef, useState } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import type { TeenPattiController } from '@/lib/teen-patti-phaser/TeenPattiController';
import { TeenPattiHud } from './TeenPattiHud';
import styles from './teen-patti.module.css';

export default function TeenPattiPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<TeenPattiController | null>(null);
  const [splash, setSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let instance: TeenPattiController | null = null;
    let offProgress: (() => void) | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      await applyWebViewAccessToken(params.get('token'));

      const [{ createTeenPattiGame }, { TeenPattiController }] =
        await Promise.all([
          import('@/lib/teen-patti-phaser/createGame'),
          import('@/lib/teen-patti-phaser/TeenPattiController'),
        ]);

      if (destroyed) return;

      instance = new TeenPattiController();
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

      game = createTeenPattiGame({
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
      <TeenPattiHud
        controller={controller}
        splash={splash || !controller}
        loadProgress={loadProgress}
        canvasHostRef={hostRef}
      />
    </div>
  );
}
