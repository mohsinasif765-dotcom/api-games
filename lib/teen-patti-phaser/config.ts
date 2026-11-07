export type PartyOption = {
  id: string;
  name: string;
  multiplier: number;
  image: string;
  textureKey: string;
};

/** Three betting parties (reference Wolf / Lion / Fish). */
export const BET_OPTIONS: PartyOption[] = [
  {
    id: 'wolf',
    name: 'Wolf',
    multiplier: 3,
    image: '/teen-patti/flag-wolf.webp',
    textureKey: 'flag_wolf',
  },
  {
    id: 'lion',
    name: 'Lion',
    multiplier: 3,
    image: '/teen-patti/flag-lions.webp',
    textureKey: 'flag_lion',
  },
  {
    id: 'fish',
    name: 'Fish',
    multiplier: 3,
    image: '/teen-patti/flag-fish.webp',
    textureKey: 'flag_fish',
  },
];

export const CHIPS = [
  { amount: 200, image: '/fruit-party/chips/coin_gold.webp', label: '200' },
  { amount: 1000, image: '/fruit-party/chips/chip_1k.webp', label: '1K' },
  { amount: 5000, image: '/fruit-party/chips/chip_5k.webp', label: '5K' },
  { amount: 10000, image: '/fruit-party/chips/chip_10k.webp', label: '10K' },
  { amount: 50000, image: '/fruit-party/chips/chip_50k.webp', label: '50K' },
] as const;

export type ChipItem = (typeof CHIPS)[number];

export const GAME_SLUG = 'teen_patti';
export const GAME_NAME = 'Teen Patti';

export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 200;

export function optionById(id: string): PartyOption | undefined {
  return BET_OPTIONS.find((t) => t.id === id);
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

export type PlayingCard = { s: string; r: string };

const SUITS = ['H', 'D', 'C', 'S'] as const;
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic face cards for UI reveal (same round → same cards). */
export function dealPartyHands(
  roundId: string,
  winnerId: string,
): Record<string, PlayingCard[]> {
  const rng = mulberry32(hashSeed(`${roundId}:${winnerId}`));
  const deck: PlayingCard[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ s, r });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const hands: Record<string, PlayingCard[]> = {};
  let idx = 0;
  for (const opt of BET_OPTIONS) {
    hands[opt.id] = [deck[idx++], deck[idx++], deck[idx++]];
  }

  // Ensure winner side looks like a pair+ (visual polish only — server picks winner).
  const winHand = hands[winnerId];
  if (winHand) {
    winHand[1] = { s: winHand[0].s, r: winHand[0].r };
  }
  return hands;
}
