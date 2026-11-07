"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import {
  Home,
  Users,
  Plus,
  Coins,
  Zap,
  Volume2,
  VolumeX
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import { useGameRoundSocket } from '@/lib/useGameRoundSocket';
import { GameCountdown } from '@/components/GameCountdown';
import { BET_TAP_DEBOUNCE_MS, MAX_FLYING_COINS, isMobileLite } from '@/lib/mobileLite';
import { wouldExceedOptionCap, betCapToast, parseBetRpcError } from '@/lib/betOptionCap';
import {
  fetchGameConfig,
  fetchGameRound,
  fetchMe,
  getApiKeyFromUrl,
  placeGameBet,
  storeApiKey,
} from '@/lib/game-api-client';
import {
  CAR_BRANDS,
  type CarBrand,
  type FlyingCoin,
  type WinnerInfo,
  surfaceClass,
} from '@/components/car/constants';
import { CarWheel } from '@/components/car/CarWheel';
import { CarBetFooter } from '@/components/car/CarBetFooter';
import { CarWinnerBanner } from '@/components/car/CarWinnerBanner';
import { FlyingCoinsLayer } from '@/components/car/FlyingCoinsLayer';

export default function GamePage() {
  const [balance, setBalance] = useState(0);
  const [currentBets, setCurrentBets] = useState<Record<string, number>>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [winningBrand, setWinningBrand] = useState<CarBrand | null>(null);
  const [currentRound, setCurrentRound] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [totalRotation, setTotalRotation] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [allBets, setAllBets] = useState<Record<string, number>>({});
  const [selectedChip, setSelectedChip] = useState(200);
  const [showStartBetting, setShowStartBetting] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);
  const [flyingCoins, setFlyingCoins] = useState<FlyingCoin[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [pendingWinner, setPendingWinner] = useState<any>(null);
  const [authStatus, setAuthStatus] = useState("Initializing...");
  const [gameId, setGameId] = useState<string | null>(null);
  const [lite, setLite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const lastBetTapRef = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const removeFlyingCoin = useCallback((id: number) => {
    setFlyingCoins((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const personIconRef = useRef<HTMLDivElement>(null);
  const brandRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isPageJustLoaded = useRef(true);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  useEffect(() => {
    setLite(isMobileLite());
  }, []);

  const { clock, clockActive, seedClockFromRound, connected: gameSocketConnected } =
    useGameRoundSocket({
      slug: 'car_roulette',
      enabled: !!gameId,
      onRound: (round) => {
        setCurrentRound((prev: any) => ({
          ...(prev || {}),
          ...round,
          game_id: gameIdRef.current || prev?.game_id,
        }));
      },
      onBetting: () => {
        setIsSpinning(false);
        setWinningBrand(null);
        setWinnerInfo(null);
        setPendingWinner(null);
        setCurrentBets({});
        setAllBets({});
        setShowStartBetting(true);
        playSound('start_betting.mp3');
        setTimeout(() => setShowStartBetting(false), 2000);
      },
      onSpinning: (round) => {
        if (isPageJustLoaded.current) {
          setIsSpinning(true);
          return;
        }
        if (round.winner_result) triggerSpin(round.winner_result);
      },
    });

  const handleCloseGame = () => {
    void import('@/lib/flutter-bridge').then(({ closeGame }) => closeGame());
  };

  const playSound = (soundName: string) => {
    if (isMuted) return null;
    try {
      const audio = new Audio(`/sounds/${soundName}`);
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play blocked or file missing:', e.message));
      return audio;
    } catch (err) {
      console.error('Sound Error:', err);
      return null;
    }
  };

  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const totalBet = Object.values(currentBets).reduce((a, b) => a + b, 0);
  const totalPot = Object.values(allBets).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const init = async () => {
      console.log('[AuthDebug] Init started. URL:', window.location.href);
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const apiKey = getApiKeyFromUrl();

      let currentUserId: string | null = null;

      if (apiKey) {
        storeApiKey(apiKey);
        setAuthStatus('Verifying API key...');
        const me = await fetchMe(apiKey);
        if (me.ok) {
          currentUserId = me.data.player.id;
          setUserId(me.data.player.id);
          setBalance(me.data.player.coins);
          setAuthStatus('Authorized (API key)!');
          console.log('[AuthDebug] API key player:', me.data.player.id);
        } else {
          setAuthStatus(`API key rejected: ${me.error}`);
        }
      } else if (token) {
        const cleanToken = token.trim();
        console.log('[AuthDebug] Token length:', cleanToken.length);
        setAuthStatus(`Verifying... (${cleanToken.length} chars)`);

        const currentUser = await applyWebViewAccessToken(cleanToken);

        if (!currentUser) {
          setAuthStatus('Rejected: session failed');
        } else {
          console.log('[AuthDebug] Session set! User:', currentUser.id);
          setAuthStatus('User Verified!');
          currentUserId = currentUser.id;
          setUserId(currentUser.id);
          const { data: userData } = await supabase.from('users').select('coins').eq('id', currentUser.id).single();
          if (userData) setBalance(userData.coins);
        }
      }

      if (!currentUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          currentUserId = user.id;
          setUserId(user.id);
          const { data: userData } = await supabase.from('users').select('coins').eq('id', user.id).single();
          if (userData) setBalance(userData.coins);
          setAuthStatus('Authorized!');
        }
      }

      let progress = 0;
      const interval = setInterval(() => {
        progress += 2;
        setLoadingProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowSplash(false), 800);
        }
      }, 20);

      if (!currentUserId) {
        console.warn('[AuthDebug] No user found after all checks.');
        setAuthStatus(apiKey || token ? 'Invalid Session' : 'Guest Mode');
      }

      const config = await fetchGameConfig('car_roulette');
      if (config.ok) {
        setGameId(config.data.id);
        gameIdRef.current = config.data.id;
        const round = await fetchGameRound('car_roulette');
        if (round.ok && round.data.round) {
          setCurrentRound(round.data.round);
          seedClockFromRound(round.data.round);
        }
      } else {
        const { data: configData } = await supabase
          .from('game_configs')
          .select('id')
          .eq('slug', 'car_roulette')
          .single();

        if (configData) {
          setGameId(configData.id);
          gameIdRef.current = configData.id;
          const { data: roundData } = await supabase
            .from('game_rounds')
            .select('*')
            .eq('game_id', configData.id)
            .neq('status', 'finished')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (roundData) {
            setCurrentRound(roundData);
            seedClockFromRound(roundData);
          }
        }
      }

      setTimeout(() => { isPageJustLoaded.current = false; }, 3000);
    };

    init();

    if (!userId || !gameId) return;

    const betsSub = supabase
      .channel('bets_realtime_car')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_bets' }, (payload) => {
        const bet = payload.new as any;
        if (bet.round_id === currentRound?.id) {
          setAllBets(prev => ({
            ...prev,
            [bet.bet_option]: (prev[bet.bet_option] || 0) + bet.amount
          }));
        }
      })
      .subscribe();

    return () => {
      betsSub.unsubscribe();
    };
  }, [userId, gameId, currentRound?.id]);

  useEffect(() => {
    if (!userId) return;
    const userSub = supabase
      .channel('user_balance')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` }, (payload) => {
        setBalance(payload.new.coins);
      })
      .subscribe();
    return () => { userSub.unsubscribe(); };
  }, [userId]);

  const placeBet = useCallback(async (brandId: string) => {
    if (isSpinning || !currentRound || currentRound.status !== 'betting') return;
    const now = Date.now();
    if (now - lastBetTapRef.current < BET_TAP_DEBOUNCE_MS) return;
    lastBetTapRef.current = now;

    if (balance < selectedChip) {
      console.log('[GamePage] Insufficient balance. Redirecting to wallet...');
      void import('@/lib/flutter-bridge').then(({ openWallet }) => openWallet());
      return;
    }

    if (wouldExceedOptionCap(currentBets, brandId, CAR_BRANDS.length)) {
      showToast(betCapToast(CAR_BRANDS.length));
      return;
    }

    setBalance(prev => prev - selectedChip);
    setCurrentBets(prev => ({
      ...prev,
      [brandId]: (prev[brandId] || 0) + selectedChip
    }));
    if (!isMutedRef.current) {
      try {
        const audio = new Audio('/sounds/bet.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch (_) {}
    }

    if (personIconRef.current && brandRefs.current[brandId]) {
      const sourceRect = personIconRef.current.getBoundingClientRect();
      const targetRect = brandRefs.current[brandId]!.getBoundingClientRect();

      const newCoin: FlyingCoin = {
        id: Date.now(),
        brandId,
        value: selectedChip,
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2,
        tx: targetRect.left + targetRect.width / 2,
        ty: targetRect.top + targetRect.height / 2,
      };

      setFlyingCoins(prev => [...prev, newCoin].slice(-MAX_FLYING_COINS));
    }

    if (getApiKeyFromUrl() || (typeof window !== 'undefined' && window.sessionStorage.getItem('game_api_key'))) {
      const betRes = await placeGameBet({
        slug: 'car_roulette',
        option: brandId,
        amount: selectedChip,
        roundId: currentRound.id,
      });
      if (!betRes.ok) {
        setBalance(prev => prev + selectedChip);
        setCurrentBets(prev => ({
          ...prev,
          [brandId]: (prev[brandId] || 0) - selectedChip
        }));
        showToast(betRes.error);
      } else {
        setBalance(betRes.data.balance);
      }
      return;
    }

    const { error } = await supabase.rpc('place_game_bet', {
      p_round_id: currentRound.id,
      p_option: brandId,
      p_amount: selectedChip
    });

    if (error) {
      setBalance(prev => prev + selectedChip);
      setCurrentBets(prev => ({
        ...prev,
        [brandId]: (prev[brandId] || 0) - selectedChip
      }));
      showToast(parseBetRpcError(error));
    }
  }, [isSpinning, currentRound, balance, selectedChip, currentBets, showToast]);

  useEffect(() => {
    if (currentRound?.status === 'spinning' && !isSpinning) {
      if (isPageJustLoaded.current) {
        console.log('[GamePage] Mid-round join detected, skipping spin animation.');
        setIsSpinning(true);
        return;
      }
      triggerSpin(currentRound.winner_result);
    }
  }, [currentRound?.status]);

  const triggerSpin = async (winnerId: string) => {
    setIsSpinning(true);
    setWinningBrand(null);
    setPendingWinner(null);
    spinAudioRef.current = playSound('wheel_spin.mp3');

    const winner = CAR_BRANDS.find(b => b.id === winnerId) || CAR_BRANDS[0];
    const winnerIndex = CAR_BRANDS.indexOf(winner);

    const fetchWinner = async () => {
      try {
        console.log('[GamePage] Fetching winner for round:', currentRound?.id, 'winner brand:', winnerId);

        const { data: winners } = await supabase
          .from('game_bets')
          .select('payout_amount, user_id, amount')
          .eq('round_id', currentRound.id)
          .eq('is_win', true)
          .order('payout_amount', { ascending: false })
          .limit(1);

        if (winners && winners.length > 0) {
          const w = winners[0];
          const { data: u } = await supabase.from('users').select('username, avatar_url').eq('id', w.user_id).single();
          console.log('[GamePage] Winner found (is_win=true):', u?.username, 'amount:', w.payout_amount);
          return {
            name: u?.username || 'Lucky Player',
            amount: w.payout_amount,
            avatar: u?.avatar_url || '/splash_logo.webp',
            brand: winner,
            isUserWin: w.user_id === userId
          };
        }

        console.log('[GamePage] No is_win bets yet, trying fallback by bet_option...');
        const { data: fallbackWinners } = await supabase
          .from('game_bets')
          .select('amount, user_id')
          .eq('round_id', currentRound.id)
          .eq('bet_option', winnerId)
          .order('amount', { ascending: false })
          .limit(1);

        if (fallbackWinners && fallbackWinners.length > 0) {
          const w = fallbackWinners[0];
          const { data: u } = await supabase.from('users').select('username, avatar_url').eq('id', w.user_id).single();
          console.log('[GamePage] Winner found (fallback):', u?.username, 'bet:', w.amount);
          return {
            name: u?.username || 'Lucky Player',
            amount: w.amount * winner.multiplier,
            avatar: u?.avatar_url || '/splash_logo.webp',
            brand: winner,
            isUserWin: w.user_id === userId
          };
        }

      } catch (e) {
        console.error('[GamePage] Fetch Winner Error:', e);
      }
      return {
        name: 'No Winner This Round',
        amount: 0,
        avatar: '/splash_logo.webp',
        brand: winner,
        isUserWin: false
      };
    };

    const winnerDataPromise = fetchWinner();

    setTotalRotation(prevRotation => {
      const newRotation = prevRotation + (360 * 8) + (360 - (winnerIndex * 36)) - (prevRotation % 360);

      if (wheelRef.current) {
        let lastRotation = 0;
        gsap.to(wheelRef.current, {
          rotation: newRotation,
          duration: lite ? 5 : 6,
          ease: "power3.out",
          force3D: true,
          onUpdate: function () {
            if (spinAudioRef.current && !lite) {
              const currentRotation = gsap.getProperty(this.targets()[0], "rotation") as number;
              const delta = Math.abs(currentRotation - lastRotation);
              lastRotation = currentRotation;
              const targetVolume = Math.min(0.5, delta * 0.05);
              spinAudioRef.current.volume = targetVolume;
            }
          },
          onComplete: async () => {
            setIsSpinning(false);
            setWinningBrand(winner);
            setHistory(prev => [winner.id, ...prev].slice(0, 10));

            const winnerData = await winnerDataPromise;
            setWinnerInfo(winnerData);
            playSound('win.mp3');
            setTimeout(() => setWinnerInfo(null), 6000);

            if (spinAudioRef.current) {
              spinAudioRef.current.pause();
              spinAudioRef.current.currentTime = 0;
              spinAudioRef.current.volume = 0.5;
            }
          }
        });
      }
      return newRotation;
    });
  };

  useEffect(() => {
    if (gameSocketConnected) return;
    if (!currentRound || currentRound.status !== 'betting') return;
    seedClockFromRound(currentRound);
  }, [currentRound?.id, currentRound?.status, currentRound?.betting_ends_at, gameSocketConnected, seedClockFromRound]);

  const cardSurface = surfaceClass(lite, 'card');

  return (
    <div className="relative min-h-screen w-full text-white overflow-hidden font-sans">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[300] bg-black/85 text-amber-300 text-xs font-bold px-4 py-2 rounded-full border border-amber-400/40 shadow-xl max-w-[90%] text-center"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 -z-10 bg-[#050508]">
        <img
          src="/assets/image.webp"
          alt="Game Background"
          className="w-full h-full object-cover"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>

      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: lite ? 1 : 1.05, ...(lite ? {} : { filter: "blur(20px)" }) }}
            transition={{ duration: lite ? 0.35 : 0.8, ease: "easeInOut" }}
            className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#050508] ${loadingProgress >= 100 ? 'pointer-events-none' : 'pointer-events-auto'}`}
          >
            {!lite && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-accent/20 blur-[120px] rounded-full animate-pulse-glow" />
            )}

            <div className="absolute inset-0 z-0 bg-[#050508]">
              <img
                src="/splash_logo.webp"
                alt="Splash Background"
                className="w-full h-full object-cover"
              />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative z-10 flex flex-col items-center justify-center h-full"
            >
              <div className="relative flex flex-col items-center">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="84"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="text-white/10"
                    />
                    <motion.circle
                      cx="96"
                      cy="96"
                      r="84"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="transparent"
                      strokeLinecap="round"
                      strokeDasharray="527.79"
                      initial={{ strokeDashoffset: 527.79 }}
                      animate={{ strokeDashoffset: 527.79 - (527.79 * loadingProgress) / 100 }}
                      className="text-accent drop-shadow-[0_0_20px_rgba(157,80,187,1)]"
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                      key={loadingProgress}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl font-black italic tracking-tighter"
                    >
                      {loadingProgress}<span className="text-sm not-italic opacity-50 ml-0.5">%</span>
                    </motion.span>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent mt-2 italic">AUTO ROYALE</span>
                    <span className="text-[7px] font-bold uppercase tracking-[0.4em] text-white/30 mt-1">Initializing</span>
                  </div>
                </div>

                <div className="mt-12 flex flex-col items-center">
                  <div className="w-56 h-[6px] bg-white/15 rounded-full relative overflow-hidden">
                    {lite ? (
                      <div
                        className="absolute inset-y-0 left-0 bg-accent rounded-full"
                        style={{ width: `${loadingProgress}%` }}
                      />
                    ) : (
                      <motion.div
                        className="absolute inset-0 bg-accent shadow-[0_0_25px_rgba(157,80,187,1)] rounded-full"
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                  </div>
                  <p
                    className={`mt-4 text-[9px] text-accent/60 tracking-[0.5em] uppercase font-black ${
                      lite ? '' : 'animate-pulse'
                    }`}
                  >
                    {authStatus}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.main
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="relative h-screen w-full flex flex-col items-center safe-top safe-bottom"
          >
            <header className="w-full max-w-md px-4 pt-0 pb-1 flex justify-between items-center z-50 -mt-2">
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCloseGame}
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center border-white/5 ${cardSurface}`}
                >
                  <Home size={20} className="text-white/60" />
                </motion.button>
                <div className="flex flex-col">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Lobby</span>
                  <span className="text-sm font-black tracking-tight italic uppercase">AUTO ROYALE</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-black/80 rounded-2xl px-4 py-2 border border-white/10 shadow-lg">
                <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/40">
                  <Coins size={12} className="text-yellow-500" />
                </div>
                <span className="text-sm font-black tracking-tight">{balance.toLocaleString()}</span>
                <button className="ml-1 w-5 h-5 rounded-lg bg-accent flex items-center justify-center">
                  <Plus size={12} className="text-white" />
                </button>
              </div>
            </header>

            <div className="w-full max-w-md px-5 py-2 flex justify-between items-start z-40">
              <div className="flex flex-col gap-2">
                <div
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border-white/5 ${surfaceClass(lite, 'dark')}`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full bg-green-500 ${lite ? '' : 'animate-pulse'}`}
                  />
                  <span className="text-[8px] text-white/60 font-black uppercase tracking-widest">
                    Round #{currentRound?.id?.toString().slice(-4) || '0000'}
                  </span>
                </div>

                <div ref={personIconRef} className="flex items-center gap-2 ml-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-white/10 shadow-lg ${cardSurface}`}
                  >
                    <Users size={14} className="text-accent" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-1">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </motion.button>
              </div>
            </div>

            <section className="flex-1 w-full max-w-md flex flex-col items-center justify-center px-4 gap-2 relative -mt-16">
              <div className="absolute right-0 top-0 z-50">
                <GameCountdown
                  clock={clock}
                  active={clockActive || (!gameSocketConnected && currentRound?.status === 'betting')}
                />
              </div>

              <CarWheel
                brands={CAR_BRANDS}
                currentBets={currentBets}
                winningBrand={winningBrand}
                isSpinning={isSpinning}
                lite={lite}
                roundBetting={currentRound?.status === 'betting'}
                onBet={placeBet}
                wheelRef={wheelRef}
                brandRefs={brandRefs}
              />

              <div className="w-full grid grid-cols-2 gap-2 mt-2">
                <div className={`p-2 rounded-xl flex flex-col border-white/5 ${cardSurface}`}>
                  <span className="text-[7px] text-white/30 uppercase font-black tracking-widest mb-0.5">Total Pot</span>
                  <div className="flex items-center gap-1.5">
                    <Coins size={12} className="text-accent" />
                    <span className="text-xs font-black tracking-tight italic">
                      {totalPot.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className={`p-2 rounded-xl flex flex-col border-white/5 ${cardSurface}`}>
                  <span className="text-[7px] text-white/30 uppercase font-black tracking-widest mb-0.5">Your Total</span>
                  <div className="flex items-center gap-1.5">
                    <Zap size={12} className="text-accent" />
                    <span className="text-xs font-black tracking-tight italic">{totalBet.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </section>

            <CarBetFooter
              selectedChip={selectedChip}
              onSelectChip={setSelectedChip}
              lite={lite}
            />

            <AnimatePresence>
              {showStartBetting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0, rotate: -5 }}
                    animate={{ scale: [0.5, 1.2, 1], opacity: 1, rotate: 0 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    className="relative flex flex-col items-center"
                  >
                    {!lite && (
                      <div className="absolute inset-[-40px] bg-yellow-500/30 blur-[100px] rounded-full animate-pulse" />
                    )}

                    <div className="relative z-10 flex flex-col items-center">
                      <motion.span
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="text-[12px] text-yellow-500 font-black uppercase tracking-[1em] mb-2 drop-shadow-lg"
                      >
                        VIP Round
                      </motion.span>

                      <h1 className="text-6xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)] flex flex-col items-center leading-none">
                        <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-yellow-200 to-yellow-500">START</span>
                        <span className="text-3xl tracking-[0.2em] -mt-2">BETTING</span>
                      </h1>

                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        className="h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mt-4"
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <CarWinnerBanner winnerInfo={winnerInfo} lite={lite} />

            <FlyingCoinsLayer
              coins={flyingCoins}
              lite={lite}
              onDone={removeFlyingCoin}
            />
          </motion.main>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .clip-path-triangle {
          clip-path: polygon(100% 0, 0 0, 50% 100%);
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .safe-top { padding-top: env(safe-area-inset-top); }
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
}
