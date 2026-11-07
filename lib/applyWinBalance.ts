import { supabase } from '@/lib/supabase';
import { fetchMe, getStoredApiKey } from '@/lib/game-api-client';

/** Fetch latest coins for a user (gateway API key preferred). */
export async function fetchUserCoins(userId: string): Promise<number | null> {
  if (getStoredApiKey()) {
    const me = await fetchMe();
    if (me.ok) return me.data.player.coins;
  }

  const { data, error } = await supabase
    .from('users')
    .select('coins')
    .eq('id', userId)
    .single();
  if (error || data?.coins == null) return null;
  return Number(data.coins);
}

/**
 * After a game win: bump local balance immediately, then reconcile from DB
 * (payout may land a beat after the spin UI finishes).
 */
export function applyWinToBalance(opts: {
  userId: string | null | undefined;
  winCoins: number;
  setBalance: (updater: number | ((prev: number) => number)) => void;
  /** Also keep a ref in sync when games use balanceRef. */
  balanceRef?: { current: number };
  /** Delay before DB reconcile. Default 700ms. */
  reconcileMs?: number;
}): void {
  const win = Math.floor(Number(opts.winCoins) || 0);
  if (win <= 0) return;

  opts.setBalance((prev) => {
    const next = prev + win;
    if (opts.balanceRef) opts.balanceRef.current = next;
    return next;
  });

  const uid = opts.userId;
  if (!uid) return;

  const delay = opts.reconcileMs ?? 700;
  window.setTimeout(() => {
    void fetchUserCoins(uid).then((coins) => {
      if (coins == null) return;
      opts.setBalance(coins);
      if (opts.balanceRef) opts.balanceRef.current = coins;
    });
  }, delay);
}
