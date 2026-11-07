export type ChestItem = {
  id: string;
  name: string;
  multiplier: number;
  image: string;
  textureKey: string;
  accent: string;
};

/** Outer 8 chests — multipliers match assets / Greedy King. */
export const CHEST_ITEMS: ChestItem[] = [
  {
    id: 'chest_5a',
    name: 'Chest ×5',
    multiplier: 5,
    image: '/hero-chest/box-5x-1.webp',
    textureKey: 'chest_5a',
    accent: '#8E24AA',
  },
  {
    id: 'chest_5b',
    name: 'Chest ×5',
    multiplier: 5,
    image: '/hero-chest/box-5x-2.webp',
    textureKey: 'chest_5b',
    accent: '#F9A825',
  },
  {
    id: 'chest_45',
    name: 'Chest ×45',
    multiplier: 45,
    image: '/hero-chest/box-45x.webp',
    textureKey: 'chest_45',
    accent: '#FF6F00',
  },
  {
    id: 'chest_10',
    name: 'Chest ×10',
    multiplier: 10,
    image: '/hero-chest/box-10x.webp',
    textureKey: 'chest_10',
    accent: '#1E88E5',
  },
  {
    id: 'chest_15',
    name: 'Chest ×15',
    multiplier: 15,
    image: '/hero-chest/box-15x.webp',
    textureKey: 'chest_15',
    accent: '#E91E63',
  },
  {
    id: 'chest_5c',
    name: 'Chest ×5',
    multiplier: 5,
    image: '/hero-chest/box-5x-3.webp',
    textureKey: 'chest_5c',
    accent: '#43A047',
  },
  {
    id: 'chest_25',
    name: 'Chest ×25',
    multiplier: 25,
    image: '/hero-chest/box-25x.webp',
    textureKey: 'chest_25',
    accent: '#FB8C00',
  },
  {
    id: 'chest_5d',
    name: 'Chest ×5',
    multiplier: 5,
    image: '/hero-chest/box-5x-4.webp',
    textureKey: 'chest_5d',
    accent: '#5E35B1',
  },
];

/**
 * 3×3 grid (null = center hero, not a bet cell).
 * Row-major: TL TC TR / ML C MR / BL BC BR
 */
export const GRID_LAYOUT: (string | null)[] = [
  'chest_5a',
  'chest_5b',
  'chest_45',
  'chest_10',
  null,
  'chest_15',
  'chest_5c',
  'chest_25',
  'chest_5d',
];

/** Clockwise spin order starting top-left. */
export const SPIN_ORDER = [
  'chest_5a',
  'chest_5b',
  'chest_45',
  'chest_15',
  'chest_5d',
  'chest_25',
  'chest_5c',
  'chest_10',
];

export const CHIPS = [
  {
    amount: 2000,
    image: '/hero-chest/key-2k.webp',
    textureKey: 'key_2k',
    label: '2K',
  },
  {
    amount: 10000,
    image: '/hero-chest/key-10k.webp',
    textureKey: 'key_10k',
    label: '10K',
  },
  {
    amount: 100000,
    image: '/hero-chest/key-100x.webp',
    textureKey: 'key_100k',
    label: '100K',
  },
  {
    amount: 500000,
    image: '/hero-chest/key-500x.webp',
    textureKey: 'key_500k',
    label: '500K',
  },
];

export const GAME_SLUG = 'hero_chest';
export const GAME_NAME = 'Hero Chest';

/** Portrait phone canvas — 2× design res so FIT stays sharp on retina. */
export const GAME_WIDTH = 780;
export const GAME_HEIGHT = 1440;

/** % slots relative to main-frame. Tuned for reference layout. */
export const SLOTS = {
  timer: { top: 7.5, left: 38, w: 24, h: 5 },
  // Slightly lower + larger so chests read bigger
  board: { top: 16.5, left: 11, w: 78, h: 66 },
  history: { top: 18, left: 0.5, w: 10, h: 52 },
  keys: { top: 18, left: 89, w: 10, h: 52 },
  footer: { top: 88, left: 8, w: 84, h: 9 },
} as const;

export function chipTextureForAmount(amount: number): string {
  return (
    CHIPS.find((c) => c.amount === amount)?.textureKey ||
    CHIPS[0]?.textureKey ||
    'key_2k'
  );
}

export function chestById(id: string): ChestItem | undefined {
  return CHEST_ITEMS.find((c) => c.id === id);
}
