export const BOOT_OPTIONS = [200, 1000, 5000, 10000, 50000, 100000] as const;

export const MAX_SEATS = 6;

export const BETTING_SECONDS = 30;

export const SHOWDOWN_SECONDS = 6;

export type RoundStatus = 'betting' | 'showdown' | 'finished';

export type TeenPattiRound = {
  id: string;
  room_id: string | null;
  status: RoundStatus;
  pot: number;
  boot_amount: number;
  max_seats: number;
  betting_ends_at: string;
  round_ends_at: string | null;
  winner_user_id: string | null;
  winner_hand_label: string | null;
  created_at: string;
};

export type TeenPattiSeat = {
  id: string;
  round_id: string;
  user_id: string;
  seat_index: number;
  cards: { s: string; r: string }[] | null;
  hand_rank: number | null;
  hand_label: string | null;
  boot_paid: number;
  cards_revealed: boolean;
  users?: {
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export function formatChip(value: number): string {
  if (value >= 100000) return `${value / 1000}K`;
  if (value >= 1000) return `${value / 1000}K`;
  return String(value);
}

export function formatBalance(value: number): string {
  if (!value || value <= 0) return "0";
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}
