'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { applyWebViewAccessToken } from '@/lib/webview-auth';

/**
 * Lord of Olympus — 6×5 cluster slot (9+ same symbol).
 */
export default function LordOfOlympusPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState('Summoning Olympus…');

  useEffect(() => {
    if (progress < 35) setStatus('Summoning Olympus…');
    else if (progress < 70) setStatus('Charging the bolts…');
    else if (progress < 100) setStatus('Aligning the gems…');
    else setStatus('Ready!');
  }, [progress]);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let controller: { destroy: () => void } | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      await applyWebViewAccessToken(token);

      if (destroyed || !hostRef.current) return;

      const [{ createLordOfOlympusGame }, { LordOfOlympusController }] =
        await Promise.all([
          import('@/lib/lord-of-olympus-phaser/createGame'),
          import('@/lib/lord-of-olympus-phaser/LordOfOlympusController'),
        ]);

      if (destroyed || !hostRef.current) return;

      const ctrl = new LordOfOlympusController();
      controller = ctrl;
      await ctrl.start();

      if (destroyed || !hostRef.current) {
        ctrl.destroy();
        return;
      }

      game = createLordOfOlympusGame({
        parent: hostRef.current,
        controller: ctrl,
        onLoadProgress: (pct) => {
          if (!destroyed) setProgress(pct);
        },
        onGameReady: () => {
          if (destroyed) return;
          setProgress(100);
          window.setTimeout(() => {
            if (!destroyed) setShowSplash(false);
          }, 420);
        },
      });
    };

    void boot();

    return () => {
      destroyed = true;
      game?.destroy(true);
      game = null;
      controller?.destroy();
      controller = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-[#1a0a2e]">
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full overflow-hidden [&_canvas]:[image-rendering:auto] [&_canvas]:!absolute [&_canvas]:!bottom-0 [&_canvas]:!left-1/2 [&_canvas]:!-translate-x-1/2 [&_canvas]:!top-auto [&_canvas]:!m-0"
        style={{ touchAction: 'none' }}
      />

      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="lord-olympus-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
            className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          >
            <img
              src="/loard-of-olympus/splash.webp?v=1"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center scale-105"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-[#12061f]/92" />
            <div className="absolute -top-20 left-1/2 h-64 w-[110%] -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl" />

            <div className="relative z-10 mt-[max(3.5rem,9dvh)] flex flex-col items-center px-6 text-center">
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-black tracking-[0.12em] text-[#FFE082] text-[clamp(1.5rem,6.2vw,2.5rem)] drop-shadow-[0_2px_0_#3a1800,0_10px_28px_rgba(0,0,0,0.65)]"
              >
                LORD OF OLYMPUS
              </motion.h1>
              <p className="mt-2 text-sm font-semibold tracking-wide text-amber-100/85">
                Match 9+ gems anywhere · Zeus awaits
              </p>
            </div>

            <div className="relative z-10 mt-auto mb-[max(2rem,6dvh)] w-full px-7">
              <div className="mx-auto max-w-sm rounded-2xl border border-amber-400/40 bg-black/45 px-5 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/80">
                    {status}
                  </span>
                  <span className="font-black tabular-nums text-amber-300 text-lg">
                    {progress}%
                  </span>
                </div>
                <div className="relative h-3.5 overflow-hidden rounded-full border border-amber-500/50 bg-[#1a0a2e] p-[3px]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-400 to-yellow-200"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
