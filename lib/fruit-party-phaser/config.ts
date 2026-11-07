export type FruitItem = {
  id: string;
  name: string;
  multiplier: number;
  image: string;
  textureKey: string;
  accent: string;
};

/** Outer 8 cells in clockwise spin order starting TL */
export const FRUIT_ITEMS: FruitItem[] = [
  {
    id: 'strawberry',
    name: 'Strawberry',
    multiplier: 5,
    image: '/fruit-party/strawbery.webp',
    textureKey: 'fruit_strawberry',
    accent: '#E53935',
  },
  {
    id: 'banana',
    name: 'Banana',
    multiplier: 5,
    image: '/fruit-party/banana.webp',
    textureKey: 'fruit_banana',
    accent: '#F9A825',
  },
  {
    id: 'watermelon',
    name: 'Watermelon',
    multiplier: 5,
    image: '/fruit-party/watermelon.webp',
    textureKey: 'fruit_watermelon',
    accent: '#43A047',
  },
  {
    id: 'grape',
    name: 'Grape',
    multiplier: 5,
    image: '/fruit-party/mango.webp',
    textureKey: 'fruit_grape',
    accent: '#8E24AA',
  },
  {
    id: 'lemon',
    name: 'Lemon',
    multiplier: 10,
    image: '/fruit-party/lemon.webp',
    textureKey: 'fruit_lemon',
    accent: '#FDD835',
  },
  {
    id: 'plum',
    name: 'Plum',
    multiplier: 10,
    image: '/fruit-party/avocado.webp',
    textureKey: 'fruit_plum',
    accent: '#6A1B9A',
  },
  {
    id: 'orange',
    name: 'Orange',
    multiplier: 20,
    image: '/fruit-party/oragnge.webp',
    textureKey: 'fruit_orange',
    accent: '#FB8C00',
  },
  {
    id: 'cherry',
    name: 'Cherry',
    multiplier: 40,
    image: '/fruit-party/apple.webp',
    textureKey: 'fruit_cherry',
    accent: '#C62828',
  },
];

/** 3×3 grid positions (null = center timer) */
export const GRID_LAYOUT: (string | null)[] = [
  'strawberry',
  'banana',
  'watermelon',
  'cherry',
  null,
  'grape',
  'orange',
  'plum',
  'lemon',
];

export const CHIPS = [
  {
    amount: 1000,
    image: '/fruit-party/chips/chip_1k.webp',
    textureKey: 'chip_1k',
    label: '1K',
  },
  {
    amount: 5000,
    image: '/fruit-party/chips/chip_5k.webp',
    textureKey: 'chip_5k',
    label: '5K',
  },
  {
    amount: 10000,
    image: '/fruit-party/chips/chip_10k.webp',
    textureKey: 'chip_10k',
    label: '10K',
  },
  {
    amount: 50000,
    image: '/fruit-party/chips/chip_50k.webp',
    textureKey: 'chip_50k',
    label: '50K',
  },
];

export const SPIN_ORDER = FRUIT_ITEMS.map((f) => f.id);
export const GAME_SLUG = 'fruit_party';
export const GAME_NAME = 'Fruit Party';

/** Match partymain-frame.png aspect (913×1525 purple JACKPOT cabinet). */
export const FRAME_ASPECT_W = 913;
export const FRAME_ASPECT_H = 1525;
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = Math.round(
  (GAME_WIDTH * FRAME_ASPECT_H) / FRAME_ASPECT_W,
);

/** % slots relative to new purple JACKPOT frame. */
export const SLOTS = {
  jackpot: { top: 12.4, left: 20, w: 60, h: 5 },
  reels: { top: 18.2, left: 26, w: 48, h: 5.5 },
  board: { top: 29.2, left: 13.5, w: 73, h: 42.5 },
  strip: { top: 73.2, left: 13.5, w: 73, h: 5.2 },
  chips: { top: 78.2, left: 8, w: 84, h: 10.5 },
  btnRow: { top: 90.2, left: 10, w: 80, h: 6.5 },
} as const;

export function chipTextureForAmount(amount: number): string {
  return (
    CHIPS.find((c) => c.amount === amount)?.textureKey || 'chip_gold'
  );
}

export function fruitById(id: string): FruitItem | undefined {
  return FRUIT_ITEMS.find((f) => f.id === id);
}
