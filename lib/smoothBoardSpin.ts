/**
 * Smooth board-highlight spin that lands exactly on winIndex.
 * Used by Greedy / Pizza / Fruit-style grids — does not touch bet/payout logic.
 */

export type SmoothBoardSpinHandle = {
  cancel: () => void;
};

export type SmoothBoardSpinOptions = {
  /** Number of board options (usually 8). */
  optionCount: number;
  /** 0-based index of the winning option in highlight order. */
  winIndex: number;
  /** Full circles before landing. Default 5. */
  loops?: number;
  /** Total animation length in ms. Default 5200. */
  durationMs?: number;
  /**
   * `easeOut` = classic slowdown (default).
   * `linear` = constant tick rate until the end (match constant-speed wheels).
   */
  ease?: 'easeOut' | 'linear';
  onIndex: (index: number) => void;
  onTick?: () => void;
  onComplete: () => void;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Steps highlight from 0..optionCount-1.
 * Final highlighted index === winIndex % optionCount.
 */
export function startSmoothBoardSpin(
  options: SmoothBoardSpinOptions,
): SmoothBoardSpinHandle {
  const n = Math.max(1, options.optionCount);
  const winIdx = ((options.winIndex % n) + n) % n;
  const loops = options.loops ?? 5;
  const durationMs = options.durationMs ?? 5200;
  const easeMode = options.ease ?? 'easeOut';
  // final highlight = (totalSteps - 1) % n === winIdx
  const totalSteps = n * loops + winIdx + 1;

  let raf: number | null = null;
  let cancelled = false;
  let lastIdx = -1;
  const start = performance.now();

  options.onIndex(0);

  const frame = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeMode === 'linear' ? t : easeOutCubic(t);
    const stepped = Math.min(
      totalSteps - 1,
      Math.floor(eased * totalSteps),
    );
    const idx = stepped % n;
    if (idx !== lastIdx) {
      lastIdx = idx;
      options.onIndex(idx);
      options.onTick?.();
    }
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
      options.onIndex(winIdx);
      options.onComplete();
    }
  };

  raf = requestAnimationFrame(frame);

  return {
    cancel: () => {
      cancelled = true;
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    },
  };
}
