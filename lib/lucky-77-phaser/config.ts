export type WheelOption = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  image: string;
  textureKey: string;
};

/** Bet board options (server ids). */
export const BET_OPTIONS: WheelOption[] = [
  {
    id: 'watermelon',
    name: 'Watermelon',
    multiplier: 2,
    color: '#9B00D9',
    image: '/fruit-party/watermelon.webp',
    textureKey: 'opt_watermelon',
  },
  {
    id: 'seventy_seven',
    name: '77',
    multiplier: 8,
    color: '#2ECC20',
    image: '/77/symbol-77.webp',
    textureKey: 'opt_seventy_seven',
  },
  {
    id: 'plum',
    name: 'Mango',
    multiplier: 2,
    color: '#007AE6',
    image: '/fruit-party/mango.webp',
    textureKey: 'opt_plum',
  },
];

/** Disc colors matched to /77/spinner-art.png */
export const SLICE_PURPLE = '#9B00D9';
export const SLICE_PURPLE_INNER = '#5C0090';
export const SLICE_PURPLE_GLOSS = '#E070FF';

export const SLICE_BLUE = '#007AE6';
export const SLICE_BLUE_INNER = '#0048A8';
export const SLICE_BLUE_GLOSS = '#7EC8FF';

/** Jackpot (77) — neon green like the art disc. */
export const SLICE_JACKPOT = '#2ECC20';
export const SLICE_JACKPOT_INNER = '#0E7A0A';
export const SLICE_JACKPOT_GLOSS = '#B6FF6A';

/** Active / win slice — metallic 3D gold. */
export const SLICE_HIGHLIGHT = '#FFD700';
export const SLICE_HIGHLIGHT_INNER = '#B8860B';
export const SLICE_HIGHLIGHT_GLOSS = '#FFF4C2';
export const SLICE_HIGHLIGHT_MID = '#F5C518';
export const SLICE_HIGHLIGHT_EDGE = '#FFE082';

/** Neon rim (matches art disc glow). */
export const WHEEL_NEON = '#C44DFF';
export const WHEEL_NEON_OUTER = '#7EC8FF';
export const WHEEL_GOLD = '#FFD54F';
export const WHEEL_GOLD_DEEP = '#F9A825';
export const WHEEL_GOLD_BRIGHT = '#FFF8E1';
export const WHEEL_CHROME = '#E3F2FD';

/** Legacy aliases (kept for any leftover imports). */
export const SLICE_BLUE_DARK = SLICE_PURPLE;
export const SLICE_BLUE_LIGHT = SLICE_BLUE;
export const SLICE_BLUE_DARK_INNER = SLICE_PURPLE_INNER;
export const SLICE_BLUE_LIGHT_INNER = SLICE_BLUE_INNER;
export const SLICE_BLUE_DARK_GLOSS = SLICE_PURPLE_GLOSS;
export const SLICE_BLUE_LIGHT_GLOSS = SLICE_BLUE_GLOSS;

/**
 * 8 slices clockwise from top (12 o'clock), matching reference:
 * WM, Plum, WM, Plum, WM, Plum, 77, WM
 */
export const WHEEL_SEGMENTS: WheelOption[] = [
  BET_OPTIONS[0], // watermelon
  BET_OPTIONS[2], // plum
  BET_OPTIONS[0],
  BET_OPTIONS[2],
  BET_OPTIONS[0],
  BET_OPTIONS[2],
  BET_OPTIONS[1], // seventy_seven
  BET_OPTIONS[0], // watermelon
];

export const CHIPS = [
  {
    amount: 1000,
    image: '/fruit-party/chips/chip_1k.webp',
    label: '1K',
  },
  {
    amount: 10000,
    image: '/fruit-party/chips/chip_10k.webp',
    label: '10K',
  },
  {
    amount: 50000,
    image: '/fruit-party/chips/chip_50k.webp',
    label: '50K',
  },
  {
    amount: 500000,
    image: '/fruit-party/chips/chip_500k.webp',
    label: '500K',
  },
  {
    amount: 1_000_000,
    image: '/fruit-party/chips/chip_1m.webp',
    label: '1M',
  },
  {
    amount: 10_000_000,
    image: '/fruit-party/chips/chip_10m.webp',
    label: '10M',
  },
] as const;

export type ChipItem = (typeof CHIPS)[number];

export const SPIN_ORDER = WHEEL_SEGMENTS.map((t) => t.id);

export const GAME_SLUG = 'lucky_777';
export const GAME_NAME = 'Lucky 77';

/** Slightly snappy spin (~4 turns / ~2.8s). */
export const WHEEL_SPIN_MS = 2800;
export const WHEEL_SPIN_TOTAL_MS = WHEEL_SPIN_MS;
export const WHEEL_SPIN_LOOPS = 4;
/** Min gap between spin_tick restarts (Android WebView seek is expensive). */
export const SPIN_TICK_MIN_MS = 140;
/**
 * TEMP: mute spin_start + spin_tick to test Android lag.
 * Re-enable after lag check.
 */
export const SPIN_SOUNDS_ENABLED = false;

export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 360;

export const WHEEL = {
  cx: GAME_WIDTH / 2,
  cy: GAME_HEIGHT / 2,
  /** Fit inside ring-frame opening. */
  outerRadius: 178,
  logoRadius: 118,
  logoSize: 44,
  /**
   * Must match the frame’s inner hub-ring outer edge so slices/spokes
   * do not poke past the middle ring into the hub.
   */
  hubRadius: 72,
} as const;

export type SlicePalette = {
  base: string;
  inner: string;
  gloss: string;
};

export function optionById(id: string): WheelOption | undefined {
  return BET_OPTIONS.find((t) => t.id === id);
}

/** Base slice color by index. */
export function sliceBaseColor(index: number): string {
  return slicePalette(index).base;
}

/** Full palette for layered shiny wedge rendering (matches spinner-art). */
export function slicePalette(index: number): SlicePalette {
  const seg = WHEEL_SEGMENTS[index];
  if (seg?.id === 'seventy_seven') {
    return {
      base: SLICE_JACKPOT,
      inner: SLICE_JACKPOT_INNER,
      gloss: SLICE_JACKPOT_GLOSS,
    };
  }
  if (seg?.id === 'plum') {
    return {
      base: SLICE_BLUE,
      inner: SLICE_BLUE_INNER,
      gloss: SLICE_BLUE_GLOSS,
    };
  }
  // watermelon / default — purple
  return {
    base: SLICE_PURPLE,
    inner: SLICE_PURPLE_INNER,
    gloss: SLICE_PURPLE_GLOSS,
  };
}

export function sliceHighlightPalette(): SlicePalette {
  return {
    base: SLICE_HIGHLIGHT,
    inner: SLICE_HIGHLIGHT_INNER,
    gloss: SLICE_HIGHLIGHT_GLOSS,
  };
}

export function formatChip(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(amount);
}

/**
 * Mid-angle of slice `index` (degrees).
 * Slice 0 is centered under the top gem/pointer (matches frame).
 */
export function segmentAngleDeg(index: number): number {
  const n = WHEEL_SEGMENTS.length;
  return (index * 360) / n - 90;
}

/**
 * Slice i start angle in radians (Phaser: 0 = east, clockwise).
 * Borders align with frame spokes — top slice centered at 12 o'clock.
 */
export function segmentStartRad(index: number): number {
  const n = WHEEL_SEGMENTS.length;
  const slice = (Math.PI * 2) / n;
  return -Math.PI / 2 - slice / 2 + index * slice;
}

export function segmentOffset(
  index: number,
  radius: number = WHEEL.logoRadius,
) {
  const radian = (segmentAngleDeg(index) * Math.PI) / 180;
  return {
    x: Math.cos(radian) * radius,
    y: Math.sin(radian) * radius,
  };
}

export function pickWinSegmentIndex(winnerId: string): number {
  const matches = WHEEL_SEGMENTS.map((t, i) => (t.id === winnerId ? i : -1)).filter(
    (i) => i >= 0,
  );
  if (matches.length === 0) return 0;
  return matches[Math.floor(Math.random() * matches.length)];
}
