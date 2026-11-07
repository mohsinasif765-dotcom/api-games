"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import {
  Trophy,
  Settings,
  Users,
  Home,
  History,
  RotateCcw,
  Zap,
  User,
  Plus,
  Coins,
  Music,
  Volume2,
  VolumeX,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { applyWebViewAccessToken } from '@/lib/webview-auth';
import { useRouter } from 'next/navigation';
import Lottie from 'lottie-react';
import loadingAnimation from '@/public/football/loading bar.json';
import { useGameRoundSocket } from '@/lib/useGameRoundSocket';
import { GameCountdown } from '@/components/GameCountdown';
import { BET_TAP_DEBOUNCE_MS, MAX_FLYING_COINS, isMobileLite } from '@/lib/mobileLite';
import { wouldExceedOptionCap, betCapToast, parseBetRpcError } from '@/lib/betOptionCap';
import { placeBetUnified } from '@/lib/placeBet';

// --- Types ---
type FoodItem = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  image: string;
};

const FOOD_ITEMS: FoodItem[] = [
  { id: 'pizza', name: 'Pizza Slice', multiplier: 10, color: '#FFD93D', image: '/pizza/pizza.webp' },
  { id: 'burger', name: 'Premium Burger', multiplier: 15, color: '#FF8E3C', image: '/pizza/burger.webp' },
  { id: 'fries', name: 'French Fries', multiplier: 25, color: '#C0392B', image: '/pizza/fries.webp' },
  { id: 'icecream', name: 'Ice Cream', multiplier: 45, color: '#9B59B6', image: '/pizza/icecream.webp' },
  { id: 'water', name: 'Water Bottle', multiplier: 5, color: '#3498DB', image: '/pizza/water.webp' },
  { id: 'soda', name: 'Soda Can', multiplier: 5, color: '#E74C3C', image: '/pizza/soda.webp' },
  { id: 'donut', name: 'Glazed Donut', multiplier: 5, color: '#FF6B6B', image: '/pizza/donut.webp' },
  { id: 'taco', name: 'Mexican Taco', multiplier: 5, color: '#F1C40F', image: '/pizza/taco.webp' },
];

export default function PizzaGamePage() {
  const [balance, setBalance] = useState(0);
  const [currentBets, setCurrentBets] = useState<Record<string, number>>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [winningId, setWinningId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [allBets, setAllBets] = useState<Record<string, number>>({});
  const [selectedChip, setSelectedChip] = useState(200);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [flyingCoins, setFlyingCoins] = useState<{ id: number, targetX: number, targetY: number, value: number, x: number, y: number }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [authStatus, setAuthStatus] = useState("Initializing...");
  const [showResult, setShowResult] = useState(false);
  const [showStartBetting, setShowStartBetting] = useState(false);
  const [roundWinners, setRoundWinners] = useState<any[]>([]);
  const [userWinAmount, setUserWinAmount] = useState(0);
  const [todayProfit, setTodayProfit] = useState(0);
  const [gameHistory, setGameHistory] = useState<string[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [lite, setLite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const currentBetsRef = useRef<Record<string, number>>({});
  const lastBetTapRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const lastWinnerRef = useRef<string | null>(null);
  const spinningForRoundRef = useRef<string | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);

  const router = useRouter();
  const personIconRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isPageJustLoaded = useRef(true);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    setLite(isMobileLite());
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // --- Audio ---
  const playSound = useCallback((soundName: string) => {
    if (isMuted) return;
    const audio = new Audio(`/sounds/${soundName}`);
    audio.play().catch(() => { });
  }, [isMuted]);

  const playTick = useCallback(() => {
    if (isMuted || lite) return;
    try {
      if (!tickAudioRef.current) {
        tickAudioRef.current = new Audio('/sounds/tick.mp3');
        tickAudioRef.current.volume = 0.25;
      }
      const a = tickAudioRef.current;
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch (_) {}
  }, [isMuted, lite]);

  const clearDomHighlight = useCallback(() => {
    Object.values(itemRefs.current).forEach((el) => {
      el?.classList.remove('ring-4', 'ring-green-400', 'scale-105', 'z-10');
    });
  }, []);

  const applyDomHighlight = useCallback((idx: number) => {
    clearDomHighlight();
    const item = FOOD_ITEMS[idx % FOOD_ITEMS.length];
    itemRefs.current[item.id]?.classList.add(
      'ring-4',
      'ring-green-400',
      'scale-105',
      'z-10',
    );
  }, [clearDomHighlight]);

  const triggerSpinAnimation = useCallback((winnerId: string, roundId: string) => {
    if (spinningForRoundRef.current === roundId) return;
    spinningForRoundRef.current = roundId;
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);

    setIsSpinning(true);
    setShowResult(false);
    setWinningId(null);

    const winnerIndex = Math.max(0, FOOD_ITEMS.findIndex((i) => i.id === winnerId));
    const totalSteps = (lite ? 24 : 40) + winnerIndex;
    let step = 0;
    let speed = lite ? 70 : 50;
    let currentIdx = 0;

    const finish = async () => {
      clearDomHighlight();
      setHighlightedIndex(winnerIndex);
      setWinningId(winnerId);
      lastWinnerRef.current = winnerId;
      playSound('win.mp3');
      setIsSpinning(false);

      const { data: winners } = await supabase
        .from('game_bets')
        .select('amount, payout_amount, is_win, users(display_name, avatar_url, id)')
        .eq('round_id', roundId)
        .eq('is_win', true)
        .order('payout_amount', { ascending: false })
        .limit(3);

      if (winners) setRoundWinners(winners);

      const winningItem = FOOD_ITEMS.find((i) => i.id === winnerId);
      const userBetOnWinner = currentBetsRef.current[winnerId] || 0;
      setUserWinAmount(userBetOnWinner * (winningItem?.multiplier || 0));

      setTimeout(() => {
        setShowResult(true);
        setTimeout(() => setShowResult(false), 4000);
      }, 1200);
    };

    const run = () => {
      applyDomHighlight(currentIdx % FOOD_ITEMS.length);
      // Tick every other step — avoids audio decode storm on WebView
      if (step % 2 === 0) playTick();

      step++;
      if (step < totalSteps) {
        if (step > totalSteps - 8) speed += lite ? 35 : 30;
        else if (step > totalSteps - 16) speed += lite ? 12 : 10;
        currentIdx++;
        spinTimerRef.current = setTimeout(run, speed);
      } else {
        void finish();
      }
    };
    run();
  }, [applyDomHighlight, clearDomHighlight, lite, playSound, playTick]);

  const { clock, clockActive, seedClockFromRound, connected: gameSocketConnected } =
    useGameRoundSocket({
      slug: 'pizza_express',
      enabled: !!gameId,
      onRound: (round) => {
        setCurrentRound((prev: any) => ({
          ...(prev || {}),
          ...round,
          game_id: gameIdRef.current || prev?.game_id,
        }));
      },
      onSpinning: (round) => {
        if (isPageJustLoaded.current) {
          setIsSpinning(true);
          return;
        }
        if (round.winner_result && round.id) {
          triggerSpinAnimation(round.winner_result, round.id);
        }
      },
      onBetting: () => {
        spinningForRoundRef.current = null;
        setIsSpinning(false);
        const prevWinner = lastWinnerRef.current;
        if (prevWinner) {
          setGameHistory((prev) => [...prev.slice(-9), prevWinner]);
          const uid = userIdRef.current;
          const gid = gameIdRef.current;
          if (uid && gid) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            supabase
              .from('game_bets')
              .select('amount, payout_amount, game_rounds!inner(game_id)')
              .eq('user_id', uid)
              .eq('game_rounds.game_id', gid)
              .gte('created_at', today.toISOString())
              .then(({ data }) => {
                if (data) {
                  const profit = data.reduce(
                    (acc, b) => acc + (b.payout_amount || 0) - b.amount,
                    0,
                  );
                  setTodayProfit(profit);
                }
              });
          }
        }
        currentBetsRef.current = {};
        setTimeout(() => {
          setShowResult(false);
          setShowStartBetting(true);
          setWinningId(null);
          setHighlightedIndex(null);
          clearDomHighlight();
          setCurrentBets({});
          setAllBets({});
          setRoundWinners([]);
          setTimeout(() => setShowStartBetting(false), 2000);
        }, 400);
      },
    });

  // --- Auth & Init ---
  useEffect(() => {
    const init = async () => {
      setAuthStatus("Checking Session...");
      const { data: { session } } = await supabase.auth.getSession();

      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get('token');

      if (token && !session) {
        setAuthStatus("Connecting...");
        await applyWebViewAccessToken(token);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setAuthStatus("Ready");
        const { data: userData } = await supabase.from('users').select('coins').eq('id', user.id).single();
        if (userData) setBalance(userData.coins);
      }

      // Fetch Config & Round
      const { data: configData } = await supabase.from('game_configs').select('id').eq('slug', 'pizza_express').single();
      if (configData) {
        setGameId(configData.id);
        gameIdRef.current = configData.id;

        // Fetch History
        const { data: histData } = await supabase
          .from('game_rounds')
          .select('winner_result')
          .eq('game_id', configData.id)
          .eq('status', 'finished')
          .order('created_at', { ascending: false })
          .limit(10);
        if (histData) setGameHistory(histData.map(h => h.winner_result));

        // Fetch Today's Profit
        if (user?.id) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const { data: profitData } = await supabase
            .from('game_bets')
            .select('amount, payout_amount, game_rounds!inner(game_id)')
            .eq('user_id', user.id)
            .eq('game_rounds.game_id', configData.id)
            .gte('created_at', today.toISOString());

          if (profitData) {
            const profit = profitData.reduce((acc, b) => acc + (b.payout_amount || 0) - b.amount, 0);
            setTodayProfit(profit);
          }
        }

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

      // Simulate loading
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
          progress = 100;
          setLoadingProgress(100);
          clearInterval(interval);
          setTimeout(() => setShowSplash(false), 1000);
        } else {
          setLoadingProgress(Math.floor(progress));
        }
      }, 150);
    };
    init();
  }, []);

  // --- Socket primary for rounds; bets still via Supabase ---
  useEffect(() => {
    if (!gameId) return;

    const betsSub = supabase
      .channel('bets_realtime')
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
  }, [gameId, currentRound?.id]);

  // Seed rAF clock from DB round when gateway is offline
  useEffect(() => {
    if (gameSocketConnected) return;
    if (!currentRound || currentRound.status !== 'betting') return;
    seedClockFromRound(currentRound);
  }, [currentRound?.id, currentRound?.status, currentRound?.betting_ends_at, gameSocketConnected, seedClockFromRound]);

  // --- Spin: prefer socket onSpinning; fallback if round already spinning from DB ---
  useEffect(() => {
    if (currentRound?.status === 'spinning' && currentRound?.winner_result && currentRound?.id) {
      if (isPageJustLoaded.current) {
        setIsSpinning(true);
        return;
      }
      triggerSpinAnimation(currentRound.winner_result, currentRound.id);
    }
  }, [currentRound?.status, currentRound?.id, currentRound?.winner_result, triggerSpinAnimation]);

  useEffect(() => {
    const t = setTimeout(() => {
      isPageJustLoaded.current = false;
    }, 1500);
    return () => {
      clearTimeout(t);
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    };
  }, []);

  const placeBet = async (optionId: string) => {
    if (balance < selectedChip || isSpinning || currentRound?.status !== 'betting') return;
    const now = Date.now();
    if (now - lastBetTapRef.current < BET_TAP_DEBOUNCE_MS) return;
    lastBetTapRef.current = now;

    if (wouldExceedOptionCap(currentBetsRef.current, optionId, FOOD_ITEMS.length)) {
      showToast(betCapToast(FOOD_ITEMS.length));
      return;
    }

    const prevBalance = balance;
    const prevBets = { ...currentBetsRef.current };

    setBalance(prev => prev - selectedChip);
    setCurrentBets(prev => {
      const newVal = {
        ...prev,
        [optionId]: (prev[optionId] || 0) + selectedChip
      };
      currentBetsRef.current = newVal;
      return newVal;
    });
    playSound('bet.mp3');

    // Flying Coin (capped on mobile WebView)
    if (personIconRef.current && itemRefs.current[optionId]) {
      const sourceRect = personIconRef.current.getBoundingClientRect();
      const targetRect = itemRefs.current[optionId]!.getBoundingClientRect();
      const newCoin = {
        id: Date.now(),
        value: selectedChip,
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2,
        targetX: targetRect.left + targetRect.width / 2,
        targetY: targetRect.top + targetRect.height / 2,
      };
      setFlyingCoins(prev => [...prev, newCoin].slice(-MAX_FLYING_COINS));
      setTimeout(() => setFlyingCoins(prev => prev.filter(c => c.id !== newCoin.id)), lite ? 500 : 800);
    }

    const { error, balance: nextBalance } = await placeBetUnified({
      slug: 'pizza_express',
      roundId: currentRound.id,
      option: optionId,
      amount: selectedChip,
    });

    if (error) {
      setBalance(prevBalance);
      setCurrentBets(prevBets);
      currentBetsRef.current = prevBets;
      showToast(parseBetRpcError(error));
    } else if (nextBalance != null) {
      setBalance(nextBalance);
    }
  };

  return (
    <div className="relative min-h-screen w-full text-gray-800 overflow-hidden font-sans bg-[#F9FEFF]">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[300] bg-black/85 text-amber-200 text-xs font-bold px-4 py-2 rounded-full border border-amber-400/40 shadow-xl max-w-[90%] text-center"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Decor */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#E0F7FA] to-[#F1F8E9] -z-10" />
      {!lite && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow-200/40 blur-[100px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-200/40 blur-[100px] rounded-full" />
        </>
      )}

      <AnimatePresence>
        {showSplash ? (
          <motion.div
            key="splash"
            exit={{ opacity: 0, scale: lite ? 1 : 1.05 }}
            transition={{ duration: lite ? 0.35 : 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#DFF9BA]"
          >
            <div className="w-80 h-auto relative flex flex-col items-center">
              <motion.img
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src="/pizza/big_eater_logo.webp"
                className={`w-full h-auto ${lite ? '' : 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.15)]'}`}
                alt="Big Eater"
              />

              <div className="mt-12 w-64 flex flex-col items-center">
                <span className="text-xs font-black text-green-700/60 uppercase tracking-widest mb-2">loading... {loadingProgress}%</span>
                <div className="w-full h-4 bg-white/50 rounded-full p-1 border border-white shadow-inner overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${loadingProgress}%` }}
                    transition={{ type: 'spring', stiffness: 50 }}
                    className={`h-full bg-[#2ECC71] rounded-full ${lite ? '' : 'shadow-[0_0_10px_rgba(46,204,113,0.5)]'}`}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative h-screen w-full flex flex-col items-center p-4">

            {/* Header */}
            <header className="w-full flex justify-between items-center mb-6">
              <button onClick={() => window.history.back()} className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border border-gray-100">
                <Home size={20} className="text-gray-400" />
              </button>

              <div ref={personIconRef} className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-inner">
                  <Coins size={14} className="text-white" />
                </div>
                <span className="text-lg font-black text-gray-700">{balance.toLocaleString()}</span>
                <button className="bg-green-500 w-6 h-6 rounded-lg flex items-center justify-center shadow-lg shadow-green-200">
                  <Plus size={14} className="text-white" />
                </button>
              </div>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border border-gray-100"
              >
                {isMuted ? <VolumeX size={20} className="text-red-400" /> : <Music size={20} className="text-gray-400" />}
              </button>
            </header>

            {/* Main Game Card */}
            <div className={`w-full max-w-md bg-[#FFF9C4] rounded-[40px] p-6 border-8 border-white relative ${lite ? '' : 'shadow-[0_20px_50px_rgba(255,235,59,0.3)]'}`}>
              {/* Title Badge */}
              <div className="absolute top-[-20px] left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-400 to-yellow-500 px-8 py-2 rounded-full shadow-lg border-2 border-white flex items-center gap-3">
                <span className="text-white font-black italic tracking-tight text-sm uppercase">Big Eater</span>

                {/* Timer Inside Badge — rAF, no parent re-render */}
                {!showStartBetting && (
                  <GameCountdown
                    clock={clock}
                    active={clockActive || (!gameSocketConnected && currentRound?.status === 'betting')}
                    className="!static !px-2 !py-0.5 !rounded-full !shadow-none border-0 bg-black/10 !items-center !gap-0 scale-90 [&>span:first-child]:!hidden"
                    label=""
                  />
                )}
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-4 gap-4 mt-4">
                {FOOD_ITEMS.map((item, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  const isWinner = winningId === item.id;
                  const betAmount = currentBets[item.id] || 0;

                  return (
                    <div key={item.id} className="flex flex-col items-center gap-2">
                      <button
                        ref={el => { itemRefs.current[item.id] = el; }}
                        onClick={() => placeBet(item.id)}
                        className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-transform duration-100 will-change-transform
                          ${isHighlighted ? 'ring-4 ring-green-400 scale-105 z-10' : 'ring-2 ring-green-200'}
                          ${isWinner ? `bg-green-100 ring-4 ring-yellow-400 scale-110 z-20 ${lite ? '' : 'shadow-[0_0_20px_rgba(255,235,59,0.8)]'}` : 'bg-white'}
                        `}
                      >
                        <div className="w-[85%] h-[85%] bg-white rounded-full flex items-center justify-center overflow-hidden border border-gray-50">
                          <img src={item.image} alt={item.name} className="w-[75%] h-[75%] object-contain" />
                        </div>

                        {/* Bet Amount Badge */}
                        {betAmount > 0 && (
                          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-white shadow-sm">
                            {betAmount >= 1000 ? `${betAmount / 1000}K` : betAmount}
                          </div>
                        )}
                      </button>
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${item.multiplier >= 10 ? 'text-orange-500' : 'text-green-600'}`}>
                        win {item.multiplier}X
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Betting Controls */}
            <div className="w-full max-w-md mt-8 space-y-6">
              <div className="flex justify-between items-center px-2">
                {[200, 1000, 10000, 50000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setSelectedChip(amount)}
                    className={`h-14 flex-1 mx-1 rounded-3xl font-black text-white shadow-lg transition-all transform active:scale-95 border-b-4
                      ${selectedChip === amount ? 'bg-green-500 border-green-700 -translate-y-1' : 'bg-green-400 border-green-600 opacity-60'}
                    `}
                  >
                    {amount >= 1000 ? `${amount / 1000}K` : amount}
                  </button>
                ))}
              </div>

              {/* Bottom Progress & Stats */}
              <div className="flex gap-4">
                <div className="flex-1 bg-green-500 h-10 rounded-full border-b-4 border-green-700 flex items-center px-4 shadow-lg">
                  <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center mr-2">
                    <TrendingUp size={12} className="text-white" />
                  </div>
                  <div className="flex-1 h-3 bg-green-800/30 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400" style={{ width: '65%' }} />
                  </div>
                </div>

                <div className="bg-white px-4 py-2 rounded-2xl border-b-4 border-gray-200 flex flex-col items-center min-w-[100px]">
                  <span className="text-[8px] font-black text-green-600 uppercase tracking-widest">Today's Profit</span>
                  <span className={`text-sm font-black ${todayProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {todayProfit >= 0 ? '+' : ''}{todayProfit.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* History Bar */}
              <div className="w-full bg-white/50 backdrop-blur-md rounded-2xl p-2 flex items-center gap-2 overflow-x-auto border border-white no-scrollbar">
                {gameHistory.map((winnerId, i) => {
                  const item = FOOD_ITEMS.find(f => f.id === winnerId);
                  return (
                    <div key={i} className="flex-shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                      <img src={item?.image} className="w-[70%] h-[70%] object-contain" />
                    </div>
                  );
                })}
                <div className="flex-shrink-0 bg-yellow-400 p-2.5 rounded-2xl shadow-lg flex items-center gap-2">
                  <History size={16} className="text-white" />
                  <span className="text-[10px] font-black text-white uppercase tracking-tighter">Results</span>
                </div>
              </div>
            </div>

            {/* Flying Coins */}
            <div className="fixed inset-0 pointer-events-none z-[300]">
              <AnimatePresence>
                {flyingCoins.map(coin => (
                  <motion.div
                    key={coin.id}
                    initial={{ x: coin.x, y: coin.y, scale: 0.5, opacity: 0 }}
                    animate={{ x: coin.targetX, y: coin.targetY, scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    className="absolute w-6 h-6 bg-yellow-400 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                  >
                    <Coins size={10} className="text-white" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Result Modal Overlay */}
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
                >
                  <motion.div
                    initial={{ scale: 0.5, y: 100 }}
                    animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl relative flex flex-col items-center"
                  >
                    {/* Header: Round Result */}
                    <div className="w-full bg-[#F1F8E9] rounded-2xl p-4 mb-6 flex justify-between items-center border border-green-100">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-green-600 font-black uppercase tracking-widest">Results:</span>
                        <span className="text-sm font-black text-gray-700">Round {currentRound?.round_number}</span>
                      </div>
                      <div className="w-12 h-12 bg-white rounded-full p-2 shadow-sm border border-green-100">
                        <img src={FOOD_ITEMS.find(i => i.id === winningId)?.image} className="w-full h-full object-contain" />
                      </div>
                    </div>

                    {/* Mascot & Message */}
                    <div className="relative mb-6">
                      <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="w-32 h-32 flex items-center justify-center"
                      >
                        {userWinAmount > 0 ? (
                          <img src="https://cdn-icons-png.flaticon.com/512/742/742751.png" className="w-full h-full object-contain" />
                        ) : (
                          <img src="https://cdn-icons-png.flaticon.com/512/742/742752.png" className="w-full h-full object-contain" />
                        )}
                      </motion.div>
                    </div>

                    <h2 className={`text-xl font-black text-center mb-2 ${userWinAmount > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {userWinAmount > 0 ? 'CONGRATULATIONS!' : 'SORRY!'}
                    </h2>
                    <p className="text-center text-gray-400 text-sm mb-8 leading-relaxed">
                      {userWinAmount > 0
                        ? `You won ${userWinAmount.toLocaleString()} coins in this round!`
                        : 'You just missed the jackpot this time~'}
                    </p>

                    {/* Winners List */}
                    <div className="w-full space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy size={14} className="text-yellow-500" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Top Winners</span>
                      </div>

                      <div className="flex justify-center gap-6">
                        {roundWinners.map((winner, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full border-2 border-yellow-400 p-0.5 overflow-hidden bg-gray-50">
                                <img src={winner.users?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${winner.users?.id}`} className="w-full h-full object-cover" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center border-2 border-white">
                                <span className="text-[10px] font-black text-white">{i + 1}</span>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold text-gray-600 truncate w-16 text-center">{winner.users?.display_name || 'User'}</span>
                            <div className="flex items-center gap-0.5">
                              <Coins size={8} className="text-yellow-500" />
                              <span className="text-[10px] font-black text-yellow-600">{winner.payout_amount}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowResult(false)}
                      className="mt-10 w-full h-14 bg-green-500 rounded-3xl font-black text-white shadow-lg shadow-green-100 border-b-4 border-green-700 active:translate-y-1 active:border-b-0 transition-all"
                    >
                      CONTINUE
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Start Betting Animation */}
            <AnimatePresence>
              {showStartBetting && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none"
                >
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-12 py-6 rounded-[30px] shadow-[0_20px_50px_rgba(16,185,129,0.5)] border-4 border-white">
                    <span className="text-4xl font-black text-white italic tracking-tighter drop-shadow-lg uppercase">Start Betting!</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.main>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
