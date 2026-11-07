import { supabase } from '@/lib/supabase';
import { placeBetUnified } from '@/lib/placeBet';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import {
  GameLiveSnapshot,
  getAuthTokenFromUrl,
  getGameSocket,
  joinGameRoom,
  leaveGameRoom,
  snapshotToRound,
} from '@/lib/gameGateway';
import { reportGameWin } from '@/lib/flutter-bridge';
import { fetchUserCoins } from '@/lib/applyWinBalance';
import {
  wouldExceedOptionCap,
  betCapToast,
  parseBetRpcError,
} from '@/lib/betOptionCap';
import {
  BET_OPTIONS,
  GAME_NAME,
  GAME_SLUG,
  optionById,
} from './config';
import { resolveAvatarUrl, seatDisplayName } from '@/lib/teenPatti/avatar';

export type GameRound = {
  id: string;
  status: string | null;
  winner_result?: string | null;
  winner_user_id?: string | null;
  betting_ends_at?: string | null;
  spinning_ends_at?: string | null;
  round_ends_at?: string | null;
  round_number?: number | null;
  game_id?: string | null;
  pot?: number;
  boot_amount?: number;
};

export type RoundTopWinner = {
  userId: string;
  name: string;
  avatar: string;
  win: number;
};

type Listener<T = unknown> = (payload: T) => void;

export type ControllerEvents = {
  ready: {
    userId: string | null;
    gameId: string | null;
    balance: number;
    history: string[];
    todayProfit: number;
    round: GameRound | null;
  };
  balance: number;
  profit: number;
  bets: Record<string, number>;
  round: GameRound | null;
  countdown: number;
  socket: boolean;
  toast: string;
  muted: boolean;
  selectedChip: number;
  ping: number;
  startBetting: void;
  spinStart: { winnerId: string; roundId: string; winIndex: number };
  spinIndex: number;
  spinComplete: {
    winnerId: string;
    winCoins: number;
    userBetOnWinner: number;
    topWinners: RoundTopWinner[];
  };
  history: string[];
  bettingCleared: void;
  loadProgress: number;
};

function phaseKey(snap: GameLiveSnapshot) {
  return [
    snap.round_id || '',
    snap.status || '',
    snap.phase_ends_at || snap.betting_ends_at || '',
    snap.winner_result || '',
    snap.winner_user_id || '',
  ].join('|');
}

/**
 * Non-React controller for Lucky 777 Phaser + HTML HUD.
 */
export class TeenPattiController {
  private listeners = new Map<string, Set<Listener>>();

  userId: string | null = null;
  gameId: string | null = null;
  balance = 0;
  todayProfit = 0;
  currentBets: Record<string, number> = {};
  currentRound: GameRound | null = null;
  history: string[] = [];
  selectedChip = 200;
  isMuted = false;
  pingMs = 12;
  socketConnected = false;
  isSpinning = false;

  private destroyed = false;
  private lastWinner: string | null = null;
  private spinningForRound: string | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private tickAudio: HTMLAudioElement | null = null;
  private chipSelectAudio: HTMLAudioElement | null = null;
  private spinTickAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private endsAtMs: number | null = null;
  private skewMs = 0;
  private lastSeq = 0;
  private lastStatus: string | null = null;
  private lastRoundId: string | null = null;
  private lastPhaseKey = '';
  private lastDbPollAt = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private roundPollTimer: ReturnType<typeof setInterval> | null = null;
  private balanceChannel: ReturnType<typeof supabase.channel> | null = null;
  private roundsChannel: ReturnType<typeof supabase.channel> | null = null;
  private socketCleanup: (() => void) | null = null;

  on<K extends keyof ControllerEvents>(
    event: K,
    fn: Listener<ControllerEvents[K]>,
  ): () => void {
    const key = event as string;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn as Listener);
    return () => this.listeners.get(key)?.delete(fn as Listener);
  }

  private emit<K extends keyof ControllerEvents>(
    event: K,
    payload: ControllerEvents[K],
  ) {
    if (this.destroyed) return;
    this.listeners.get(event as string)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('[TeenPattiController]', event, e);
      }
    });
  }

  async start() {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    let user = await applyWebViewAccessToken(token);
    if (!user) {
      const {
        data: { user: existing },
      } = await supabase.auth.getUser();
      user = existing;
    }
    if (user) {
      this.userId = user.id;
      await this.refreshBalance();
    }

    const { data: configData } = await supabase
      .from('game_configs')
      .select('id')
      .eq('slug', GAME_SLUG)
      .single();

    let round: GameRound | null = null;
    if (configData) {
      this.gameId = configData.id;

      const { data: histData } = await supabase
        .from('game_rounds')
        .select('winner_result')
        .eq('game_id', configData.id)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(10);
      if (histData) {
        this.history = histData
          .map((h) => h.winner_result)
          .filter(Boolean)
          .reverse() as string[];
      }

      if (this.userId) await this.refreshProfit();

      const { data: roundData } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('game_id', configData.id)
        .neq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (roundData) {
        this.applyLiveRound(roundData as GameRound, true);
        round = this.currentRound;
      }
    }

    this.subscribeBalance();
    this.connectSocket();
    this.startRoundFallback();
    this.startCountdownLoop();
    this.pingTimer = setInterval(() => {
      this.pingMs = 8 + Math.floor(Math.random() * 25);
      this.emit('ping', this.pingMs);
    }, 4000);

    this.emit('ready', {
      userId: this.userId,
      gameId: this.gameId,
      balance: this.balance,
      history: [...this.history],
      todayProfit: this.todayProfit,
      round,
    });
  }

  destroy() {
    this.destroyed = true;
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.roundPollTimer) clearInterval(this.roundPollTimer);
    this.socketCleanup?.();
    this.socketCleanup = null;
    if (this.balanceChannel) {
      void supabase.removeChannel(this.balanceChannel);
      this.balanceChannel = null;
    }
    if (this.roundsChannel) {
      void supabase.removeChannel(this.roundsChannel);
      this.roundsChannel = null;
    }
    this.listeners.clear();
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    this.emit('muted', muted);
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
  }

  setSelectedChip(amount: number) {
    this.unlockAudio();
    const changed = amount !== this.selectedChip;
    this.selectedChip = amount;
    if (changed) this.emit('selectedChip', amount);
    this.playSound('/fruit-party/sounds/chip_select.mp3');
  }

  setLoadProgress(pct: number) {
    this.emit('loadProgress', Math.max(0, Math.min(100, Math.floor(pct))));
  }

  /** Call from first user tap — required for iOS/Android WebView audio. */
  unlockAudio() {
    if (typeof Audio === 'undefined') return;
    try {
      if (!this.chipSelectAudio) {
        this.chipSelectAudio = new Audio(
          '/fruit-party/sounds/chip_select.mp3',
        );
        this.chipSelectAudio.preload = 'auto';
        this.chipSelectAudio.volume = 0.55;
        this.chipSelectAudio.load();
      }
      if (!this.spinTickAudio) {
        this.spinTickAudio = new Audio('/fruit-party/sounds/spin_tick.mp3');
        this.spinTickAudio.preload = 'auto';
        this.spinTickAudio.volume = 0.5;
        this.spinTickAudio.load();
      }
      if (!this.tickAudio) {
        this.tickAudio = new Audio('/sounds/bet.mp3');
        this.tickAudio.preload = 'auto';
        this.tickAudio.volume = 0.45;
        this.tickAudio.load();
      }
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      // Warm under user gesture — do NOT pause (that races chip play on mobile).
      const warm = this.chipSelectAudio;
      const prev = warm.volume;
      warm.volume = 0.001;
      void warm
        .play()
        .then(() => {
          warm.volume = prev || 0.55;
        })
        .catch(() => {
          this.audioUnlocked = false;
          warm.volume = prev || 0.55;
        });
    } catch {
      this.audioUnlocked = false;
    }
  }

  playSound(soundName: string) {
    if (this.isMuted) return;
    try {
      if (
        soundName === 'spin_tick.mp3' ||
        soundName === '/fruit-party/sounds/spin_tick.mp3'
      ) {
        if (!this.spinTickAudio) {
          this.spinTickAudio = new Audio('/fruit-party/sounds/spin_tick.mp3');
          this.spinTickAudio.volume = 0.5;
        }
        const a = this.spinTickAudio;
        a.volume = 0.5;
        a.currentTime = 0;
        void a.play().catch(() => {});
        return;
      }
      if (
        soundName === '/fruit-party/sounds/chip_select.mp3' ||
        soundName === 'chip_select.mp3'
      ) {
        if (!this.chipSelectAudio) {
          this.chipSelectAudio = new Audio(
            '/fruit-party/sounds/chip_select.mp3',
          );
          this.chipSelectAudio.volume = 0.55;
        }
        const a = this.chipSelectAudio;
        a.volume = 0.55;
        try {
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
        void a.play().catch(() => {
          this.audioUnlocked = false;
        });
        return;
      }
      const src = soundName.startsWith('/')
        ? soundName
        : `/sounds/${soundName}`;
      if (
        soundName === 'tick.mp3' ||
        soundName === '/sounds/bet.mp3' ||
        soundName === 'bet.mp3'
      ) {
        if (!this.tickAudio) {
          this.tickAudio = new Audio('/sounds/bet.mp3');
          this.tickAudio.volume = 0.45;
        }
        const a = this.tickAudio;
        a.volume = soundName === 'bet.mp3' ? 0.35 : 0.45;
        a.currentTime = 0;
        void a.play().catch(() => {});
        return;
      }
      const audio = new Audio(src);
      audio.volume = 0.55;
      void audio.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  toast(msg: string) {
    this.emit('toast', msg);
  }

  placeBetOnOption(optionId: string) {
    this.unlockAudio();
    if (!this.userId) {
      this.toast('Open game from the app to bet');
      return;
    }
    if (!this.currentRound || this.currentRound.status !== 'betting') {
      this.toast('Wait for next betting round');
      return;
    }
    if (this.isSpinning) return;
    if (this.balance < this.selectedChip) {
      this.toast('Not enough coins');
      return;
    }
    void this.placeBetAmount(optionId, this.selectedChip);
  }

  async placeBetAmount(optionId: string, amount: number): Promise<boolean> {
    const round = this.currentRound;
    if (!round || round.status !== 'betting' || this.isSpinning || amount <= 0) {
      return false;
    }
    if (this.balance < amount) return false;

    if (wouldExceedOptionCap(this.currentBets, optionId, BET_OPTIONS.length)) {
      this.toast(betCapToast(BET_OPTIONS.length));
      return false;
    }

    const prevBalance = this.balance;
    const prevBets = { ...this.currentBets };

    this.balance -= amount;
    this.currentBets = {
      ...this.currentBets,
      [optionId]: (this.currentBets[optionId] || 0) + amount,
    };
    this.emit('balance', this.balance);
    this.emit('bets', { ...this.currentBets });
    this.playSound('bet.mp3');

    const { error, balance } = await placeBetUnified({
      slug: GAME_SLUG,
      roundId: round.id,
      option: optionId,
      amount,
    });
    if (balance != null) {
      this.balance = balance;
      this.emit('balance', this.balance);
    }
    if (error) {
      console.error('[TeenPatti] place_game_bet', error);
      this.balance = prevBalance;
      this.currentBets = prevBets;
      this.emit('balance', this.balance);
      this.emit('bets', { ...this.currentBets });
      this.toast(parseBetRpcError(error));
      if (this.userId) await this.refreshBalance();
      return false;
    }
    return true;
  }

  private async refreshBalance() {
    if (!this.userId) return;
    const coins = await fetchUserCoins(this.userId);
    if (coins == null) return;
    this.balance = coins;
    this.emit('balance', this.balance);
  }

  private async refreshProfit() {
    if (!this.userId || !this.gameId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('game_bets')
      .select('amount, payout_amount, game_rounds!inner(game_id)')
      .eq('user_id', this.userId)
      .eq('game_rounds.game_id', this.gameId)
      .gte('created_at', today.toISOString());
    if (data) {
      this.todayProfit = data.reduce(
        (acc, b) => acc + (b.payout_amount || 0) - b.amount,
        0,
      );
      this.emit('profit', this.todayProfit);
    }
  }

  private seedClockFromRound(round: GameRound | null) {
    if (!round || round.status !== 'betting') return;
    const ends = round.betting_ends_at || round.round_ends_at;
    if (!ends) return;
    this.endsAtMs = new Date(ends).getTime();
  }

  private startCountdownLoop() {
    this.countdownTimer = setInterval(() => {
      if (this.endsAtMs == null) {
        this.emit('countdown', 0);
        // Stuck in spinning with no reveal — keep polling for phase changes.
        if (
          this.currentRound?.status === 'spinning' &&
          !this.isSpinning &&
          this.spinningForRound !== this.currentRound.id
        ) {
          void this.pollRoundFromDb();
        }
        return;
      }
      const nowAligned = Date.now() - this.skewMs;
      const sec = Math.max(0, Math.ceil((this.endsAtMs - nowAligned) / 1000));
      this.emit('countdown', sec);
      // Betting clock hit zero — refresh DB (throttled inside poll).
      if (
        sec === 0 &&
        this.currentRound?.status === 'betting' &&
        !this.isSpinning
      ) {
        void this.pollRoundFromDb();
      }
    }, 250);
  }

  private subscribeBalance() {
    if (!this.userId) return;
    this.balanceChannel = supabase
      .channel(`teen_patti_phaser_user_${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${this.userId}`,
        },
        (payload) => {
          const coins = (payload.new as { coins?: number })?.coins;
          if (typeof coins === 'number') {
            this.balance = coins;
            this.emit('balance', this.balance);
          }
        },
      )
      .subscribe();
  }

  private connectSocket() {
    if (!this.gameId) return;
    const slug = GAME_SLUG;
    const token = getAuthTokenFromUrl();
    const socket = getGameSocket(token);

    const onConnect = async () => {
      this.socketConnected = true;
      this.emit('socket', true);
      const res = await joinGameRoom(socket, slug);
      if (!res.ok) {
        console.warn('[gameSocket] join failed:', res.error);
      }
    };
    const onDisconnect = () => {
      this.socketConnected = false;
      this.emit('socket', false);
    };
    const onSnapshot = (snap: GameLiveSnapshot) =>
      this.applySocketSnapshot(snap, true);
    const onEvent = (snap: GameLiveSnapshot) =>
      this.applySocketSnapshot(snap, false);
    const onConnectError = (err: Error) => {
      this.socketConnected = false;
      this.emit('socket', false);
      console.warn('[gameSocket] connect_error:', err?.message || err);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('game:snapshot', onSnapshot);
    socket.on('game:event', onEvent);

    if (socket.connected) void onConnect();

    this.socketCleanup = () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('game:snapshot', onSnapshot);
      socket.off('game:event', onEvent);
      leaveGameRoom(socket, slug);
    };
  }

  private startRoundFallback() {
    if (!this.gameId) return;

    void this.pollRoundFromDb();
    // Always poll — socket can be "connected" but miss teen_patti phase
    // fan-out (or publish stale/empty). DB is source of truth for status.
    this.roundPollTimer = setInterval(() => {
      if (this.destroyed) return;
      void this.pollRoundFromDb();
    }, 1200);

    this.roundsChannel = supabase
      .channel(`teen_patti_phaser_rounds_${this.gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rounds',
          filter: `game_id=eq.${this.gameId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as GameRound | undefined;
          if (!row?.id) return;
          if (payload.eventType === 'DELETE') return;
          this.applyLiveRound(row as GameRound, true);
        },
      )
      .subscribe();
  }

  private async pollRoundFromDb() {
    if (!this.gameId || this.destroyed) return;
    const now = Date.now();
    if (now - this.lastDbPollAt < 700) return;
    this.lastDbPollAt = now;

    const { data, error } = await supabase
      .from('game_rounds')
      .select(
        'id, status, winner_result, winner_user_id, betting_ends_at, spinning_ends_at, round_ends_at, round_number, game_id, pot, boot_amount',
      )
      .eq('game_id', this.gameId)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (this.destroyed) return;
    if (error) {
      console.warn('[teen_patti] poll failed:', error.message);
      return;
    }
    if (!data) return;
    this.applyLiveRound(data as GameRound, false);
  }

  /** Prefer newer rounds so stale socket snapshots cannot rewind the clock. */
  private roundRank(round: GameRound): number {
    const t = Date.parse(
      round.betting_ends_at ||
        round.spinning_ends_at ||
        round.round_ends_at ||
        '',
    );
    return Number.isFinite(t) ? t : 0;
  }

  private shouldAcceptRound(round: GameRound): boolean {
    if (!this.currentRound?.id) return true;
    if (round.id === this.currentRound.id) return true;
    return this.roundRank(round) >= this.roundRank(this.currentRound);
  }

  private applySocketSnapshot(snap: GameLiveSnapshot, force = false) {
    if (!snap || snap.empty) return;
    const seq = Number(snap.seq || 0);
    if (!force && seq > 0 && seq <= this.lastSeq) return;
    if (seq > 0) this.lastSeq = seq;

    const key = phaseKey(snap);
    if (!force && key === this.lastPhaseKey) return;

    if (snap.server_now) {
      const serverMs = new Date(snap.server_now).getTime();
      if (Number.isFinite(serverMs)) {
        this.skewMs = Date.now() - serverMs;
      }
    }

    const round = snapshotToRound(snap);
    if (!round) return;
    this.applyLiveRound(
      {
        ...round,
        status: round.status ?? null,
        game_id: this.gameId,
      },
      force,
      key,
    );
  }

  private applyLiveRound(
    round: GameRound,
    force = false,
    phaseKeyOverride?: string,
  ) {
    if (!round?.id) return;
    if (!this.shouldAcceptRound(round)) return;

    const key =
      phaseKeyOverride ||
      [
        round.id,
        round.status || '',
        round.betting_ends_at || round.spinning_ends_at || '',
        round.winner_result || '',
      ].join('|');

    const phaseChanged = key !== this.lastPhaseKey;
    if (!force && !phaseChanged) {
      if (round.status === 'betting') this.seedClockFromRound(round);
      // Same spinning snapshot again — still try reveal if we never started.
      if (
        round.status === 'spinning' &&
        round.winner_result &&
        this.spinningForRound !== round.id
      ) {
        this.onSpinningPhase(round);
      }
      return;
    }
    this.lastPhaseKey = key;

    const ends =
      round.status === 'betting'
        ? round.betting_ends_at || round.round_ends_at
        : null;
    this.endsAtMs = ends ? new Date(ends).getTime() : null;
    if (round.status !== 'betting') {
      this.emit('countdown', 0);
    }

    const prevStatus = this.lastStatus;
    const prevRoundId = this.lastRoundId;
    const isHydrate = prevStatus === null && prevRoundId === null;
    const statusChanged =
      round.status !== prevStatus || round.id !== prevRoundId;
    this.lastStatus = round.status || null;
    this.lastRoundId = round.id || null;

    this.currentRound = {
      ...(this.currentRound || {}),
      ...round,
      id: round.id,
      status: round.status ?? null,
      game_id: this.gameId || round.game_id || this.currentRound?.game_id,
    };
    this.emit('round', this.currentRound);

    if (round.status === 'betting') {
      this.seedClockFromRound(round);
      if (statusChanged && !isHydrate) {
        this.onBettingPhase();
      }
    } else if (round.status === 'spinning') {
      // Always attempt reveal (including first hydrate mid-spin).
      this.onSpinningPhase(round);
    }
  }

  private clearRevealTimer() {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  private onBettingPhase() {
    this.spinningForRound = null;
    this.clearRevealTimer();
    this.isSpinning = false;

    if (this.lastWinner) {
      this.history = [...this.history.slice(-9), this.lastWinner];
      this.emit('history', [...this.history]);
    }

    void this.refreshProfit();
    void this.refreshBalance();

    this.currentBets = {};
    this.emit('bets', {});
    this.emit('bettingCleared', undefined as void);

    window.setTimeout(() => {
      this.emit('startBetting', undefined as void);
      this.playSound('start_betting.mp3');
    }, 400);
  }

  private onSpinningPhase(round: {
    id: string;
    winner_result?: string | null;
  }) {
    if (round.winner_result && round.id) {
      this.triggerSpin(round.winner_result, round.id);
    }
  }

  private triggerSpin(winnerId: string, roundId: string) {
    if (this.spinningForRound === roundId) return;
    this.spinningForRound = roundId;
    this.clearRevealTimer();

    let winIdx = BET_OPTIONS.findIndex((o) => o.id === winnerId);
    if (winIdx < 0) winIdx = 0;
    this.isSpinning = true;
    this.emit('spinStart', { winnerId, roundId, winIndex: winIdx });
    this.playSound('/fruit-party/sounds/spin_start.mp3');

    const topPromise = this.fetchTopWinners(roundId, winnerId);

    // Card flips are ~9×320ms. Keep reveal inside the ~8s spinning window
    // so the next betting timer is not blocked by a cancelled long animation.
    const REVEAL_MS = 3200;

    const finish = () => {
      void (async () => {
        if (this.destroyed || this.spinningForRound !== roundId) return;
        this.revealTimer = null;
        this.lastWinner = winnerId;
        this.isSpinning = false;
        this.playSound('win.mp3');

        const winningItem = optionById(winnerId);
        const userBetOnWinner = this.currentBets[winnerId] || 0;
        const winCoins = userBetOnWinner * (winningItem?.multiplier || 0);

        if (winCoins > 0) {
          reportGameWin({
            gameSlug: GAME_SLUG,
            gameName: GAME_NAME,
            winCoins,
            multiplier: winningItem?.multiplier || 1,
            betAmount: userBetOnWinner,
          });
          this.balance += winCoins;
          this.emit('balance', this.balance);
          const uid = this.userId;
          if (uid) {
            window.setTimeout(() => {
              void fetchUserCoins(uid).then((coins) => {
                if (coins == null || this.destroyed) return;
                this.balance = coins;
                this.emit('balance', this.balance);
              });
            }, 700);
          }
        }

        let topWinners = await topPromise;
        if (!this.destroyed && topWinners.length === 0) {
          await new Promise((r) => window.setTimeout(r, 400));
          if (!this.destroyed) {
            topWinners = await this.fetchTopWinners(roundId, winnerId);
          }
        }

        if (this.destroyed || this.spinningForRound !== roundId) return;
        this.emit('spinComplete', {
          winnerId,
          winCoins,
          userBetOnWinner,
          topWinners,
        });
      })();
    };

    this.revealTimer = setTimeout(finish, REVEAL_MS);
  }

  /** Top 5 winners on the winning party (by payout / bet×mult). */
  private async fetchTopWinners(
    roundId: string,
    winnerId: string,
  ): Promise<RoundTopWinner[]> {
    const mult = optionById(winnerId)?.multiplier || 3;
    const { data: winBets } = await supabase
      .from('game_bets')
      .select('user_id, amount, payout_amount, is_win')
      .eq('round_id', roundId)
      .eq('bet_option', winnerId);

    const byUser = new Map<string, number>();
    for (const row of winBets || []) {
      const uid = row.user_id as string;
      if (!uid) continue;
      const amount = Number(row.amount) || 0;
      const win =
        row.is_win && row.payout_amount != null
          ? Number(row.payout_amount) || 0
          : amount * mult;
      byUser.set(uid, (byUser.get(uid) || 0) + win);
    }

    const ranked = [...byUser.entries()]
      .map(([userId, win]) => ({ userId, win }))
      .sort((a, b) => b.win - a.win)
      .slice(0, 5);

    if (ranked.length === 0) return [];

    const { data: users } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in(
        'id',
        ranked.map((r) => r.userId),
      );

    const userMap = new Map(
      (users || []).map((u) => [
        u.id as string,
        {
          username: u.username as string | null,
          avatar_url: u.avatar_url as string | null,
        },
      ]),
    );

    return ranked.map((r) => {
      const u = userMap.get(r.userId);
      return {
        userId: r.userId,
        name: seatDisplayName(u?.username, 'Player'),
        avatar: resolveAvatarUrl(u?.avatar_url, r.userId),
        win: r.win,
      };
    });
  }
}
