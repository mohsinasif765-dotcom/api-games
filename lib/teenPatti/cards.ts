export type PlayingCard = { s: string; r: string };

const SUIT_SYMBOL: Record<string, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠',
};

const SUIT_COLOR: Record<string, string> = {
  H: '#e53935',
  D: '#e53935',
  C: '#1a1a2e',
  S: '#1a1a2e',
};

export function suitSymbol(suit: string): string {
  return SUIT_SYMBOL[suit.toUpperCase()] ?? suit;
}

export function suitColor(suit: string): string {
  return SUIT_COLOR[suit.toUpperCase()] ?? '#333';
}

export function rankLabel(rank: string): string {
  return rank.toUpperCase();
}

export function cardLabel(card: PlayingCard): string {
  return `${rankLabel(card.r)}${suitSymbol(card.s)}`;
}
