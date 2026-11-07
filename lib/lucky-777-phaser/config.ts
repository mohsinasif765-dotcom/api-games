export type WheelOption = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  image: string;
  textureKey: string;
};

/** Bet board options (server ids — keep stable for bets/API state). */
export const BET_OPTIONS: WheelOption[] = [
  {
    id: 'watermelon',
    name: 'Watermelon',
    multiplier: 2,
    color: '#1E6FE0',
    image: '/lucky77/watermelon.webp?v=1',
    textureKey: 'opt_watermelon',
  },
  {
    id: 'seventy_seven',
    name: '77',
    multiplier: 8,
    color: '#FF2D9B',
    image: '/lucky77/77-emage.webp?v=1',
    textureKey: 'opt_seventy_seven',
  },
  {
    id: 'plum',
    name: 'Apple',
    multiplier: 2,
    color: '#5EC8FF',
    image: '/lucky77/apple.webp?v=1',
    textureKey: 'opt_plum',
  },
];

/** Premium casino palette — solid jewel tones (same punch as win blink). */
export const SLICE_BLUE_DARK = '#1A6FE8';
export const SLICE_BLUE_LIGHT = '#4FC3FF';
export const SLICE_BLUE_DARK_INNER = '#0B3FA8';
export const SLICE_BLUE_LIGHT_INNER = '#1480D4';
export const SLICE_BLUE_DARK_GLOSS = '#7EC8FF';
export const SLICE_BLUE_LIGHT_GLOSS = '#E0F7FF';

/** Jackpot (77) slice — same family as win blink. */
export const SLICE_JACKPOT = '#FF2D9B';
export const SLICE_JACKPOT_INNER = '#C2185B';
export const SLICE_JACKPOT_GLOSS = '#FF9AC8';

/** Active / win slice — metallic 3D gold. */
export const SLICE_HIGHLIGHT = '#FFD700';
export const SLICE_HIGHLIGHT_INNER = '#B8860B';
export const SLICE_HIGHLIGHT_GLOSS = '#FFF4C2';
export const SLICE_HIGHLIGHT_MID = '#F5C518';
export const SLICE_HIGHLIGHT_EDGE = '#FFE082';

/** Chrome / gold accents on the disc. */
export const WHEEL_GOLD = '#FFD54F';
export const WHEEL_GOLD_DEEP = '#F9A825';
export const WHEEL_GOLD_BRIGHT = '#FFF8E1';
export const WHEEL_CHROME = '#E3F2FD';

/**
 * 9 slices clockwise from top (12 o'clock), matching /lucky77/wheel.png
 * (77 under pointer, then WM / plum alternating).
 */
export const WHEEL_SEGMENTS: WheelOption[] = [
  BET_OPTIONS[1], // seventy_seven
  BET_OPTIONS[0], // watermelon
  BET_OPTIONS[2], // plum
  BET_OPTIONS[0],
  BET_OPTIONS[2],
  BET_OPTIONS[0],
  BET_OPTIONS[2],
  BET_OPTIONS[0],
  BET_OPTIONS[2],
];

/** Spinner disc with fruits baked in (wheel-full.png). */
export const WHEEL_ART = '/lucky77/wheel-full.webp?v=1';
export const WHEEL_ART_KEY = 'l777_wheel_full_v1';

export const CHIPS = [
  {
    amount: 200,
    image: '/lucky77/coin-200.webp?v=1',
    label: '200',
  },
  {
    amount: 500,
    image: '/lucky77/coin-500.webp?v=1',
    label: '500',
  },
  {
    amount: 1000,
    image: '/lucky77/1K.webp?v=1',
    label: '1K',
  },
  {
    amount: 5000,
    image: '/lucky77/5K.webp?v=1',
    label: '5K',
  },
  {
    amount: 30000,
    image: '/lucky77/30K.webp?v=1',
    label: '30K',
  },
] as const;

export type ChipItem = (typeof CHIPS)[number];

export const SPIN_ORDER = WHEEL_SEGMENTS.map((t) => t.id);

export const GAME_SLUG = 'fruit_777';
export const GAME_NAME = '777';

/** Fast spin without the old 2.8s jank peak (~4 turns / ~3.6s). */
export const WHEEL_SPIN_MS = 3600;
export const WHEEL_SPIN_TOTAL_MS = WHEEL_SPIN_MS;
export const WHEEL_SPIN_LOOPS = 4;
/** Min gap between spin_tick restarts (Android WebView seek is expensive). */
export const SPIN_TICK_MIN_MS = 140;

export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 360;

export const WHEEL = {
  cx: GAME_WIDTH / 2,
  cy: GAME_HEIGHT / 2,
  /** Fit inside 360 canvas (was 180 → 368px texture clipping the rim). */
  outerRadius: 176,
  logoRadius: 112,
  /** Unused when fruits are baked into wheel.png — kept for layout helpers. */
  logoSize: 26,
  hubRadius: 32,
} as const;

export type SlicePalette = {
  base: string;
  inner: string;
  gloss: string;
};

export function optionById(id: string): WheelOption | undefined {
  return BET_OPTIONS.find((t) => t.id === id);
}

/** Base slice color by index (even = dark blue, odd = light blue). */
export function sliceBaseColor(index: number): string {
  return slicePalette(index).base;
}

/** Full palette for layered shiny wedge rendering. */
export function slicePalette(index: number): SlicePalette {
  const seg = WHEEL_SEGMENTS[index];
  if (seg?.id === 'seventy_seven') {
    return {
      base: SLICE_JACKPOT,
      inner: SLICE_JACKPOT_INNER,
      gloss: SLICE_JACKPOT_GLOSS,
    };
  }
  if (index % 2 === 0) {
    return {
      base: SLICE_BLUE_DARK,
      inner: SLICE_BLUE_DARK_INNER,
      gloss: SLICE_BLUE_DARK_GLOSS,
    };
  }
  return {
    base: SLICE_BLUE_LIGHT,
    inner: SLICE_BLUE_LIGHT_INNER,
    gloss: SLICE_BLUE_LIGHT_GLOSS,
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
