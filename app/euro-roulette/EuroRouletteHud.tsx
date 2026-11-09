'use client';

import { RefObject, useEffect, useState } from 'react';
import {
  BET_CELL_LIMIT,
  BET_OPTIONS,
  CHIPS,
  formatCoins,
  numberColor,
} from '@/lib/euro-roulette-phaser/config';
import type {
  ControllerEvents,
  EuroRouletteController,
  GameRound,
} from '@/lib/euro-roulette-phaser/EuroRouletteController';
import styles from './euro-roulette.module.css';

type Props = {
  controller: EuroRouletteController | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

function chipImageForAmount(amount: number): string {
  const exact = CHIPS.find((c) => c.amount === amount);
  if (exact) return exact.image;
  // nearest lower chip face for stacked bet totals
  let best: (typeof CHIPS)[number] = CHIPS[0];
  for (const c of CHIPS) {
    if (c.amount <= amount) best = c;
  }
  return best.image;
}

export function EuroRouletteHud({
  controller,
  splash,
  loadProgress,
  canvasHostRef,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [round, setRound] = useState<GameRound | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState(200);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [pingMs, setPingMs] = useState(12);
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );
  const [spinning, setSpinning] = useState(false);
  const [winningOptions, setWinningOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setSelectedChip(controller.selectedChip);
    setMuted(controller.isMuted);
    setHistory(controller.history);
    setRound(controller.currentRound);
    setPingMs(controller.pingMs);

    const offs = [
      controller.on('balance', setBalance),
      controller.on('bets', setBets),
      controller.on('round', setRound),
      controller.on('countdown', setCountdown),
      controller.on('selectedChip', setSelectedChip),
      controller.on('muted', setMuted),
      controller.on('history', setHistory),
      controller.on('ping', setPingMs),
      controller.on('winningOptions', setWinningOptions),
      controller.on('toast', (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2200);
      }),
      controller.on('startBetting', () => {
        setStartBetting(true);
        setResult(null);
        setSpinning(false);
        setWinningOptions([]);
        window.setTimeout(() => setStartBetting(false), 2800);
      }),
      controller.on('spinStart', () => {
        setSpinning(true);
        setResult(null);
      }),
      controller.on('spinComplete', (payload) => {
        setSpinning(false);
        // show chakkar win on NEW badge immediately
        setHistory((prev) => {
          const next = String(payload.winnerNumber);
          if (prev[prev.length - 1] === next) return prev;
          return [...prev.slice(-9), next];
        });
        window.setTimeout(() => {
          setResult(payload);
          window.setTimeout(() => setResult(null), 4500);
        }, 600);
      }),
      controller.on('bettingCleared', () => {
        setBets({});
        setSpinning(false);
        setWinningOptions([]);
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
  const lastWin = history.length > 0 ? history[history.length - 1] : null;
  const lastWinNum = lastWin != null ? Number(lastWin) : NaN;
  const lastWinTone = Number.isFinite(lastWinNum)
    ? numberColor(lastWinNum)
    : 'black';
  const timerDisplay =
    betting && countdown > 0
      ? String(countdown)
      : spinning
        ? '…'
        : '—';

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/euro-roulette/splash.webp"
            alt="Euro Roulette"
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
        <div className={styles.topMeta}>
          <div className={styles.roundLabel}>
            Round: {round?.round_number ?? '—'}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/euro-roulette/logo.webp"
            alt="Roulette"
            className={styles.logo}
            draggable={false}
          />
        </div>

        <div className={styles.wheelStage}>
          <div className={styles.pingPill} aria-label="Latency">
            <span className={styles.pingValue}>{pingMs}ms</span>
          </div>
          <div className={styles.sideColLeft}>
            <div className={styles.newTimerRow}>
              <div className={styles.newBadgeStack}>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnImg} ${styles.backBtn}`}
                  aria-label="Back"
                  onClick={() => window.history.back()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/euro-roulette/back-button.webp?v=2"
                    alt=""
                    className={styles.iconBtnAsset}
                    draggable={false}
                  />
                </button>
                <div className={styles.newBadge} aria-label="Last result">
                  {lastWin != null ? (
                    <span
                      className={`${styles.newBadgeNum} ${styles[`hist_${lastWinTone}`]}`}
                    >
                      {lastWin}
                    </span>
                  ) : null}
                </div>
              </div>
              <div
                className={`${styles.timerRing} ${
                  betting && countdown > 0 && countdown <= 5
                    ? styles.timerRingUrgent
                    : ''
                }`}
                aria-label={`Timer ${timerDisplay}`}
              >
                <span className={styles.timerNum}>{timerDisplay}</span>
              </div>
            </div>
          </div>

          <div ref={canvasHostRef} className={styles.canvasHost} />

          <div className={styles.sideColRight}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnImg}`}
              aria-label="Help"
              onClick={() => {
                setToast('Place chips on the teal boxes');
                window.setTimeout(() => setToast(null), 2200);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/euro-roulette/question-answer.webp"
                alt=""
                className={styles.iconBtnAsset}
                draggable={false}
              />
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnImg} ${
                muted ? styles.iconBtnMuted : ''
              }`}
              aria-label="Mute"
              onClick={() => controller?.toggleMute()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/euro-roulette/speaker-icon-trim.webp"
                alt=""
                className={styles.iconBtnAsset}
                draggable={false}
              />
            </button>
            <button
              type="button"
              className={styles.playerBtn}
              aria-label="Player"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/euro-roulette/player-button.webp"
                alt=""
                className={styles.playerPill}
                draggable={false}
              />
            </button>
          </div>
        </div>

        <div className={styles.bottomBlock}>
          <div className={styles.betPanel}>
            <div className={styles.betGrid}>
              {BET_OPTIONS.map((opt) => {
                const betAmount = bets[opt.id] || 0;
                const isWin = winningOptions.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.betCell} ${isWin ? styles.betCellWin : ''}`}
                    disabled={!betting}
                    onPointerDown={() => controller?.unlockAudio()}
                    onClick={() => controller?.placeBetOnOption(opt.id)}
                    aria-label={`Bet on ${opt.label}`}
                  >
                    <span className={styles.betLimit}>
                      0 / {BET_CELL_LIMIT}
                    </span>
                    <span className={styles.betLabelRow}>
                      <span className={styles.betLabel}>{opt.label}</span>
                      <span className={styles.betMult}>x{opt.multiplier}</span>
                    </span>
                    {betAmount > 0 && (
                      <span className={styles.betChipStack}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={chipImageForAmount(betAmount)}
                          alt=""
                          className={styles.betChipImg}
                          draggable={false}
                        />
                        <span className={styles.betChipAmt}>
                          {formatCoins(betAmount)}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.woodBar} role="group" aria-label="Bet chips">
            <div className={styles.balanceBlock} aria-label="Balance">
              <span className={styles.balanceGem} aria-hidden>
                G
              </span>
              <span className={styles.balanceValue}>
                {balance.toLocaleString()}
              </span>
            </div>

            <div className={styles.chipsRow}>
              {CHIPS.map((chip) => {
                const active = selectedChip === chip.amount;
                return (
                  <button
                    key={chip.amount}
                    type="button"
                    className={`${styles.chipSlot} ${
                      active ? styles.chipSlotActive : ''
                    }`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      controller?.unlockAudio();
                      controller?.setSelectedChip(chip.amount);
                    }}
                    aria-label={`Select chip ${chip.label}`}
                    aria-pressed={active}
                  >
                    {active && (
                      <span className={styles.chipCaret} aria-hidden />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={chip.image}
                      alt=""
                      className={styles.chipCoin}
                      draggable={false}
                    />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={styles.repeatBtn}
              disabled={!betting}
              onClick={() => void controller?.repeatLastBets()}
            >
              Repeat
            </button>
          </div>
        </div>
      </div>

      {startBetting && <div className={styles.banner}>PLACE YOUR BETS</div>}
      {toast && <div className={styles.toast}>{toast}</div>}

      {result && (
        <div
          className={styles.modalScrim}
          onClick={() => setResult(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalRibbon}>
              {result.winCoins > 0 ? 'YOU WIN!' : 'RESULT'}
            </div>
            <div className={styles.modalNumber}>
              {result.winnerNumber}
            </div>
            <div className={styles.modalInfoBar}>
              {result.winCoins > 0 ? (
                <span className={styles.modalPayoutValue}>
                  +{result.winCoins.toLocaleString()}
                </span>
              ) : (
                <span>BETTER LUCK</span>
              )}
            </div>
            <button
              type="button"
              className={styles.modalBtn}
              onClick={() => setResult(null)}
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </>
  );
}
