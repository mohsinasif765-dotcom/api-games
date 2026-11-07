'use client';

import { RefObject, useEffect, useState } from 'react';
import {
  BET_OPTIONS,
  CHIPS,
  optionById,
} from '@/lib/lucky-777-phaser/config';
import type {
  ControllerEvents,
  GameRound,
  Lucky777Controller,
} from '@/lib/lucky-777-phaser/Lucky777Controller';
import styles from './lucky-777.module.css';

type Props = {
  controller: Lucky777Controller | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

export function Lucky777Hud({
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
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setSelectedChip(controller.selectedChip);
    setMuted(controller.isMuted);
    setHistory(controller.history);
    setRound(controller.currentRound);

    const offs = [
      controller.on('balance', setBalance),
      controller.on('bets', (payload: unknown) => {
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
        // Do NOT clear result here — next round used to kill the popup instantly
        window.setTimeout(() => setStartBetting(false), 2800);
      }),
      controller.on('spinStart', () => {
        setSpinning(true);
        setResult(null);
      }),
      controller.on('spinComplete', (payload) => {
        setSpinning(false);
        // Show winners popup as soon as spin lands
        setResult(payload);
        window.setTimeout(() => setResult(null), 6000);
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
  const scrollToResults = () => {
    document
      .getElementById('lucky777-results')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          <div className={styles.splashInner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lucky77/splace-screen.jpeg?v=2"
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
              <div className={styles.splashPct}>{loadProgress}%</div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.hud}>
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <div className={styles.leftTools}>
              <button
                type="button"
                className={styles.toolBtn}
                aria-label="Back"
                onClick={() => window.history.back()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/lucky77/back-button.webp" alt="" draggable={false} />
              </button>
              <button
                type="button"
                className={styles.toolBtn}
                aria-label="Players"
                onClick={scrollToResults}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/lucky77/players-button.webp"
                  alt=""
                  draggable={false}
                />
              </button>
            </div>
          </div>

          <div className={styles.sideTools}>
            <button
              type="button"
              className={`${styles.toolBtn} ${muted ? styles.toolBtnMuted : ''}`}
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => controller?.toggleMute()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lucky77/speaker-button.webp"
                alt=""
                draggable={false}
              />
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              aria-label="Help"
              onClick={() => {
                setToast('Pick a chip, tap fruit to bet, wait for the spin.');
                window.setTimeout(() => setToast(null), 2800);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lucky77/help-button.webp" alt="" draggable={false} />
            </button>
          </div>
        </div>

        <div className={styles.wheelStage}>
          <div ref={canvasHostRef} className={styles.canvasHost} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lucky77/fram.webp"
            alt=""
            className={styles.frameOverlay}
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lucky77/center-sircol.webp?v=3"
            alt=""
            className={styles.hubCenterOrb}
            draggable={false}
          />
          <div className={styles.hubTimer}>{timerLabel}</div>
        </div>

        <div className={styles.betRow}>
          {BET_OPTIONS.map((opt) => {
            const roomBet = allBets[opt.id] || bets[opt.id] || 0;
            return (
              <button
                key={opt.id}
                type="button"
                className={styles.betPanel}
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
                <div className={styles.betMult}>×{opt.multiplier}</div>
              </button>
            );
          })}
        </div>

        <div className={styles.footer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lucky77/result.webp?v=8"
            alt=""
            className={styles.footerBg}
            draggable={false}
          />
          <div id="lucky777-results" className={styles.footerResults}>
            <div className={styles.historyStrip}>
              {history.map((winnerId, i) => {
                const item = optionById(winnerId);
                return (
                  <div key={`${winnerId}-${i}`} className={styles.historyDot}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item?.image}
                      alt={item?.name ?? ''}
                      draggable={false}
                    />
                  </div>
                );
              })}
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
                <img src={chip.image} alt="" draggable={false} />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.repeatHit}
            aria-label="Repeat"
            disabled={!betting}
            onPointerDown={() => controller?.unlockAudio()}
            onClick={() => {
              setToast('No previous bets');
              window.setTimeout(() => setToast(null), 1800);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lucky77/repeat-butten.webp?v=1"
              alt=""
              className={styles.repeatImg}
              draggable={false}
            />
          </button>
          <div className={styles.footerBalance} aria-label="Balance">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lucky77/balance-pill.webp?v=3"
              alt=""
              className={styles.footerBalanceBg}
              draggable={false}
            />
            <span className={styles.footerBalanceValue}>
              {balance.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
      {startBetting && <div className={styles.banner}>START BETTING</div>}
      {result &&
        (() => {
          const top = result.topWinners || [];
          const first = top[0] ?? null;
          const second = top[1] ?? null;
          const third = top[2] ?? null;
          const me = result.me;

          const fmt = (n: number) => (n ?? 0).toLocaleString();
          const avatarOf = (
            player: (typeof top)[number] | null,
            seed: string,
          ) =>
            player?.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;

          const podiumCol = (
            player: (typeof top)[number] | null,
            rank: 1 | 2 | 3,
          ) => (
            <div
              className={`${styles.podiumCol} ${
                rank === 1
                  ? styles.podiumCol1
                  : rank === 2
                    ? styles.podiumCol2
                    : styles.podiumCol3
              }`}
            >
              <div className={styles.podiumAvatarWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarOf(player, `empty-${rank}`)}
                  alt=""
                  className={styles.podiumAvatar}
                  draggable={false}
                />
              </div>
              <div className={styles.podiumName}>{player?.name ?? '—'}</div>
              <div className={styles.statBet}>Bet: {fmt(player?.bet ?? 0)}</div>
              <div className={styles.statWin}>Win: {fmt(player?.win ?? 0)}</div>
            </div>
          );

          return (
            <div className={styles.resultModal}>
              <div className={styles.resultCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/lucky77/popup.webp?v=4"
                  alt=""
                  className={styles.resultBg}
                  draggable={false}
                />
                <div className={styles.resultOverlay}>
                  <div className={styles.resultTitle}>Good Luck</div>
                  <div className={styles.resultSub}>
                    congratulations to the following winner(s)
                  </div>
                  {podiumCol(second, 2)}
                  {podiumCol(first, 1)}
                  {podiumCol(third, 3)}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarOf(me, 'you')}
                    alt=""
                    className={styles.meAvatar}
                    draggable={false}
                  />
                  <span className={styles.meName}>{me?.name ?? 'You'}</span>
                  <div className={styles.meStatBet}>
                    Bet: {fmt(me?.bet ?? 0)}
                  </div>
                  <div className={styles.meStatWin}>
                    Win: {fmt(me?.win ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
