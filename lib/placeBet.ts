import { openWallet } from './flutter-bridge';
import { supabase } from './supabase';
import { getStoredApiKey, placeGameBet } from './game-api-client';

/**
 * Place a bet via gateway when an end-player API key is present;
 * otherwise fall back to legacy Supabase RPC.
 */
// Rapid taps put several bets in flight. Each response carries the balance
// right after *its* bet — it doesn't include bets still in flight, and
// responses can arrive out of order — so applying every one makes the shown
// balance jump up and down. Only hand back a server balance when this was
// the newest bet and nothing else is pending; otherwise the caller keeps its
// optimistic (already deducted) value.
let betSeq = 0;
let betsInFlight = 0;

export async function placeBetUnified(params: {
  slug: string;
  roundId: string;
  option: string;
  amount: number;
}): Promise<{ error: string | null; balance?: number }> {
  if (getStoredApiKey()) {
    const seq = ++betSeq;
    betsInFlight++;
    let res: Awaited<ReturnType<typeof placeGameBet>>;
    try {
      res = await placeGameBet({
        slug: params.slug,
        option: params.option,
        amount: params.amount,
        roundId: params.roundId,
      });
    } finally {
      betsInFlight--;
    }
    if (!res.ok) {
      if (res.status === 402) openWallet();
      return { error: res.error };
    }
    const settled = seq === betSeq && betsInFlight === 0;
    return { error: null, balance: settled ? res.data.balance : undefined };
  }

  const { error } = await supabase.rpc('place_game_bet', {
    p_round_id: params.roundId,
    p_option: params.option,
    p_amount: params.amount,
  });

  return { error: error?.message ?? null };
}
