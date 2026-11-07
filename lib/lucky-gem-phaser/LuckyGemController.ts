import { supabase } from '@/lib/supabase';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import { getAuthTokenFromUrl } from '@/lib/gameGateway';
import { reportGameWin } from '@/lib/flutter-bridge';
import { fetchUserCoins } from '@/lib/applyWinBalance';
import {
  BET_STEPS,
  GAME_SLUG,
  MULTIPLIERS,
  evaluateSpin,
  generateGrid,
  pickWeighted,
  type MultId,
  type SymbolId,
} from './config';

type Listener<T = unknown> = (payload: T) => void;

export type ControllerEvents = {
  ready: {
    userId: string | null;
    balance: number;
    bet: number;
  };
  balance: number;
  bet: number;
  toast: string;
  muted: boolean;
  fast: boolean;
  spinning: boolean;
  spinStart: {
    grid: SymbolId[];
    specialId: MultId;
    specialMult: number;
    totalWin: number;
    lineWins: Array<{ line: number; symbol: SymbolId; payout: number }>;
  };
  spinComplete: {
    grid: SymbolId[];
    specialId: MultId;
    specialMult: number;
    totalWin: number;
    lineWins: Array<{ line: number; symbol: SymbolId; payout: number }>;
  };
};

export class LuckyGemController {
  private listeners = new Map<string, Set<Listener>>();
  userId: string | null = null;
  balance = 0;
  bet: number = BET_STEPS[2]!; // 1000
  isMuted = false;
  isFast = false;
  isSpinning = false;
  private destroyed = false;

  on<K extends keyof ControllerEvents>(
    event: K,
    fn: Listener<ControllerEvents[K]>,
  ) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener);
    return () => this.listeners.get(event)?.delete(fn as Listener);
  }

  private emit<K extends keyof ControllerEvents>(
    event: K,
    payload: ControllerEvents[K],
  ) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        (fn as Listener<ControllerEvents[K]>)(payload);
      } catch (e) {
        console.error(`[LuckyGem] listener ${event}`, e);
      }
    });
  }

  async start() {
    const token = getAuthTokenFromUrl();
    await applyWebViewAccessToken(token);

    const { data } = await supabase.auth.getUser();
    this.userId = data.user?.id ?? null;
    this.balance = this.userId ? (await fetchUserCoins(this.userId)) ?? 0 : 0;

    this.emit('ready', {
      userId: this.userId,
      balance: this.balance,
      bet: this.bet,
    });
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
  }

  unlockAudio() {
    // reserved for SFX unlock
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.emit('muted', this.isMuted);
  }

  toggleFast() {
    this.isFast = !this.isFast;
    this.emit('fast', this.isFast);
  }

  setBet(amount: number) {
    if (this.isSpinning) return;
    if (!BET_STEPS.includes(amount as (typeof BET_STEPS)[number])) return;
    this.bet = amount;
    this.emit('bet', this.bet);
  }

  bumpBet(dir: 1 | -1) {
    if (this.isSpinning) return;
    const idx = BET_STEPS.indexOf(this.bet as (typeof BET_STEPS)[number]);
    const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, idx + dir))];
    if (next != null) this.setBet(next);
  }

  async spin() {
    if (this.destroyed || this.isSpinning) return;
    if (!this.userId) {
      this.emit('toast', 'Open from the app to play');
      return;
    }
    if (this.balance < this.bet) {
      this.emit('toast', 'Not enough coins');
      return;
    }

    this.isSpinning = true;
    this.emit('spinning', true);

    // Optimistic debit
    const prev = this.balance;
    this.balance -= this.bet;
    this.emit('balance', this.balance);

    const { error: debitErr } = await supabase
      .from('users')
      .update({ coins: this.balance })
      .eq('id', this.userId);

    if (debitErr) {
      this.balance = prev;
      this.emit('balance', this.balance);
      this.isSpinning = false;
      this.emit('spinning', false);
      this.emit('toast', 'Bet failed — try again');
      console.error('[LuckyGem] debit', debitErr);
      return;
    }

    const grid = generateGrid();
    const special = pickWeighted(MULTIPLIERS);
    const { lineWins, totalWin } = evaluateSpin(grid, special.mult, this.bet);

    const result = {
      grid,
      specialId: special.id,
      specialMult: special.mult,
      totalWin,
      lineWins,
    };
    this._pendingResult = result;

    this.emit('spinStart', result);

    // Scene animates; it calls finishSpin when reels land
  }

  private _pendingResult: ControllerEvents['spinComplete'] | null = null;

  /** Called by MainScene after reel animation ends. */
  async finishSpin() {
    const result = this._pendingResult;
    this._pendingResult = null;
    if (!result) {
      this.isSpinning = false;
      this.emit('spinning', false);
      return;
    }

    // Credit first so UI can rely on balance updates; emit complete after
    if (result.totalWin > 0 && this.userId) {
      this.balance += result.totalWin;
      this.emit('balance', this.balance);
      void supabase
        .from('users')
        .update({ coins: this.balance })
        .eq('id', this.userId)
        .then(({ error }) => {
          if (error) console.error('[LuckyGem] credit', error);
        });
      reportGameWin({
        gameSlug: GAME_SLUG,
        gameName: 'Lucky Gem',
        winCoins: result.totalWin,
        multiplier: result.specialMult,
        betAmount: this.bet,
      });
    }

    this.emit('spinComplete', result);
    this.isSpinning = false;
    this.emit('spinning', false);
  }
}
