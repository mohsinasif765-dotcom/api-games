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
  startSmoothBoardSpin,
  type SmoothBoardSpinHandle,
} from '@/lib/smoothBoardSpin';
import {
  FRUIT_ITEMS,
  GAME_NAME,
  GAME_SLUG,
  SPIN_ORDER,
  fruitById,
} from './config';

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

type Listener<T = unknown> = (payload: T) => void;

export type ControllerEvents = {
  ready: {
    userId: string | null;
    gameId: string | null;
    balance: number;
    maxBet: number;
    history: string[];
    todayProfit: number;
    round: GameRound | null;
  };
  balance: number;
  profit: number;
  bets: { current: Record<string, number>; all: Record<string, number> };
  round: GameRound | null;
  countdown: number;
  socket: boolean;
  toast: string;
  muted: boolean;
  autoBet: boolean;
  selectedChip: number;
  ping: number;
  startBetting: void;
  spinStart: { winnerId: string; roundId: string };
  spinIndex: number;
  spinComplete: {
    winnerId: string;
    winCoins: number;
    userBetOnWinner: number;
  };
  history: string[];
  bettingCleared: void;
  chipFly: {
    optionId: string;
    amount: number;
    from: 'self' | 'room';
  };
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
 * Non-React controller: auth, config, socket rounds, bets → events for Phaser scenes.
 */
export class FruitPartyController {
  private listeners = new Map<string, Set<Listener>>();

  userId: string | null = null;
  gameId: string | null = null;
  balance = 0;
  maxBet = 500000;
  todayProfit = 0;
  currentBets: Record<string, number> = {};
  allBets: Record<string, number> = {};
  lastBets: Record<string, number> = {};
  currentRound: GameRound | null = null;
  history: string[] = [];
  selectedChip = 1000;
  isMuted = false;
  autoBet = false;
  pingMs = 12;
  socketConnected = false;
  isSpinning = false;

  private destroyed = false;
  private autoPlacedForRound: string | null = null;
  private lastWinner: string | null = null;
  private spinningForRound: string | null = null;
  private spinHandle: SmoothBoardSpinHandle | null = null;
  private pageJustLoaded = true;
  private tickAudio: HTMLAudioElement | null = null;
  private spinTickAudio: HTMLAudioElement | null = null;
  private chipSelectAudio: HTMLAudioElement | null = null;
  private betPlaceAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private endsAtMs: number | null = null;
  private skewMs = 0;
  private lastSeq = 0;
  private lastStatus: string | null = null;
  private lastRoundId: string | null = null;
  private lastPhaseKey = '';
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private roundPollTimer: ReturnType<typeof setInterval> | null = null;
  private loadGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private balanceChannel: ReturnType<typeof supabase.channel> | null = null;
  private betsChannel: ReturnType<typeof supabase.channel> | null = null;
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
        console.error('[FruitPartyController]', event, e);
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
      .select('id, max_bet, config_data')
      .eq('slug', GAME_SLUG)
      .single();

    let round: GameRound | null = null;
    if (configData) {
      this.gameId = configData.id;
      if (configData.max_bet) this.maxBet = configData.max_bet;

      const { data: histData } = await supabase
        .from('game_rounds')
        .select('winner_result')
        .eq('game_id', configData.id)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(12);
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
        round = roundData as GameRound;
        this.currentRound = round;
        this.seedClockFromRound(round);
      }
    }

    this.subscribeBalance();
    this.subscribeBets();
    this.connectSocket();
    this.startRoundFallback();
    this.startCountdownLoop();
    this.pingTimer = setInterval(() => {
      this.pingMs = 8 + Math.floor(Math.random() * 25);
      this.emit('ping', this.pingMs);
    }, 4000);

    this.loadGraceTimer = setTimeout(() => {
      this.pageJustLoaded = false;
      // If we loaded mid-spin, play the spin once grace ends
      const r = this.currentRound;
      if (r?.status === 'spinning' && r.winner_result && r.id) {
        this.triggerSpin(r.winner_result, r.id);
      }
    }, 1500);

    this.emit('ready', {
      userId: this.userId,
      gameId: this.gameId,
      balance: this.balance,
      maxBet: this.maxBet,
      history: [...this.history],
      todayProfit: this.todayProfit,
      round,
    });
  }

  destroy() {
    this.destroyed = true;
    this.spinHandle?.cancel();
    this.spinHandle = null;
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.roundPollTimer) clearInterval(this.roundPollTimer);
    if (this.loadGraceTimer) clearTimeout(this.loadGraceTimer);
    this.socketCleanup?.();
    this.socketCleanup = null;
    if (this.balanceChannel) {
      void supabase.removeChannel(this.balanceChannel);
      this.balanceChannel = null;
    }
    if (this.betsChannel) {
      void supabase.removeChannel(this.betsChannel);
      this.betsChannel = null;
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

  setAutoBet(on: boolean) {
    this.autoBet = on;
    this.emit('autoBet', on);
  }

  toggleAutoBet() {
    this.setAutoBet(!this.autoBet);
  }

  /** Call from first user tap — required for iOS/Android WebView audio. */
  unlockAudio() {
    if (this.audioUnlocked || typeof Audio === 'undefined') return;
    this.audioUnlocked = true;
    try {
      if (!this.chipSelectAudio) {
        this.chipSelectAudio = new Audio('/fruit-party/sounds/chip_select.mp3');
        this.chipSelectAudio.preload = 'auto';
        this.chipSelectAudio.load();
      }
      if (!this.betPlaceAudio) {
        this.betPlaceAudio = new Audio('/fruit-party/sounds/bet_place.mp3');
        this.betPlaceAudio.preload = 'auto';
        this.betPlaceAudio.load();
      }
      if (!this.spinTickAudio) {
        this.spinTickAudio = new Audio('/fruit-party/sounds/spin_tick.mp3');
        this.spinTickAudio.preload = 'auto';
        this.spinTickAudio.volume = 0.5;
        this.spinTickAudio.load();
      }
      // Warm-up play under user gesture (muted), then reset
      const warm = this.chipSelectAudio;
      const prev = warm.volume;
      warm.volume = 0.001;
      void warm
        .play()
        .then(() => {
          warm.pause();
          warm.currentTime = 0;
          warm.volume = 0.55;
        })
        .catch(() => {
          warm.volume = prev || 0.55;
        });
    } catch {
      /* ignore */
    }
  }

  playSound(soundName: string) {
    if (this.isMuted) return;
    try {
      // Spin highlight ticks — short reused clip
      if (
        soundName === 'spin_tick.mp3' ||
        soundName === '/fruit-party/sounds/spin_tick.mp3'
      ) {
        if (!this.spinTickAudio) {
          this.spinTickAudio = new Audio('/fruit-party/sounds/spin_tick.mp3');
          this.spinTickAudio.volume = 0.5;
        }
        const a = this.spinTickAudio;
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
        a.currentTime = 0;
        void a.play().catch(() => {});
        return;
      }

      if (
        soundName === '/fruit-party/sounds/bet_place.mp3' ||
        soundName === 'bet_place.mp3'
      ) {
        if (!this.betPlaceAudio) {
          this.betPlaceAudio = new Audio('/fruit-party/sounds/bet_place.mp3');
          this.betPlaceAudio.volume = 0.55;
        }
        const a = this.betPlaceAudio;
        a.volume = 0.55;
        a.currentTime = 0;
        void a.play().catch(() => {});
        return;
      }

      const src = soundName.startsWith('/')
        ? soundName
        : `/sounds/${soundName}`;

      if (soundName === 'bet.mp3' || soundName === 'tick.mp3') {
        if (!this.tickAudio) {
          this.tickAudio = new Audio(src);
          this.tickAudio.volume = 0.4;
        }
        const a = this.tickAudio;
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

  async placeBetAmount(
    optionId: string,
    amount: number,
  ): Promise<boolean> {
    const round = this.currentRound;
    if (!round || round.status !== 'betting' || this.isSpinning || amount <= 0) {
      return false;
    }
    if (this.balance < amount) return false;
    if (amount > this.maxBet) return false;

    if (
      wouldExceedOptionCap(this.currentBets, optionId, FRUIT_ITEMS.length)
    ) {
      this.toast(betCapToast(FRUIT_ITEMS.length));
      return false;
    }

    const prevBalance = this.balance;
    const prevBets = { ...this.currentBets };
    const prevAll = { ...this.allBets };

    this.balance -= amount;
    this.currentBets = {
      ...this.currentBets,
      [optionId]: (this.currentBets[optionId] || 0) + amount,
    };
    this.lastBets = { ...this.currentBets };
    this.allBets = {
      ...this.allBets,
      [optionId]: (this.allBets[optionId] || 0) + amount,
    };
    this.emit('balance', this.balance);
    this.emitBets();
    this.emit('chipFly', { optionId, amount, from: 'self' });
    this.playSound('/fruit-party/sounds/bet_place.mp3');

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
      console.error('[FruitParty] place_game_bet', error);
      this.balance = prevBalance;
      this.currentBets = prevBets;
      this.allBets = prevAll;
      this.emit('balance', this.balance);
      this.emitBets();
      this.toast(parseBetRpcError(error));
      if (this.userId) await this.refreshBalance();
      return false;
    }
    return true;
  }

  private emitBets() {
    this.emit('bets', {
      current: { ...this.currentBets },
      all: { ...this.allBets },
    });
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
        return;
      }
      const nowAligned = Date.now() - this.skewMs;
      const sec = Math.max(0, Math.ceil((this.endsAtMs - nowAligned) / 1000));
      this.emit('countdown', sec);
    }, 200);
  }

  private subscribeBalance() {
    if (!this.userId) return;
    this.balanceChannel = supabase
      .channel(`fruit_party_phaser_user_${this.userId}`)
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

  private subscribeBets() {
    if (!this.gameId) return;
    this.betsChannel = supabase
      .channel('fruit_party_phaser_bets')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_bets' },
        (payload) => {
          const bet = payload.new as {
            round_id?: string;
            bet_option?: string;
            amount?: number;
            user_id?: string;
          };
          if (bet.round_id !== this.currentRound?.id || !bet.bet_option) return;

          const amt = bet.amount || 0;
          const isSelf = !!this.userId && bet.user_id === this.userId;

          // Own bets already counted optimistically — only animate/add others
          if (!isSelf) {
            this.allBets = {
              ...this.allBets,
              [bet.bet_option]: (this.allBets[bet.bet_option] || 0) + amt,
            };
            this.emitBets();
            if (amt > 0) {
              this.emit('chipFly', {
                optionId: bet.bet_option,
                amount: amt,
                from: 'room',
              });
              this.playSound('bet.mp3');
            }
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

  /**
   * When gateway auth fails (no token), keep rounds alive via Supabase poll + realtime.
   * Betting still needs login; spectator countdown/spin works without token.
   */
  private startRoundFallback() {
    if (!this.gameId) return;

    void this.pollRoundFromDb();
    this.roundPollTimer = setInterval(() => {
      if (this.destroyed) return;
      // Always poll local Zuvo rounds — Rave Star socket may be connected but empty.
      void this.pollRoundFromDb();
    }, 900);

    this.roundsChannel = supabase
      .channel(`fruit_party_phaser_rounds_${this.gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rounds',
          filter: `game_id=eq.${this.gameId}`,
        },
        (payload) => {
          if (this.socketConnected) return;
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
    const { data } = await supabase
      .from('game_rounds')
      .select(
        'id, status, winner_result, winner_user_id, betting_ends_at, spinning_ends_at, round_ends_at, round_number, game_id, pot, boot_amount',
      )
      .eq('game_id', this.gameId)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || this.destroyed) return;
    this.applyLiveRound(data as GameRound, false);
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
      // Still refresh clock while betting even if phase key same
      if (round.status === 'betting') this.seedClockFromRound(round);
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

    if (statusChanged && !isHydrate) {
      if (round.status === 'betting') {
        this.onBettingPhase();
      } else if (round.status === 'spinning') {
        this.onSpinningPhase(round);
      }
    } else if (
      !isHydrate &&
      round.status === 'spinning' &&
      round.winner_result &&
      round.id &&
      this.spinningForRound !== round.id &&
      !this.pageJustLoaded
    ) {
      // Winner arrived after status already spinning
      this.onSpinningPhase(round);
    }
  }

  private onBettingPhase() {
    this.spinningForRound = null;
    this.spinHandle?.cancel();
    this.spinHandle = null;
    this.isSpinning = false;

    if (this.lastWinner) {
      this.history = [...this.history.slice(-11), this.lastWinner];
      this.emit('history', [...this.history]);
    }

    void this.refreshProfit();
    void this.refreshBalance();

    this.currentBets = {};
    this.allBets = {};
    this.emitBets();
    this.emit('bettingCleared', undefined as void);

    window.setTimeout(() => {
      this.emit('startBetting', undefined as void);
      this.playSound('start_betting.mp3');
    }, 400);

    this.maybeAutoBet();
  }

  private onSpinningPhase(round: {
    id: string;
    winner_result?: string | null;
  }) {
    if (this.pageJustLoaded) {
      this.isSpinning = true;
      return;
    }
    if (round.winner_result && round.id) {
      this.triggerSpin(round.winner_result, round.id);
    }
  }

  private triggerSpin(winnerId: string, roundId: string) {
    if (this.spinningForRound === roundId) return;
    this.spinningForRound = roundId;
    this.spinHandle?.cancel();

    if (Object.keys(this.currentBets).length > 0) {
      this.lastBets = { ...this.currentBets };
    }

    const winIdx = Math.max(0, SPIN_ORDER.indexOf(winnerId));
    this.isSpinning = true;
    this.emit('spinStart', { winnerId, roundId });
    this.playSound('/fruit-party/sounds/spin_start.mp3');

    const finish = () => {
      this.spinHandle = null;
      this.lastWinner = winnerId;
      this.isSpinning = false;
      this.playSound('win.mp3');

      const winningItem = fruitById(winnerId);
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

      this.emit('spinComplete', {
        winnerId,
        winCoins,
        userBetOnWinner,
      });
    };

    this.spinHandle = startSmoothBoardSpin({
      optionCount: SPIN_ORDER.length,
      winIndex: winIdx,
      durationMs: 5200,
      loops: 5,
      onIndex: (idx) => this.emit('spinIndex', idx),
      onTick: () => this.playSound('spin_tick.mp3'),
      onComplete: finish,
    });
  }

  private maybeAutoBet() {
    const round = this.currentRound;
    if (!round || round.status !== 'betting') return;
    if (!this.autoBet) return;
    if (this.autoPlacedForRound === round.id) return;

    const entries = Object.entries(this.lastBets).filter(([, amt]) => amt > 0);
    if (entries.length === 0) return;

    this.autoPlacedForRound = round.id;

    void (async () => {
      let remaining = this.balance;
      for (const [optionId, amount] of entries) {
        let amt = amount;
        if (amt > this.maxBet) amt = this.maxBet;
        if (amt > remaining) {
          this.setAutoBet(false);
          break;
        }
        const ok = await this.placeBetAmount(optionId, amt);
        if (!ok) {
          this.setAutoBet(false);
          break;
        }
        remaining -= amt;
      }
    })();
  }
}
