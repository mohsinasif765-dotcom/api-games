import { supabase } from './supabase';
import { getStoredApiKey, placeGameBet } from './game-api-client';

/**
 * Place a bet via gateway when an end-player API key is present;
 * otherwise fall back to legacy Supabase RPC.
 */
export async function placeBetUnified(params: {
  slug: string;
  roundId: string;
  option: string;
  amount: number;
}): Promise<{ error: string | null; balance?: number }> {
  if (getStoredApiKey()) {
    const res = await placeGameBet({
      slug: params.slug,
      option: params.option,
      amount: params.amount,
      roundId: params.roundId,
    });
    if (!res.ok) return { error: res.error };
    return { error: null, balance: res.data.balance };
  }

  const { error } = await supabase.rpc('place_game_bet', {
    p_round_id: params.roundId,
    p_option: params.option,
    p_amount: params.amount,
  });

  return { error: error?.message ?? null };
}
