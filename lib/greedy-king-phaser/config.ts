export type FoodItem = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  image: string;
  textureKey: string;
};

export const FOOD_ITEMS: FoodItem[] = [
  {
    id: 'icecream',
    name: 'Chicken',
    multiplier: 45,
    color: '#E67E22',
    image: '/greedy-lion/chicken.webp',
    textureKey: 'food_chicken',
  },
  {
    id: 'donut',
    name: 'Strawberry',
    multiplier: 5,
    color: '#E74C3C',
    image: '/greedy-lion/strawberry.webp',
    textureKey: 'food_strawberry',
  },
  {
    id: 'water',
    name: 'Corn',
    multiplier: 5,
    color: '#F1C40F',
    image: '/greedy-lion/corn.webp',
    textureKey: 'food_corn',
  },
  {
    id: 'soda',
    name: 'Palak',
    multiplier: 5,
    color: '#27AE60',
    image: '/greedy-lion/palak.webp',
    textureKey: 'food_palak',
  },
  {
    id: 'taco',
    name: 'Grapes',
    multiplier: 5,
    color: '#8E44AD',
    image: '/greedy-lion/grapes.webp',
    textureKey: 'food_grapes',
  },
  {
    id: 'pizza',
    name: 'Beef',
    multiplier: 10,
    color: '#C0392B',
    image: '/greedy-lion/beef.webp',
    textureKey: 'food_beef',
  },
  {
    id: 'burger',
    name: 'Fish',
    multiplier: 15,
    color: '#3498DB',
    image: '/greedy-lion/fish.webp',
    textureKey: 'food_fish',
  },
  {
    id: 'fries',
    name: 'Star Fish',
    multiplier: 25,
    color: '#E74C3C',
    image: '/greedy-lion/star-fish.webp',
    textureKey: 'food_starfish',
  },
];

export const CHIPS = [1000, 10000, 500000, 1000000, 10000000] as const;

export const SPIN_ORDER = FOOD_ITEMS.map((f) => f.id);
export const GAME_SLUG = 'greedy_king';
export const GAME_NAME = 'Greedy King';

export const GAME_WIDTH = 390;
/** Match main-stand.webp aspect (1095×1008) for the HTML stand stage. */
export const STAND_ASPECT_W = 1095;
export const STAND_ASPECT_H = 1008;

/**
 * Phaser canvas host on the stand (may extend above stand top).
 * Aspect must match this host or FIT letterboxing desyncs labels.
 */
export const STAND_CANVAS_TOP_PCT = -10;
export const STAND_CANVAS_HEIGHT_PCT = 74;
export const GAME_HEIGHT = Math.round(
  (GAME_WIDTH * STAND_ASPECT_H * STAND_CANVAS_HEIGHT_PCT) /
    (STAND_ASPECT_W * 100),
);

/**
 * Hub at 27.3% of full stand, mapped into the padded canvas.
 */
export const WHEEL = {
  cx: GAME_WIDTH / 2,
  cy: Math.round(
    (GAME_HEIGHT * (27.3 - STAND_CANVAS_TOP_PCT)) / STAND_CANVAS_HEIGHT_PCT,
  ),
  /** Push bet boxes slightly outside the gear rim. */
  orbitRadius: 105,
  /** bet-box pedestal size in Phaser. */
  slotSize: 54,
  hubRadius: 40,
} as const;

/** HTML food+x row sits this much above the slot center (stage %). */
export const SLOT_LABEL_NUDGE_Y_PCT = -5.2;

/** HTML % boxes aligned to main-stand.webp cream panels. */
export const STAND_PANELS = {
  balance: { left: 7.2, top: 83.2, width: 40.3, height: 13.8 },
  profit: { left: 52.6, top: 83.2, width: 40.2, height: 13.8 },
  hub: { left: 50, top: 27.3 },
} as const;

export function slotOffset(index: number, radius: number = WHEEL.orbitRadius) {
  const angle = (index * 360) / FOOD_ITEMS.length;
  const radian = ((angle - 90) * Math.PI) / 180;
  return {
    x: Math.cos(radian) * radius,
    y: Math.sin(radian) * radius,
  };
}

export function foodById(id: string): FoodItem | undefined {
  return FOOD_ITEMS.find((f) => f.id === id);
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
 * How many niche coins to show in bet-box (1–3).
 * Highest bet → 3, lowest → 1, middle → 2. Equal bets → 3.
 */
export function betCoinCount(
  amount: number,
  bets: Record<string, number>,
): number {
  if (amount <= 0) return 0;
  const vals = Object.values(bets).filter((v) => v > 0);
  if (vals.length === 0) return 0;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max === min) return 3;
  if (amount >= max) return 3;
  if (amount <= min) return 1;
  return 2;
}
