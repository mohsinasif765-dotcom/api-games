'use client';

import React, { useEffect, useRef, type MutableRefObject } from 'react';
import { Clock } from 'lucide-react';

type ClockRefs = {
  endsAtMsRef: MutableRefObject<number | null>;
  skewMsRef: MutableRefObject<number>;
};

type Props = {
  clock: ClockRefs;
  active: boolean;
  className?: string;
  label?: string;
  urgentBelow?: number;
};

/**
 * Countdown via rAF — updates textContent only (no React re-render per tick).
 */
export function GameCountdown({
  clock,
  active,
  className = '',
  label = 'Ends In',
  urgentBelow = 5,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const lastShownRef = useRef<number | null>(null);

  useEffect(() => {
    lastShownRef.current = null;
  }, [active]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (!active) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const endMs = clock.endsAtMsRef.current;
      let secs = 0;
      if (endMs != null && Number.isFinite(endMs)) {
        const nowAligned = Date.now() - clock.skewMsRef.current;
        // Whole seconds remaining — steps exactly once per second boundary
        secs = Math.max(0, Math.floor((endMs - nowAligned) / 1000));
      }

      if (lastShownRef.current !== secs) {
        lastShownRef.current = secs;
        if (valueRef.current) valueRef.current.textContent = `${secs}s`;
        const urgent = secs > 0 && secs <= urgentBelow;
        rootRef.current?.classList.toggle('border-red-500/50', urgent);
        rootRef.current?.classList.toggle('border-accent/20', !urgent);
        labelRef.current?.classList.toggle('text-red-500', urgent);
        labelRef.current?.classList.toggle('text-accent', !urgent);
        valueRef.current?.classList.toggle('text-red-500', urgent);
        valueRef.current?.classList.toggle('text-white', !urgent);
        iconRef.current?.classList.toggle('text-red-500', urgent);
        iconRef.current?.classList.toggle('animate-pulse', urgent);
        iconRef.current?.classList.toggle('text-white/40', !urgent);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock, urgentBelow, active]);

  return (
    <div
      ref={rootRef}
      className={`glass-card px-4 py-2 rounded-2xl border border-accent/20 flex flex-col items-end shadow-lg ${className}`}
      style={{ display: active ? undefined : 'none' }}
      aria-live="polite"
    >
      <span
        ref={labelRef}
        className="text-[7px] font-black uppercase tracking-widest mb-0.5 text-accent"
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span ref={iconRef} className="text-white/40 inline-flex">
          <Clock size={10} />
        </span>
        <span
          ref={valueRef}
          className="text-xl font-black italic tracking-tight text-white"
        >
          0s
        </span>
      </div>
    </div>
  );
}
