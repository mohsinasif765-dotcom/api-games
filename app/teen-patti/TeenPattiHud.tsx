'use client';

import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  BET_OPTIONS,
  CHIPS,
  dealPartyHands,
  formatChip,
  optionById,
  type PlayingCard,
} from '@/lib/teen-patti-phaser/config';
import type {
  ControllerEvents,
  GameRound,
  RoundTopWinner,
  TeenPattiController,
} from '@/lib/teen-patti-phaser/TeenPattiController';
import { suitColor, suitSymbol, rankLabel } from '@/lib/teenPatti/cards';
import styles from './teen-patti.module.css';

type Props = {
  controller: TeenPattiController | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

const CARDS_PER_PARTY = 3;
const TOTAL_CARDS = BET_OPTIONS.length * CARDS_PER_PARTY;
const FLIP_STEP_MS = 320;

function FaceCard({ card }: { card: PlayingCard }) {
  const color = suitColor(card.s);
  return (
    <div className={styles.faceCard}>
      <span style={{ color }}>{rankLabel(card.r)}</span>
      <span style={{ color }}>{suitSymbol(card.s)}</span>
    </div>
  );
}

function FlipCard({
  card,
  showFace,
}: {
  card: PlayingCard | null;
  showFace: boolean;
}) {
  return (
    <div className={`${styles.flipCard} ${showFace ? styles.flipShow : ''}`}>
      <div className={styles.flipInner}>
        <div className={styles.flipBack}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/teen-patti/card-back.webp"
            alt=""
            className={styles.cardBack}
            draggable={false}
          />
        </div>
        <div className={styles.flipFront}>
          {card ? <FaceCard card={card} /> : null}
        </div>
      </div>
    </div>
  );
}

export function TeenPattiHud({
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
  const [selectedChip, setSelectedChip] = useState(200);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [flippedCount, setFlippedCount] = useState(0);
  const [topWinners, setTopWinners] = useState<RoundTopWinner[]>([]);
  const flipTimers = useRef<number[]>([]);

  const clearFlipTimers = () => {
    flipTimers.current.forEach((id) => window.clearTimeout(id));
    flipTimers.current = [];
  };

  const startFlipSequence = () => {
    clearFlipTimers();
    setFlippedCount(0);
    for (let i = 0; i < TOTAL_CARDS; i++) {
      const t = window.setTimeout(() => {
        setFlippedCount(i + 1);
      }, i * FLIP_STEP_MS);
      flipTimers.current.push(t);
    }
  };

  const resetCards = () => {
    clearFlipTimers();
    setFlippedCount(0);
    setWinnerId(null);
    setTopWinners([]);
  };

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
        setResult(null);
        setSpinning(false);
        resetCards();
        window.setTimeout(() => setStartBetting(false), 2400);
      }),
      controller.on('spinStart', ({ winnerId: wid }) => {
        setSpinning(true);
        setResult(null);
        setWinnerId(wid);
        startFlipSequence();
      }),
      controller.on('spinComplete', (payload) => {
        setSpinning(false);
        setWinnerId(payload.winnerId);
        setFlippedCount(TOTAL_CARDS);
        setTopWinners(payload.topWinners || []);
        window.setTimeout(() => {
          setResult(payload);
          window.setTimeout(() => setResult(null), 4500);
        }, 400);
      }),
      controller.on('bettingCleared', () => {
        setBets({});
        setAllBets({});
        setSpinning(false);
        resetCards();
      }),
      controller.on('ready', (payload) => {
        setBalance(payload.balance);
        setHistory(payload.history);
        setRound(payload.round);
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      clearFlipTimers();
    };
  }, [controller]);

  const betting = !!controller && round?.status === 'betting' && !spinning;
  const timerLabel =
    betting && countdown > 0
      ? `Countdown ${countdown}s`
      : spinning
        ? 'Opening…'
        : '--';

  const hands = useMemo(() => {
    if (!winnerId || !round?.id) return null;
    if (flippedCount <= 0 && !spinning) return null;
    return dealPartyHands(round.id, winnerId);
  }, [winnerId, round?.id, flippedCount, spinning]);

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/teen-patti/splash.webp"
            alt="Teen Patti"
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
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Home"
            onClick={() => window.history.back()}
          >
            ←
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/teen-patti/headerlogo.webp"
            alt="Teen Patti"
            className={styles.headerLogo}
            draggable={false}
          />
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Mute"
            onClick={() => controller?.toggleMute()}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        <div className={styles.countdownBanner}>{timerLabel}</div>

        <div className={styles.historyBar}>
          <span className={styles.historyLabel}>Last</span>
          {history.length === 0 && (
            <span className={styles.historyEmpty}>—</span>
          )}
          {history.map((id, i) => {
            const opt = optionById(id);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${id}-${i}`}
                src={opt?.image}
                alt={opt?.name ?? id}
                className={styles.historyFlag}
                draggable={false}
              />
            );
          })}
        </div>

        <div ref={canvasHostRef} className={styles.canvasHost} />

        <div className={styles.partyRow}>
          {BET_OPTIONS.map((opt, partyIdx) => {
            const myBet = bets[opt.id] || 0;
            const roomBet = allBets[opt.id] || myBet;
            const isWin =
              flippedCount >= TOTAL_CARDS && winnerId === opt.id;
            const cards = hands?.[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                className={`${styles.partyPanel} ${isWin ? styles.partyWin : ''}`}
                disabled={!betting}
                onPointerDown={() => controller?.unlockAudio()}
                onClick={() => controller?.placeBetOnOption(opt.id)}
              >
                <div className={styles.partyBox}>
                  {isWin && <span className={styles.winBorder} aria-hidden />}
                  <div className={styles.cardTray}>
                    {[0, 1, 2].map((ci) => {
                      const globalIndex = partyIdx * CARDS_PER_PARTY + ci;
                      return (
                        <FlipCard
                          key={ci}
                          card={cards?.[ci] ?? null}
                          showFace={flippedCount > globalIndex}
                        />
                      );
                    })}
                  </div>
                  <div className={styles.partyMeta}>
                    <span>Pot:{formatChip(roomBet)}</span>
                    <span>Me:{formatChip(myBet)}</span>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={opt.image}
                  alt={opt.name}
                  className={styles.partyFlag}
                  draggable={false}
                />
              </button>
            );
          })}
        </div>

        <div className={styles.topCurve} aria-label="Top winners">
          {/* Visual order L→R: 4th, 2nd, 1st, 3rd, 5th — #1 center */}
          {[3, 1, 0, 2, 4].map((rankIdx, i) => {
            const w = topWinners[rankIdx];
            const mid = 2;
            const bend = (i - mid) * (i - mid);
            const rank = rankIdx + 1;
            return (
              <div
                key={w?.userId ?? `slot-${rank}`}
                className={`${styles.topCurveItem} ${
                  rank === 1 ? styles.topCurveFirst : ''
                } ${w ? '' : styles.topCurveEmpty}`}
                style={{
                  transform: `translateY(${-bend * 4}px)`,
                  zIndex: 5 - Math.abs(i - mid),
                }}
              >
                <span className={styles.topCurveRank}>{rank}</span>
                {w ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.avatar}
                    alt={w.name}
                    className={styles.topCurveAvatar}
                    draggable={false}
                  />
                ) : (
                  <span className={styles.topCurvePlaceholder} aria-hidden />
                )}
                <span className={styles.topCurveName}>
                  {w?.name ?? '\u00a0'}
                </span>
                {w ? (
                  <span className={styles.topCurveWin}>
                    {formatChip(w.win)}
                  </span>
                ) : (
                  <span className={styles.topCurveWin}>{'\u00a0'}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>
          <div className={styles.balanceBox}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fruit-party/chips/coin_gold.webp"
              alt=""
              className={styles.balanceCoin}
              draggable={false}
            />
            <span>{formatChip(balance)}</span>
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
                <img src={chip.image} alt={String(chip.amount)} draggable={false} />
                {chip.amount === 200 && (
                  <span className={styles.chipLabel}>{chip.label}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
      {startBetting && <div className={styles.banner}>START BETTING</div>}
      {result && (
        <div className={styles.resultModal}>
          <div className={styles.resultCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optionById(result.winnerId)?.image}
              alt=""
              className={styles.resultFlag}
              draggable={false}
            />
            <div className={styles.resultTitle}>
              {result.winCoins > 0
                ? `+${formatChip(result.winCoins)}`
                : optionById(result.winnerId)?.name ?? 'Result'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
