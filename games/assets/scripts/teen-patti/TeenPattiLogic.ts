/**
 * Teen Patti card / hand helpers (local play).
 */

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Card = { s: Suit; r: Rank };

export type HandRank = {
  rank: number; // higher is better
  label: string;
  tiebreak: number[];
};

const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VAL: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
};

const SUIT_SYMBOL: Record<Suit, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠',
};

export function suitSymbol(s: Suit): string {
  return SUIT_SYMBOL[s];
}

export function suitColor(s: Suit): string {
  return s === 'H' || s === 'D' ? '#e53935' : '#111827';
}

export function cardLabel(c: Card): string {
  return `${c.r}${suitSymbol(c.s)}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ s, r });
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function vals(cards: Card[]): number[] {
  return cards.map((c) => RANK_VAL[c.r]).sort((a, b) => b - a);
}

function isFlush(cards: Card[]): boolean {
  return cards[0].s === cards[1].s && cards[1].s === cards[2].s;
}

function sequenceKey(v: number[]): number[] | null {
  const s = v.slice().sort((a, b) => a - b);
  // A-2-3 special
  if (s[0] === 2 && s[1] === 3 && s[2] === 14) return [3, 2, 14];
  if (s[2] - s[1] === 1 && s[1] - s[0] === 1) return [s[2], s[1], s[0]];
  return null;
}

export function evaluateHand(cards: Card[]): HandRank {
  const v = vals(cards);
  const flush = isFlush(cards);
  const seq = sequenceKey(v);
  const trail = v[0] === v[1] && v[1] === v[2];
  const pair =
    v[0] === v[1] || v[1] === v[2] || v[0] === v[2]
      ? v[0] === v[1]
        ? v[0]
        : v[1] === v[2]
          ? v[1]
          : v[0]
      : 0;

  if (trail) return { rank: 6, label: 'Trail', tiebreak: v };
  if (flush && seq) return { rank: 5, label: 'Pure Sequence', tiebreak: seq };
  if (seq) return { rank: 4, label: 'Sequence', tiebreak: seq };
  if (flush) return { rank: 3, label: 'Color', tiebreak: v };
  if (pair) {
    const kicker = v.find((x) => x !== pair) ?? 0;
    return { rank: 2, label: 'Pair', tiebreak: [pair, kicker] };
  }
  return { rank: 1, label: 'High Card', tiebreak: v };
}

export function compareHands(a: HandRank, b: HandRank): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const n = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < n; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
