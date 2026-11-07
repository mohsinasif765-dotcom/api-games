'use client';

import { RefObject, useEffect, useState } from 'react';
import {
  BET_OPTIONS,
  CHIPS,
  optionById,
} from '@/lib/lucky-77-phaser/config';
import type {
  ControllerEvents,
  GameRound,
  Lucky77Controller,
} from '@/lib/lucky-77-phaser/Lucky77Controller';
import styles from './lucky-77.module.css';

type Props = {
  controller: Lucky77Controller | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

export function Lucky77Hud({
  controller,
  splash,
  loadProgress,
  canvasHostRef,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [allBets, setAllBets] = useState<Record<string, number>>({});
  const [round, setRound] = useState<GameRound | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState(1000);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [profile, setProfile] = useState<{ name: string; avatar: string }>({
    name: 'You',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=player',
  });
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setSelectedChip(controller.selectedChip);
    setMuted(controller.isMuted);
    setHistory(controller.history);
    setRound(controller.currentRound);
    setProfile(controller.playerProfile);

    const offs = [
      controller.on('balance', setBalance),
      controller.on('profile', setProfile),
      controller.on('bets', (payload: unknown) => {
        // Football emits Record; fruit emits {current,all} — support both.
        if (
          payload &&
          typeof payload === 'object' &&
          'current' in (payload as object)
        ) {
          const p = payload as {
            current: Record<string, number>;
            all: Record<string, number>;
          };
          setBets(p.current);
          setAllBets(p.all);
        } else {
          setBets((payload as Record<string, number>) || {});
        }
      }),
      controller.on('round', setRound),
      controller.on('countdown', setCountdown),
      controller.on('selectedChip', setSelectedChip),
      controller.on('muted', setMuted),
      controller.on('history', setHistory),
      controller.on('toast', (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2200);
      }),
      controller.on('startBetting', () => {
        setStartBetting(true);
        setSpinning(false);
        // Do NOT clear win popup here — short rounds used to wipe it.
        window.setTimeout(() => setStartBetting(false), 2800);
      }),
      controller.on('spinStart', () => {
        setSpinning(true);
        setResult(null);
      }),
      controller.on('spinComplete', (payload) => {
        setSpinning(false);
        window.setTimeout(() => {
          setResult(payload);
          window.setTimeout(() => setResult(null), 7000);
        }, 350);
      }),
      controller.on('bettingCleared', () => {
        setBets({});
        setAllBets({});
        setSpinning(false);
      }),
      controller.on('ready', (payload) => {
        setBalance(payload.balance);
        setHistory(payload.history);
        setRound(payload.round);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [controller]);

  const betting = !!controller && round?.status === 'betting' && !spinning;
  const timerLabel =
    betting && countdown > 0
      ? String(countdown).padStart(2, '0')
      : spinning
        ? '…'
        : '--';

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/77/splash.webp"
            alt="Lucky 77"
            className={styles.splashBg}
            draggable={false}
          />
          <div className={styles.splashFooter}>
            <div className={styles.splashBarTrack}>
              <div
                className={styles.splashBarFill}
                style={{ width: `${Math.max(loadProgress, 4)}%` }}
              />
            </div>
            <div className={styles.splashPct}>LOADING… {loadProgress}%</div>
          </div>
        </div>
      )}

      <div className={styles.hud}>
        <button
          type="button"
          className={styles.homeBtn}
          aria-label="Home"
          onClick={() => window.history.back()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/77/home-button.webp" alt="" draggable={false} />
        </button>

        <div className={styles.topBar}>
          <div className={styles.topLeft} />

          <div className={styles.roundLabel}>
            Round:{round?.round_number ?? '000'}
          </div>

          <div className={styles.sideTools} />
        </div>

        <div className={styles.wheelStage}>
          <div ref={canvasHostRef} className={styles.canvasHost} />
          {/* Gold V clipped to hole — cannot paint over faream rim */}
          <div className={styles.hubPointerClip} aria-hidden>
            <span className={`${styles.hubPointerArm} ${styles.hubPointerArmL}`} />
            <span className={`${styles.hubPointerArm} ${styles.hubPointerArmR}`} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/77/faream-77.webp?v=1"
            alt=""
            className={styles.frameOverlay}
            draggable={false}
          />
          {/* Center orb — shared center of faream hole + spinning wheel */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/77/santer-sarkal.webp?v=1"
            alt=""
            className={styles.hubCenterOrb}
            draggable={false}
          />
          <div className={styles.hubTimer}>{timerLabel}</div>
          {/* Reference right stack: My Bets → Help → History → Speaker → Repeat Bet */}
          <div className={styles.rightIconStack}>
            <button
              type="button"
              className={styles.stackIconBtn}
              aria-label="My Bets"
              onClick={() => {
                setToast('My bets for this round show on each slot.');
                window.setTimeout(() => setToast(null), 2200);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/77/my-bets.webp?v=3" alt="" draggable={false} />
            </button>
            <button
              type="button"
              className={styles.stackIconBtn}
              aria-label="Help"
              onClick={() => {
                setToast(
                  'Tap chips, then tap a bet slot. Repeat Bet replays your last round.',
                );
                window.setTimeout(() => setToast(null), 2600);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/77/question-ancer.webp?v=3" alt="" draggable={false} />
            </button>
            <button
              type="button"
              className={styles.stackIconBtn}
              aria-label="History"
              onClick={() => {
                document
                  .querySelector(`.${styles.historyAtti}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/77/histrie-butten.webp?v=3" alt="" draggable={false} />
            </button>
            <button
              type="button"
              className={`${styles.stackIconBtn} ${muted ? styles.speakerMuted : ''}`}
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => controller?.toggleMute()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/77/sapker.webp?v=3" alt="" draggable={false} />
            </button>
          </div>
          <button
            type="button"
            className={styles.repeatBetBtn}
            aria-label="Repeat Bet"
            disabled={!betting}
            onPointerDown={() => controller?.unlockAudio()}
            onClick={() => void controller?.repeatLastBets()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/77/repeat-bet-butten.webp?v=5"
              alt=""
              draggable={false}
            />
          </button>
        </div>

        <div className={styles.resultsPanel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/77/results.webp?v=2"
            alt=""
            className={styles.resultsFrame}
            draggable={false}
          />
          <div className={styles.historyAtti}>
            <div className={styles.historyStrip}>
              {history.length === 0 && (
                <span className={styles.historyEmpty}>—</span>
              )}
              {[...history].slice(-8).map((winnerId, i, arr) => {
                const item = optionById(winnerId);
                const isNew = i === arr.length - 1;
                if (!item) return null;
                return (
                  <div
                    key={`h-${history.length - arr.length + i}-${winnerId}`}
                    className={`${styles.historyDot} ${isNew ? styles.historyNew : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt={item.name} draggable={false} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.betSlots}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/77/malty-plair-opcen.webp?v=2"
            alt=""
            className={styles.betSlotsFrame}
            draggable={false}
          />
          <div className={styles.betSlotsGrid}>
            {BET_OPTIONS.map((opt) => {
              const myBet = bets[opt.id] || 0;
              const roomBet = allBets[opt.id] || myBet;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={styles.betSlot}
                  disabled={!betting}
                  onPointerDown={() => controller?.unlockAudio()}
                  onClick={() => controller?.placeBetOnOption(opt.id)}
                >
                  <div className={styles.betPool}>{roomBet.toLocaleString()}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opt.image}
                    alt={opt.name}
                    className={styles.betIcon}
                    draggable={false}
                  />
                  <div className={styles.betMult}>x{opt.multiplier}</div>
                  <div className={styles.betMine}>{myBet.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.profileCard}>
            <div className={styles.profileAvatarBox}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.avatar}
                alt=""
                className={styles.profileAvatar}
                draggable={false}
              />
            </div>
            <div className={styles.profileMeta}>
              <div className={styles.profileName}>{profile.name}</div>
              <div className={styles.profileWallet}>
                <span className={styles.profileGCoin} aria-hidden>
                  G
                </span>
                <span className={styles.profileBalance}>
                  {balance.toLocaleString()}
                </span>
                <button
                  type="button"
                  className={styles.profileAddBtn}
                  aria-label="Add coins"
                  onClick={() => {
                    setToast('Top-up coming soon');
                    window.setTimeout(() => setToast(null), 1800);
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className={styles.chipRow}>
            {CHIPS.map((chip) => (
              <button
                key={chip.amount}
                type="button"
                className={`${styles.chipBtn} ${
                  selectedChip === chip.amount ? styles.chipSelected : ''
                }`}
                onClick={() => controller?.setSelectedChip(chip.amount)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={chip.image} alt={chip.label} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
      {startBetting && <div className={styles.banner}>START BETTING</div>}
      {result && (() => {
        const top = result.topWinners || [];
        const first = top[0] ?? null;
        const second = top[1] ?? null;
        const third = top[2] ?? null;
        const me = result.me;

        const slot = (
          player: (typeof top)[number] | null,
          rank: 1 | 2 | 3,
        ) => (
          <div
            className={`${styles.podiumSlot} ${
              rank === 1
                ? styles.podiumFirst
                : rank === 2
                  ? styles.podiumSecond
                  : styles.podiumThird
            }`}
          >
            <div className={styles.crown} aria-hidden>
              <span>{rank}</span>
            </div>
            <div className={styles.podiumAvatarWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  player?.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=empty-${rank}`
                }
                alt=""
                className={styles.podiumAvatar}
                draggable={false}
              />
            </div>
            <div className={styles.podiumRibbon}>
              {player?.name ?? '—'}
            </div>
            <div className={styles.podiumStats}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Bet:</span>
                <span className={styles.statValue}>
                  {(player?.bet ?? 0).toLocaleString()}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Win:</span>
                <span className={styles.statValue}>
                  {(player?.win ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );

        return (
          <div className={styles.resultModal}>
            <div className={styles.resultCard}>
              <div className={styles.goodLuckBanner}>Good Luck</div>
              <p className={styles.congratsLine}>
                congratulations to the following winner(s)
              </p>
              <div className={styles.podiumRow}>
                {slot(second, 2)}
                {slot(first, 1)}
                {slot(third, 3)}
              </div>
              <div className={styles.meBar}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    me?.avatar ||
                    profile.avatar ||
                    'https://api.dicebear.com/7.x/avataaars/svg?seed=you'
                  }
                  alt=""
                  className={styles.meAvatar}
                  draggable={false}
                />
                <span className={styles.meName}>
                  {me?.name || profile.name || 'You'}
                </span>
                <div className={styles.meStats}>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Bet:</span>
                    <span className={styles.statValue}>
                      {(me?.bet ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Win:</span>
                    <span className={styles.statValue}>
                      {(me?.win ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
