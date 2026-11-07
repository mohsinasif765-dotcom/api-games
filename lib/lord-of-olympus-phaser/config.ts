/** Lord of Olympus — 6×5 cluster slot (Gates-style 9+ anywhere). */

export const GAME_NAME = 'Lord of Olympus';
export const GAME_SLUG = 'lord_of_olympus';

/** Portrait canvas — 2× for retina FIT. */
export const GAME_WIDTH = 780;
export const GAME_HEIGHT = 1440;

export const COLS = 6;
export const ROWS = 5;
export const CELL_COUNT = COLS * ROWS;

/**
 * Board UV — full purple playfield inside gold frame (6 columns).
 */
export const BOARD_UV = {
  x0: 0.155,
  y0: 0.158,
  x1: 0.890,
  y1: 0.655,
};

/**
 * Bottom panel UV regions on main-container.webp.
 * Left empty · center Double Chance (parchment) · right Buy Free Spins · win bar.
 */
export const PANEL_UV = {
  left: { cx: 0.155, cy: 0.785, w: 0.2, h: 0.14 },
  center: { cx: 0.5, cy: 0.78, w: 0.42, h: 0.16 },
  right: { cx: 0.805, cy: 0.785, w: 0.24, h: 0.14 },
  bar: { cx: 0.5, cy: 0.935, w: 0.52, h: 0.06 },
};

/** Buy Free Spins cost = bet × this. */
export const BUY_FREE_SPINS_MULT = 100;
/** Double Chance adds this fraction of bet when ON (display only for now). */
export const DOUBLE_CHANCE_BET_MULT = 1.25;

export type SymbolId =
  | 'gem4'
  | 'gem5'
  | 'gem6'
  | 'ring'
  | 'cup'
  | 'hourglass'
  | 'crown'
  | 'tercon';

export type SymbolDef = {
  id: SymbolId;
  textureKey: string;
  image: string;
  /** Base payout multiplier when cluster hits (× cluster tier × bet). */
  payout: number;
  weight: number;
};

/** Asset folder keeps the typo `loard-of-olympus`. */
const A = '/loard-of-olympus';

export const SYMBOLS: SymbolDef[] = [
  // Tuned for ~94% RTP / ~30% hit (was ~237% RTP / ~56% hit — far too generous)
  { id: 'gem4', textureKey: 'sym_gem4', image: `${A}/gem4.webp`, payout: 1.4, weight: 22 },
  { id: 'gem5', textureKey: 'sym_gem5', image: `${A}/gem5.webp`, payout: 2.1, weight: 20 },
  { id: 'gem6', textureKey: 'sym_gem6', image: `${A}/gem6.webp`, payout: 2.8, weight: 18 },
  { id: 'ring', textureKey: 'sym_ring', image: `${A}/ring.webp`, payout: 4.2, weight: 14 },
  { id: 'cup', textureKey: 'sym_cup', image: `${A}/cup.webp`, payout: 5.6, weight: 12 },
  { id: 'hourglass', textureKey: 'sym_hourglass', image: `${A}/hourglass.webp`, payout: 7, weight: 10 },
  { id: 'crown', textureKey: 'sym_crown', image: `${A}/crown.webp`, payout: 10.5, weight: 7 },
  { id: 'tercon', textureKey: 'sym_tercon', image: `${A}/tercon.webp`, payout: 17.5, weight: 4 },
];

export const BET_STEPS = [100, 500, 1000, 5000, 10000, 50000] as const;

export function symbolById(id: string): SymbolDef | undefined {
  return SYMBOLS.find((s) => s.id === id);
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

/** Cluster tier: 9+ same symbol anywhere on the 6×5 grid. */
export function clusterTier(count: number): number {
  if (count >= 15) return 5;
  if (count >= 12) return 3;
  if (count >= 10) return 2;
  if (count >= 9) return 1;
  return 0;
}

export type ClusterWin = {
  symbol: SymbolId;
  count: number;
  cells: number[];
  payout: number;
};

/**
 * Evaluate 6×5 grid (row-major SymbolId[]).
 * Pays for each symbol with 9+ occurrences (anywhere).
 */
export function evaluateSpin(
  grid: SymbolId[],
  bet: number,
): { clusterWins: ClusterWin[]; totalWin: number } {
  const bySym = new Map<SymbolId, number[]>();
  grid.forEach((id, i) => {
    const list = bySym.get(id) ?? [];
    list.push(i);
    bySym.set(id, list);
  });

  const clusterWins: ClusterWin[] = [];
  bySym.forEach((cells, symbol) => {
    const tier = clusterTier(cells.length);
    if (tier <= 0) return;
    const def = symbolById(symbol)!;
    const payout = Math.round(bet * def.payout * tier);
    clusterWins.push({ symbol, count: cells.length, cells, payout });
  });

  const totalWin = clusterWins.reduce((s, w) => s + w.payout, 0);
  return { clusterWins, totalWin };
}

export function generateGrid(): SymbolId[] {
  return Array.from({ length: CELL_COUNT }, () => pickWeighted(SYMBOLS).id);
}
