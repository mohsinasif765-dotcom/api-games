'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { applyWebViewAccessToken } from '@/lib/webview-auth';

/**
 * Thin Next.js shell: WebView auth + Tailwind splash + Phaser mount.
 * Hero Chest — 3×3 chests + center hero, key bets.
 */
export default function HeroChestPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState('Preparing treasures…');

  useEffect(() => {
    if (progress < 35) setStatus('Preparing treasures…');
    else if (progress < 70) setStatus('Forging the keys…');
    else if (progress < 100) setStatus('Sealing the vault…');
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

      const [{ createHeroChestGame }, { HeroChestController }] =
        await Promise.all([
          import('@/lib/hero-chest-phaser/createGame'),
          import('@/lib/hero-chest-phaser/HeroChestController'),
        ]);

      if (destroyed || !hostRef.current) return;

      const ctrl = new HeroChestController();
      controller = ctrl;
      await ctrl.start();

      if (destroyed || !hostRef.current) {
        ctrl.destroy();
        return;
      }

      game = createHeroChestGame({
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
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-[#1a0a05]">
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full [&_canvas]:[image-rendering:auto]"
        style={{ touchAction: 'none' }}
      />

      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="hero-chest-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
            className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          >
            {/* Full-bleed splash art */}
            <img
              src="/hero-chest/splash.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center scale-110"
              draggable={false}
            />

            {/* Atmosphere washes */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-[#120805]/90" />
            <div className="absolute -top-24 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0a0402] via-[#0a0402]/80 to-transparent" />

            {/* Embers */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {[12, 28, 44, 61, 77, 88].map((left, i) => (
                <span
                  key={left}
                  className="absolute bottom-[8%] h-1.5 w-1.5 rounded-full bg-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.9)] animate-pulse"
                  style={{
                    left: `${left}%`,
                    animationDelay: `${i * 0.35}s`,
                    transform: `translateY(-${i * 18}px)`,
                  }}
                />
              ))}
            </div>

            {/* Title */}
            <div className="relative z-10 mt-[max(3.5rem,8dvh)] flex flex-col items-center px-6 text-center">
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="font-black tracking-[0.12em] text-[#FFE082] text-[clamp(1.75rem,7vw,2.75rem)] drop-shadow-[0_2px_0_#3a1800,0_8px_24px_rgba(0,0,0,0.65)]"
              >
                HERO CHEST
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.9 }}
                transition={{ delay: 0.15, duration: 0.45 }}
                className="mt-2 text-sm font-semibold tracking-wide text-amber-100/85"
              >
                Open the vault · claim your keys
              </motion.p>
            </div>

            {/* Loader plaque */}
            <div className="relative z-10 mt-auto mb-[max(2rem,6dvh)] w-full px-7">
              <div className="mx-auto max-w-sm rounded-2xl border border-amber-400/40 bg-black/45 px-5 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/80">
                    {status}
                  </span>
                  <span className="font-black tabular-nums text-amber-300 text-lg drop-shadow">
                    {progress}%
                  </span>
                </div>

                <div className="relative h-3.5 overflow-hidden rounded-full border border-amber-500/50 bg-[#1a0a05] p-[3px] shadow-inner">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-400 to-yellow-200 shadow-[0_0_14px_rgba(251,191,36,0.55)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                  />
                </div>

                <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-white/35">
                  <span>Vault</span>
                  <span>Keys</span>
                  <span>Fortune</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
