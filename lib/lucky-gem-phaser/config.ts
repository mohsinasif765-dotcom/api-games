/** Lucky Gem — 3×3 temple slot + special multiplier wheel (reference layout). */

export const GAME_NAME = 'Lucky Gem';
export const GAME_SLUG = 'lucky_gem';

/** Portrait canvas — 2× for retina FIT. */
export const GAME_WIDTH = 780;
export const GAME_HEIGHT = 1440;

export type SymbolId = 'j' | 'q' | 'a' | 'blue' | 'green' | 'red' | 'wild';
export type MultId = 'm1' | 'm3' | 'm15';

export type SymbolDef = {
  id: SymbolId;
  textureKey: string;
  image: string;
  /** Base line payout = bet × payout */
  payout: number;
  weight: number;
};

export type MultDef = {
  id: MultId;
  textureKey: string;
  image: string;
  mult: number;
  weight: number;
};

export const SYMBOLS: SymbolDef[] = [
  // Tuned for ~92% RTP / house edge (was ~348% — far too generous with 1/3/15 special)
  { id: 'j', textureKey: 'sym_j', image: '/luckygem/j.webp', payout: 0.55, weight: 22 },
  { id: 'q', textureKey: 'sym_q', image: '/luckygem/q.webp', payout: 0.8, weight: 20 },
  { id: 'a', textureKey: 'sym_a', image: '/luckygem/a.webp', payout: 1.35, weight: 16 },
  { id: 'blue', textureKey: 'sym_blue', image: '/luckygem/blue.webp', payout: 2.15, weight: 12 },
  { id: 'green', textureKey: 'sym_green', image: '/luckygem/green.webp', payout: 3.25, weight: 10 },
  { id: 'red', textureKey: 'sym_red', image: '/luckygem/red.webp', payout: 4.85, weight: 8 },
  { id: 'wild', textureKey: 'sym_wild', image: '/luckygem/wild.webp', payout: 6.75, weight: 5 },
];

export const MULTIPLIERS: MultDef[] = [
  { id: 'm1', textureKey: 'mult_1', image: '/luckygem/1x.webp', mult: 1, weight: 55 },
  { id: 'm3', textureKey: 'mult_3', image: '/luckygem/3x.webp', mult: 3, weight: 30 },
  { id: 'm15', textureKey: 'mult_15', image: '/luckygem/15x.webp', mult: 15, weight: 15 },
];

export const BET_STEPS = [100, 500, 1000, 5000, 10000, 50000] as const;

/** Top arch prize wheel segments (visual + bonus coins). */
export type WheelSeg = {
  label: string;
  /** Flat coin bonus added on win (0 = no flat bonus). */
  bonus: number;
  color: number;
  weight: number;
};

export const WHEEL_SEGMENTS: WheelSeg[] = [
  { label: '1K', bonus: 1000, color: 0x7b1fa2, weight: 22 },
  { label: '3K', bonus: 3000, color: 0x43a047, weight: 18 },
  { label: '20', bonus: 20, color: 0xf9a825, weight: 20 },
  { label: '1M', bonus: 1_000_000, color: 0x8e24aa, weight: 4 },
  { label: '500', bonus: 500, color: 0x2e7d32, weight: 18 },
  { label: '5K', bonus: 5000, color: 0x6a1b9a, weight: 12 },
  { label: '100', bonus: 100, color: 0xc0a030, weight: 16 },
  { label: '10K', bonus: 10000, color: 0x558b2f, weight: 8 },
];

export function symbolById(id: string): SymbolDef | undefined {
  return SYMBOLS.find((s) => s.id === id);
}

export function multById(id: string): MultDef | undefined {
  return MULTIPLIERS.find((m) => m.id === id);
}

export function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** 3 horizontal paylines on a 3×3 grid (row-major). */
export const PAYLINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
];

/**
 * Evaluate 3×3 grid (row-major SymbolId[]) + special mult.
 * Wild substitutes for any symbol. Line pays when 3-of-a-kind (wilds OK).
 */
export function evaluateSpin(
  grid: SymbolId[],
  specialMult: number,
  bet: number,
): { lineWins: Array<{ line: number; symbol: SymbolId; payout: number }>; totalWin: number } {
  const lineWins: Array<{ line: number; symbol: SymbolId; payout: number }> = [];

  PAYLINES.forEach((cells, lineIdx) => {
    const ids = cells.map((i) => grid[i]!);
    const nonWild = ids.filter((id) => id !== 'wild');
    const target = nonWild[0] ?? 'wild';
    const ok = ids.every((id) => id === 'wild' || id === target);
    if (!ok) return;
    const def = symbolById(target)!;
    const payout = Math.round(bet * def.payout * specialMult);
    lineWins.push({ line: lineIdx, symbol: target, payout });
  });

  const totalWin = lineWins.reduce((s, w) => s + w.payout, 0);
  return { lineWins, totalWin };
}

export function generateGrid(): SymbolId[] {
  return Array.from({ length: 9 }, () => pickWeighted(SYMBOLS).id);
}
