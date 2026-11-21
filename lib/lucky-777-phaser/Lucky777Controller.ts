import { supabase } from '@/lib/supabase';
import { placeBetUnified } from '@/lib/placeBet';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import {
  bootstrapPlayerSession,
  usingApiKeyAuth,
} from '@/lib/bootstrapPlayerSession';
import { fetchGameRound, fetchRoundRank } from '@/lib/game-api-client';
import { gamePlayerProfile } from '@/lib/gamePlayerProfile';
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
  BET_OPTIONS,
  WHEEL_SEGMENTS,
  WHEEL_SPIN_TOTAL_MS,
  WHEEL_SPIN_LOOPS,
  SPIN_TICK_MIN_MS,
  GAME_NAME,
  GAME_SLUG,
  optionById,
  pickWinSegmentIndex,
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

export type RoundPodiumPlayer = {
  userId: string;
  name: string;
  avatar: string;
  bet: number | null;
  win: number | null;
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
    profile: { name: string; avatar: string } | null;
  };
  balance: number;
  profit: number;
  profile: { name: string; avatar: string } | null;
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
    /** Top 3 by win amount on the winning option. */
    topWinners: RoundPodiumPlayer[];
    /** Current user stats for bottom bar (null if logged out). */
    me: RoundPodiumPlayer | null;
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
export class Lucky777Controller {
  private listeners = new Map<string, Set<Listener>>();

  userId: string | null = null;
  gameId: string | null = null;
  balance = 0;
  todayProfit = 0;
  currentBets: Record<string, number> = {};
  /** Previous round bets (repeat + win fallback if currentBets cleared). */
  lastPlacedBets: Record<string, number> = {};
  currentRound: GameRound | null = null;
  history: string[] = [];
  selectedChip = 1000;
  isMuted = false;
  pingMs = 12;
  socketConnected = false;
  isSpinning = false;

  private destroyed = false;
  private lastWinner: string | null = null;
  private spinningForRound: string | null = null;
  private spinCompleteForRound: string | null = null;
  /** Bets frozen at spin start — podium/async must not rely on live currentBets. */
  private spinBetsSnapshot: Record<string, number> = {};
  private spinHandle: SmoothBoardSpinHandle | null = null;
  private myProfile: { name: string; avatar: string } | null = null;
  private tenantPlayer = false;
  private pageJustLoaded = true;
  private tickAudio: HTMLAudioElement | null = null;
  private chipSelectAudio: HTMLAudioElement | null = null;
  private spinTickAudio: HTMLAudioElement | null = null;
  private lastSpinTickAt = 0;
  private lastEmittedCountdown: number | null = null;
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
        console.error('[Lucky777Controller]', event, e);
      }
    });
  }

  async start() {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');

    const session = await bootstrapPlayerSession(GAME_SLUG);
    if (session.apiKey && session.playerId) {
      this.userId = session.playerId;
      this.tenantPlayer = true;
      this.setMyProfile(session.username, session.avatarUrl);
      this.balance = session.balance;
      this.emit('balance', this.balance);
    } else {
      let user = await applyWebViewAccessToken(token);
      if (!user) {
        const {
          data: { user: existing },
        } = await supabase.auth.getUser();
        user = existing;
      }
      if (user) {
        this.userId = user.id;
        await Promise.all([this.refreshBalance(), this.refreshMyProfile()]);
      }
    }

    let round: GameRound | null = null;

    if (session.gameId) {
      this.gameId = session.gameId;
      if (session.round?.id) {
        round = session.round as unknown as GameRound;
        this.currentRound = round;
        if (session.serverNow) {
          const serverMs = new Date(session.serverNow).getTime();
          if (Number.isFinite(serverMs)) this.skewMs = Date.now() - serverMs;
        }
        this.seedClockFromRound(round);
        this.applyLiveRound(round, true);
      }
    } else {
      const { data: configData } = await supabase
        .from('game_configs')
        .select('id')
        .eq('slug', GAME_SLUG)
        .single();

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
          round = roundData as GameRound;
          this.currentRound = round;
          this.seedClockFromRound(round);
        }
      }
    }

    if (!usingApiKeyAuth()) this.subscribeBalance();
    if (!usingApiKeyAuth()) this.connectSocket();
    this.startRoundFallback();
    this.startCountdownLoop();
    this.pingTimer = setInterval(() => {
      this.pingMs = 8 + Math.floor(Math.random() * 25);
      this.emit('ping', this.pingMs);
    }, 4000);

    this.loadGraceTimer = setTimeout(() => {
      this.pageJustLoaded = false;
      const r = this.currentRound;
      if (r?.status === 'spinning' && r.winner_result && r.id) {
        this.triggerSpin(r.winner_result, r.id);
      }
    }, 1500);

    this.emit('ready', {
      userId: this.userId,
      gameId: this.gameId,
      balance: this.balance,
      history: [...this.history],
      todayProfit: this.todayProfit,
      round,
      profile: this.myProfile,
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
        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        // Android WebView: currentTime=0+play() is a main-thread stall — cap rate.
        if (now - this.lastSpinTickAt < SPIN_TICK_MIN_MS) return;
        this.lastSpinTickAt = now;
        if (!this.spinTickAudio) {
          this.spinTickAudio = new Audio('/fruit-party/sounds/spin_tick.mp3');
          this.spinTickAudio.volume = 0.5;
          this.spinTickAudio.preload = 'auto';
        }
        const a = this.spinTickAudio;
        a.volume = 0.5;
        try {
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
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
      console.error('[Lucky777] place_game_bet', error);
      // Undo only this bet; the snapshot would also wipe concurrent bets.
      this.balance += amount;
      this.currentBets = {
        ...this.currentBets,
        [optionId]: Math.max(0, (this.currentBets[optionId] || 0) - amount),
      };
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

  get playerProfile(): { name: string; avatar: string } {
    return this.myProfile ?? gamePlayerProfile(null, null, this.userId, 'You');
  }

  private setMyProfile(username?: string | null, avatarUrl?: string | null) {
    this.myProfile = gamePlayerProfile(username, avatarUrl, this.userId, 'You');
    this.emit('profile', this.myProfile);
  }

  private async refreshMyProfile() {
    if (!this.userId) return;
    const { data } = await supabase
      .from('users')
      .select('username, avatar_url')
      .eq('id', this.userId)
      .maybeSingle();
    this.setMyProfile(data?.username, data?.avatar_url);
  }

  private betSnapshotTotal(bets: Record<string, number>): number {
    return Object.values(bets).reduce((a, n) => a + (n || 0), 0);
  }

  private localBetsForRound(): Record<string, number> {
    if (Object.keys(this.spinBetsSnapshot).length > 0) {
      return this.spinBetsSnapshot;
    }
    if (Object.keys(this.currentBets).length > 0) return this.currentBets;
    return this.lastPlacedBets;
  }

  /** payout_amount defaults to 0 in DB — only trust it when > 0. */
  private rowWinAmount(
    row: {
      is_win?: boolean | null;
      payout_amount?: number | string | null;
      amount?: number | string | null;
      bet_option?: string | null;
    },
    winnerId: string,
    mult: number,
  ): number {
    const payout = Number(row.payout_amount);
    if (row.is_win && Number.isFinite(payout) && payout > 0) return payout;
    if (row.bet_option === winnerId) {
      return (Number(row.amount) || 0) * mult;
    }
    return 0;
  }

  /**
   * Top 3 winners on the winning option + current user round totals.
   * Falls back to bet×multiplier / local snapshot when DB payout not ready
   * (settle runs at spinning_ends_at; RLS may also hide others' rows).
   */
  private async fetchRoundPodium(
    roundId: string,
    winnerId: string,
  ): Promise<{ top: RoundPodiumPlayer[]; me: RoundPodiumPlayer | null }> {
    const mult = optionById(winnerId)?.multiplier || 1;
    const localBets = this.localBetsForRound();
    const localBetTotal = this.betSnapshotTotal(localBets);
    const localBetOnWinner = localBets[winnerId] || 0;
    const localWin = localBetOnWinner * mult;

    if (this.tenantPlayer) {
      const rank = await fetchRoundRank(GAME_SLUG, roundId);
      const rows = rank.ok && Array.isArray(rank.data?.rows) ? rank.data.rows : [];
      const top = rows.map((row) => {
        const isMe = row.playerId === this.userId;
        const bet = row.bet ?? (isMe ? localBetOnWinner : null);
        return {
          userId: row.playerId,
          ...(isMe
            ? this.playerProfile
            : gamePlayerProfile(row.username, row.avatarUrl, row.playerId)),
          bet,
          win: row.win ?? null,
        };
      });
      const rankedMe = top.find((player) => player.userId === this.userId);
      const me = this.userId
        ? {
            userId: this.userId,
            ...this.playerProfile,
            bet: Math.max(localBetTotal, rankedMe?.bet ?? 0),
            win: rankedMe?.win ?? localWin,
          }
        : null;
      return { top, me };
    }

    const { data: winBets } = await supabase
      .from('game_bets')
      .select('user_id, amount, payout_amount, is_win, bet_option')
      .eq('round_id', roundId)
      .eq('bet_option', winnerId);

    const byUser = new Map<string, { bet: number; win: number }>();
    for (const row of winBets || []) {
      const uid = row.user_id as string;
      if (!uid) continue;
      const cur = byUser.get(uid) || { bet: 0, win: 0 };
      const amount = Number(row.amount) || 0;
      cur.bet += amount;
      cur.win += this.rowWinAmount(row, winnerId, mult);
      byUser.set(uid, cur);
    }

    const ranked = [...byUser.entries()]
      .map(([userId, v]) => ({ userId, bet: v.bet, win: v.win }))
      .sort((a, b) => b.win - a.win || b.bet - a.bet);

    const topSlice = ranked.slice(0, 3);
    const needIds = new Set(topSlice.map((r) => r.userId));
    if (this.userId) needIds.add(this.userId);

    let userMap = new Map<
      string,
      { username?: string | null; avatar_url?: string | null }
    >();
    if (needIds.size > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', [...needIds]);
      userMap = new Map(
        (users || []).map((u) => [
          u.id as string,
          {
            username: u.username as string | null,
            avatar_url: u.avatar_url as string | null,
          },
        ]),
      );
    }

    const toPlayer = (
      userId: string,
      bet: number,
      win: number,
    ): RoundPodiumPlayer => {
      const u = userMap.get(userId);
      const isMe = userId === this.userId;
      return {
        userId,
        ...(isMe && this.myProfile
          ? this.myProfile
          : gamePlayerProfile(
              u?.username,
              u?.avatar_url,
              userId,
              isMe ? 'You' : 'Player',
            )),
        bet,
        win,
      };
    };

    const top = topSlice.map((r) => toPlayer(r.userId, r.bet, r.win));

    let me: RoundPodiumPlayer | null = null;
    if (this.userId) {
      const myWinRow = byUser.get(this.userId);
      let betTotal = localBetTotal;
      let winTotal = myWinRow?.win ?? 0;

      const { data: myRows } = await supabase
        .from('game_bets')
        .select('amount, payout_amount, is_win, bet_option')
        .eq('round_id', roundId)
        .eq('user_id', this.userId);
      if (myRows && myRows.length > 0) {
        betTotal = myRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        winTotal = myRows.reduce(
          (a, r) => a + this.rowWinAmount(r, winnerId, mult),
          0,
        );
      }

      // DB settle / RLS lag → keep local win so popup is not Win: 0.
      if (winTotal <= 0 && localWin > 0) winTotal = localWin;
      if (betTotal <= 0 && localBetTotal > 0) betTotal = localBetTotal;

      me = toPlayer(this.userId, betTotal, winTotal);
    }

    return { top, me };
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
        if (this.lastEmittedCountdown !== 0) {
          this.lastEmittedCountdown = 0;
          this.emit('countdown', 0);
        }
        return;
      }
      const nowAligned = Date.now() - this.skewMs;
      const sec = Math.max(0, Math.ceil((this.endsAtMs - nowAligned) / 1000));
      if (sec === this.lastEmittedCountdown) return;
      this.lastEmittedCountdown = sec;
      this.emit('countdown', sec);
    }, 200);
  }

  private subscribeBalance() {
    if (!this.userId) return;
    this.balanceChannel = supabase
      .channel(`football_phaser_user_${this.userId}`)
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
    this.roundPollTimer = setInterval(() => {
      if (this.destroyed) return;
      void this.pollRoundFromDb();
    }, 900);

    this.roundsChannel = supabase
      .channel(`football_phaser_rounds_${this.gameId}`)
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

    if (usingApiKeyAuth()) {
      const res = await fetchGameRound(GAME_SLUG);
      if (!res.ok || !res.data.round || this.destroyed) return;
      if (res.data.server_now) {
        const serverMs = new Date(res.data.server_now).getTime();
        if (Number.isFinite(serverMs)) this.skewMs = Date.now() - serverMs;
      }
      this.applyLiveRound(res.data.round as unknown as GameRound, false);
      return;
    }

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
      this.onSpinningPhase(round);
    }
  }

  private onBettingPhase() {
    const interruptedRound = this.spinningForRound;
    const interruptedWinner =
      this.currentRound?.winner_result || this.lastWinner;
    const wasSpinning = this.isSpinning || !!this.spinHandle;

    this.spinHandle?.cancel();
    this.spinHandle = null;
    this.isSpinning = false;
    this.spinningForRound = null;

    if (
      wasSpinning &&
      interruptedRound &&
      interruptedWinner &&
      this.spinCompleteForRound !== interruptedRound
    ) {
      void this.finishSpinResult(interruptedWinner, interruptedRound);
    }

    if (this.lastWinner) {
      this.history = [...this.history.slice(-9), this.lastWinner];
      this.emit('history', [...this.history]);
    }

    void this.refreshProfit();
    void this.refreshBalance();

    if (Object.keys(this.currentBets).length > 0) {
      this.lastPlacedBets = { ...this.currentBets };
    }
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
    if (this.pageJustLoaded) {
      this.isSpinning = true;
      return;
    }
    if (round.winner_result && round.id) {
      if (Object.keys(this.currentBets).length > 0) {
        this.lastPlacedBets = { ...this.currentBets };
      }
      this.triggerSpin(round.winner_result, round.id);
    }
  }

  private mergeMePodium(
    podiumMe: RoundPodiumPlayer | null,
    userBetOnWinner: number,
    winCoins: number,
  ): RoundPodiumPlayer | null {
    if (!this.userId) return null;
    const localTotal = this.betSnapshotTotal(this.localBetsForRound());
    const base =
      podiumMe ||
      ({
        userId: this.userId,
        ...this.playerProfile,
        bet: 0,
        win: 0,
      } satisfies RoundPodiumPlayer);

    return {
      ...base,
      bet: Math.max(base.bet ?? 0, localTotal, userBetOnWinner),
      win: Math.max(base.win ?? 0, winCoins),
    };
  }

  private async finishSpinResult(winnerId: string, roundId: string) {
    if (this.destroyed) return;
    if (this.spinCompleteForRound === roundId) return;
    this.spinCompleteForRound = roundId;
    this.lastWinner = winnerId;
    this.isSpinning = false;
    this.spinHandle = null;
    this.playSound('win.mp3');

    const winningItem = optionById(winnerId);
    const bets = this.localBetsForRound();
    const userBetOnWinner = bets[winnerId] || 0;
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
      const credited = this.balance;
      if (uid) {
        const reconcile = (attempt: number) => {
          void fetchUserCoins(uid).then((coins) => {
            if (coins == null || this.destroyed) return;
            if (coins < credited && attempt < 4) {
              window.setTimeout(() => reconcile(attempt + 1), 700);
              return;
            }
            this.balance = coins;
            this.emit('balance', this.balance);
          });
        };
        window.setTimeout(() => reconcile(0), 700);
      }
    }

    let podium = {
      top: [] as RoundPodiumPlayer[],
      me: null as RoundPodiumPlayer | null,
    };
    try {
      podium = await this.fetchRoundPodium(roundId, winnerId);
      if (
        !this.destroyed &&
        (podium.top.length === 0 || ((podium.me?.win ?? 0) <= 0 && winCoins > 0))
      ) {
        await new Promise((r) => window.setTimeout(r, 450));
        if (!this.destroyed) {
          podium = await this.fetchRoundPodium(roundId, winnerId);
        }
      }
    } catch {
      // still emit so HUD win popup can open
    }

    if (this.destroyed) return;
    this.emit('spinComplete', {
      winnerId,
      winCoins,
      userBetOnWinner,
      topWinners: podium.top,
      me: this.mergeMePodium(podium.me, userBetOnWinner, winCoins),
    });
  }

  private triggerSpin(winnerId: string, roundId: string) {
    if (this.spinningForRound === roundId) return;
    this.spinningForRound = roundId;
    this.spinCompleteForRound = null;
    this.spinHandle?.cancel();

    this.spinBetsSnapshot = { ...this.currentBets };
    if (Object.keys(this.spinBetsSnapshot).length > 0) {
      this.lastPlacedBets = { ...this.spinBetsSnapshot };
    }

    const winIdx = pickWinSegmentIndex(winnerId);
    this.isSpinning = true;
    this.emit('spinStart', { winnerId, roundId, winIndex: winIdx });
    this.playSound('/fruit-party/sounds/spin_start.mp3');

    this.lastSpinTickAt = 0;
    this.spinHandle = startSmoothBoardSpin({
      optionCount: WHEEL_SEGMENTS.length,
      winIndex: winIdx,
      durationMs: WHEEL_SPIN_TOTAL_MS,
      loops: WHEEL_SPIN_LOOPS,
      ease: 'linear',
      // spinIndex unused by HUD/scene — skip emit to cut React/listener work.
      onIndex: () => {},
      onTick: () => this.playSound('spin_tick.mp3'),
      onComplete: () => {
        void this.finishSpinResult(winnerId, roundId);
      },
    });
  }
}
