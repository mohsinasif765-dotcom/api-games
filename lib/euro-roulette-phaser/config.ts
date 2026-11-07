/** Euro Roulette — simplified European (0–36) + 8 category bets. */

export const GAME_NAME = 'Euro Roulette';
export const GAME_SLUG = 'euro_roulette';

/** Square stage — only the spinner (HUD is HTML below). */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 640;

/** Standard European wheel order (clockwise from 0). */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type BetOptionId =
  | 'zero'
  | 'dozen1'
  | 'dozen2'
  | 'dozen3'
  | 'red'
  | 'black'
  | 'odd'
  | 'even';

export type BetOption = {
  id: BetOptionId;
  label: string;
  multiplier: number;
  color: string;
};

export const BET_OPTIONS: BetOption[] = [
  { id: 'zero', label: '0', multiplier: 36, color: '#1B5E20' },
  { id: 'dozen1', label: '1-12', multiplier: 3, color: '#1565C0' },
  { id: 'dozen2', label: '13-24', multiplier: 3, color: '#6A1B9A' },
  { id: 'dozen3', label: '25-36', multiplier: 3, color: '#E65100' },
  { id: 'red', label: 'Red', multiplier: 2, color: '#C62828' },
  { id: 'black', label: 'Black', multiplier: 2, color: '#212121' },
  { id: 'odd', label: 'Odd', multiplier: 2, color: '#4527A0' },
  { id: 'even', label: 'Even', multiplier: 2, color: '#00695C' },
];

export const CHIPS = [
  {
    amount: 200,
    label: '200',
    color: '#43A047',
    image: '/euro-roulette/chips/chip_200.webp',
  },
  {
    amount: 500,
    label: '500',
    color: '#EC407A',
    image: '/euro-roulette/chips/chip_500.webp',
  },
  {
    amount: 1000,
    label: '1K',
    color: '#FB8C00',
    image: '/euro-roulette/chips/chip_1k.webp',
  },
  {
    amount: 5000,
    label: '5K',
    color: '#E53935',
    image: '/euro-roulette/chips/chip_5k.webp',
  },
] as const;

/** Soft per-option max shown on bet cells (display only). */
export const BET_CELL_LIMIT = 500;

export function numberColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function matchingCategories(n: number): BetOptionId[] {
  if (n < 0 || n > 36) return [];
  if (n === 0) return ['zero'];
  const cats: BetOptionId[] = [];
  if (n <= 12) cats.push('dozen1');
  else if (n <= 24) cats.push('dozen2');
  else cats.push('dozen3');
  cats.push(RED_NUMBERS.has(n) ? 'red' : 'black');
  cats.push(n % 2 === 1 ? 'odd' : 'even');
  return cats;
}

export function wheelIndexForNumber(n: number): number {
  const idx = WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

/** Degrees to rotate wheel so pocket `n` sits under the top pointer. */
export function wheelAngleForNumber(n: number): number {
  const idx = wheelIndexForNumber(n);
  const slice = 360 / WHEEL_ORDER.length;
  // Pocket centers: index 0 at top (-90° in Phaser from +x, we use container angle)
  return -(idx * slice);
}

export function optionById(id: string): BetOption | undefined {
  return BET_OPTIONS.find((o) => o.id === id);
}

export function formatCoins(n: number) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${Number.isInteger(v) ? v : v.toFixed(1)}M`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    return `${sign}${Number.isInteger(v) ? v : v.toFixed(1)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}
