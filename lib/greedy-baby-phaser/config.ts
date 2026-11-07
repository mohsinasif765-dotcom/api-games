export type FoodItem = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  image: string;
  textureKey: string;
  hot?: boolean;
};

/** Clockwise from top. */
export const FOOD_ITEMS: FoodItem[] = [
  {
    id: 'kebab',
    name: 'Kebab',
    multiplier: 45,
    color: '#E67E22',
    image: '/greedy-baby/kebab.webp',
    textureKey: 'food_kebab',
  },
  {
    id: 'meat',
    name: 'Meat',
    multiplier: 25,
    color: '#A04030',
    image: '/greedy-baby/meat.webp',
    textureKey: 'food_meat',
  },
  {
    id: 'steak',
    name: 'Steak',
    multiplier: 15,
    color: '#8E5A3C',
    image: '/greedy-baby/steak.webp',
    textureKey: 'food_steak',
  },
  {
    id: 'hotdog',
    name: 'Hot Dog',
    multiplier: 10,
    color: '#C0392B',
    image: '/greedy-baby/hotdog.webp',
    textureKey: 'food_hotdog',
  },
  {
    id: 'corn',
    name: 'Corn',
    multiplier: 5,
    color: '#F1C40F',
    image: '/greedy-baby/corn.webp',
    textureKey: 'food_corn',
  },
  {
    id: 'cabbage',
    name: 'Cabbage',
    multiplier: 5,
    color: '#27AE60',
    image: '/greedy-baby/cabbage.webp',
    textureKey: 'food_cabbage',
    hot: true,
  },
  {
    id: 'carrot',
    name: 'Carrot',
    multiplier: 5,
    color: '#F39C12',
    image: '/greedy-baby/carrot.webp',
    textureKey: 'food_carrot',
  },
  {
    id: 'tomato',
    name: 'Tomato',
    multiplier: 5,
    color: '#E74C3C',
    image: '/greedy-baby/tomato.webp',
    textureKey: 'food_tomato',
  },
];

/** Same chip steps as reference / baby product. */
export const CHIPS = [100, 1000, 10000, 100000, 300000] as const;

export const SPIN_ORDER = FOOD_ITEMS.map((f) => f.id);
export const GAME_SLUG = 'greedy_baby';
export const GAME_NAME = 'Greedy Baby';

export const GAME_WIDTH = 390;
/** Greedy King stand (main-stand.webp 1095×1008). */
export const STAND_ASPECT_W = 1095;
export const STAND_ASPECT_H = 1008;

export const STAND_CANVAS_TOP_PCT = -10;
export const STAND_CANVAS_HEIGHT_PCT = 74;
export const GAME_HEIGHT = Math.round(
  (GAME_WIDTH * STAND_ASPECT_H * STAND_CANVAS_HEIGHT_PCT) /
    (STAND_ASPECT_W * 100),
);

export const WHEEL = {
  cx: GAME_WIDTH / 2,
  cy: Math.round(
    (GAME_HEIGHT * (27.3 - STAND_CANVAS_TOP_PCT)) / STAND_CANVAS_HEIGHT_PCT,
  ),
  orbitRadius: 105,
  slotSize: 54,
  hubRadius: 40,
} as const;

export const SLOT_LABEL_NUDGE_Y_PCT = -5.2;

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
