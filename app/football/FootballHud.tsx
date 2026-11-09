'use client';

import { RefObject, useEffect, useRef, useState } from 'react';
import {
  BET_GRID_ORDER,
  CHIPS,
  EMPTY_GREEN_RING,
  INNER_BOARD,
  INNER_BOARD_PCT,
  PITCH_GRID_PCT,
  RING_ICONS,
  RING_LOGO_RADIUS_PCT,
  RING_LOGO_SIZE_PCT,
  TEAMS,
  formatChip,
  ringIconForTeam,
  segmentAngleDeg,
  teamById,
} from '@/lib/football-phaser/config';
import type {
  FootballController,
  GameRound,
} from '@/lib/football-phaser/FootballController';
import { closeGame } from '@/lib/flutter-bridge';
import styles from './football-phaser.module.css';

type Props = {
  controller: FootballController | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

function chipImageForAmount(amount: number): string {
  const exact = CHIPS.find((c) => c.amount === amount);
  if (exact) return exact.face;
  let best: (typeof CHIPS)[number] = CHIPS[0];
  for (const c of CHIPS) {
    if (c.amount <= amount) best = c;
  }
  return best.face;
}

export function FootballHud({
  controller,
  splash,
  loadProgress,
  canvasHostRef,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [allBets, setAllBets] = useState<Record<string, number>>({});
  /** Last chip denomination placed on each box (for chip face). */
  const [chipOnBox, setChipOnBox] = useState<Record<string, number>>({});
  const [round, setRound] = useState<GameRound | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState(200);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winHighlight, setWinHighlight] = useState<string | null>(null);
  const [spinIndex, setSpinIndex] = useState<number | null>(null);
  const [winLogoIndex, setWinLogoIndex] = useState<number | null>(null);
  const [winPopup, setWinPopup] = useState<{
    winnerId: string;
    winCoins: number;
    userBetOnWinner: number;
    multiplier: number;
    roundNo: string;
    roomWinPot: number;
  } | null>(null);
  const [popupSecs, setPopupSecs] = useState(5);
  const [ping, setPing] = useState(12);

  const chipRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const spinIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setSelectedChip(controller.selectedChip);
    setMuted(controller.isMuted);
    setHistory(controller.history);
    setRound(controller.currentRound);
    setPing(controller.pingMs);

    setBets({ ...controller.currentBets });
    setAllBets({ ...controller.allBets });

    const offs = [
      controller.on('balance', setBalance),
      controller.on('bets', (payload) => {
        setBets(payload.current);
        setAllBets(payload.all);
      }),
      controller.on('round', setRound),
      controller.on('countdown', setCountdown),
      controller.on('selectedChip', setSelectedChip),
      controller.on('muted', setMuted),
      controller.on('history', setHistory),
      controller.on('ping', setPing),
      controller.on('toast', (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2200);
      }),
      controller.on('startBetting', () => {
        setShowStart(true);
        setSpinning(false);
        setWinHighlight(null);
        setSpinIndex(null);
        setWinLogoIndex(null);
        setWinPopup(null);
        window.setTimeout(() => setShowStart(false), 2200);
      }),
      controller.on('spinStart', () => {
        setSpinning(true);
        setShowStart(false);
        setWinHighlight(null);
        setWinLogoIndex(null);
        setWinPopup(null);
        spinIndexRef.current = 0;
        setSpinIndex(0);
      }),
      controller.on('spinIndex', (idx) => {
        spinIndexRef.current = idx;
        setSpinIndex(idx);
      }),
      controller.on('spinComplete', (payload) => {
        setSpinning(false);
        // Gold frame stays until next betting round (startBetting / bettingCleared)
        setWinHighlight(payload.winnerId);
        const last = spinIndexRef.current;
        const winIdx =
          last != null && RING_ICONS[last]?.teamId === payload.winnerId
            ? last
            : RING_ICONS.findIndex((icon) => icon.teamId === payload.winnerId);
        setWinLogoIndex(winIdx >= 0 ? winIdx : null);
        setSpinIndex(null);
        const team = teamById(payload.winnerId);
        const mult = team?.multiplier || 0;
        const roomOnWinner = Math.max(
          controller.allBets[payload.winnerId] || 0,
          payload.userBetOnWinner || 0,
        );
        setWinPopup({
          winnerId: payload.winnerId,
          winCoins: payload.winCoins,
          userBetOnWinner: payload.userBetOnWinner || 0,
          multiplier: mult,
          roundNo: String(
            controller.currentRound?.round_number ?? '000',
          ).padStart(3, '0'),
          roomWinPot: roomOnWinner * mult,
        });
        setPopupSecs(5);
      }),
      controller.on('betPlaced', ({ optionId, amount }) => {
        setChipOnBox((prev) => ({ ...prev, [optionId]: amount }));
      }),
      controller.on('bettingCleared', () => {
        setBets({});
        setAllBets({});
        setChipOnBox({});
        setSpinning(false);
        setWinHighlight(null);
        setSpinIndex(null);
        setWinLogoIndex(null);
        setWinPopup(null);
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
  const canRepeat =
    betting &&
    !!controller &&
    Object.values(controller.lastPlacedBets).some((a) => a > 0);
  const timerLabel =
    betting && countdown > 0
      ? String(countdown).padStart(2, '0')
      : spinning
        ? '…'
        : '--';

  useEffect(() => {
    if (!winPopup) return;
    setPopupSecs(5);
    const tick = window.setInterval(() => {
      setPopupSecs((s) => {
        if (s <= 1) {
          window.clearInterval(tick);
          setWinPopup(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [winPopup]);

  const winVictors = (() => {
    if (!winPopup) return [];
    const pot = Math.max(winPopup.roomWinPot, winPopup.winCoins, 1000);
    const base = [
      {
        rank: 1,
        name: winPopup.winCoins > 0 ? 'You' : 'Player 1',
        amount: winPopup.winCoins > 0 ? winPopup.winCoins : Math.floor(pot * 0.45),
        seed: winPopup.winCoins > 0 ? 'you-win' : `${winPopup.roundNo}-a`,
      },
      {
        rank: 2,
        name: 'Player 2',
        amount: Math.floor(pot * 0.32),
        seed: `${winPopup.roundNo}-b`,
      },
      {
        rank: 3,
        name: 'Player 3',
        amount: Math.floor(pot * 0.2),
        seed: `${winPopup.roundNo}-c`,
      },
    ];
    return base;
  })();

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/footbal2/seven.webp"
            alt="Bounty Football"
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/football/logo.webp"
            alt="Bounty Football"
            className={styles.gameLogo}
            draggable={false}
          />

          {/* Reference strip: Back+Players | Balance | Help+Volume (+ wifi ping) */}
          <div className={styles.hudStrip}>
            <div className={styles.stripLeft}>
              <button
                type="button"
                className={styles.sideIconBtn}
                aria-label="Back"
                onClick={() => closeGame()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/footbal2/back_button.webp" alt="" draggable={false} />
              </button>
              <button
                type="button"
                className={styles.sideIconBtn}
                aria-label="Players"
                onClick={() => controller?.unlockAudio()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/footbal2/players_button.webp"
                  alt=""
                  draggable={false}
                />
              </button>
            </div>

            <div className={styles.balanceBar} aria-label="Balance">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/football/balance.webp"
                alt=""
                className={styles.balanceBarImg}
                draggable={false}
              />
              <span className={styles.balanceValue}>
                {balance.toLocaleString()}
              </span>
            </div>

            <div className={styles.stripRight}>
              <div className={styles.stripRightTop}>
                <button
                  type="button"
                  className={`${styles.sideIconBtn} ${styles.sideIconBtnLg}`}
                  aria-label="Help"
                  onClick={() => controller?.unlockAudio()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/football/help_button.webp"
                    alt=""
                    draggable={false}
                  />
                </button>
                <button
                  type="button"
                  className={`${styles.sideIconBtn} ${styles.sideIconBtnLg} ${muted ? styles.sideIconMuted : ''}`}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  onClick={() => controller?.toggleMute()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/football/volume_button.webp"
                    alt=""
                    draggable={false}
                  />
                </button>
              </div>
              <div className={styles.wifiStatus} aria-label={`Ping ${ping}ms`}>
                <span className={styles.wifiPing}>{ping}ms</span>
              </div>
              <div
                className={`${styles.alarmTimer} ${
                  betting && countdown > 0 && countdown <= 5
                    ? styles.alarmTimerUrgent
                    : ''
                }`}
                aria-label={`Time ${timerLabel}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/football/taimer.webp"
                  alt=""
                  className={styles.alarmTimerImg}
                  draggable={false}
                />
                <span className={styles.alarmTimerValue}>{timerLabel}</span>
              </div>
            </div>
          </div>

          <div className={styles.metaCol}>
            <div className={styles.roundLabel}>
              Round:{round?.round_number ?? '000'}
            </div>
          </div>
        </div>

        <div className={styles.wheelStage}>
          {/* 1) Green ring frame */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMPTY_GREEN_RING}
            alt=""
            className={styles.greenRing}
            draggable={false}
          />

          {/* 2) Joined inner board (reference layout) inside green ring */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={INNER_BOARD}
            alt=""
            className={styles.innerBoard}
            style={{
              width: `${INNER_BOARD_PCT}%`,
              height: `${INNER_BOARD_PCT}%`,
            }}
            draggable={false}
          />

          {/* 3) Invisible hit targets over the 10 boxes */}
          <div
            className={styles.pitchGrid}
            style={{
              width: `${PITCH_GRID_PCT}%`,
              height: `${PITCH_GRID_PCT}%`,
            }}
          >
            {BET_GRID_ORDER.map((teamId, index) => {
              const team = teamById(teamId) ?? TEAMS[0];
              const myBet = bets[team.id] || 0;
              const roomBet = Math.max(allBets[team.id] || 0, myBet);
              const isWin = winHighlight === team.id;
              const dimmed = !!winHighlight && !isWin;
              const isRight = index % 2 === 1;
              const chipFace = chipOnBox[team.id] || myBet;
              return (
                <button
                  key={team.id}
                  type="button"
                  className={`${styles.teamCell} ${isRight ? styles.teamCellRight : styles.teamCellLeft} ${isWin ? styles.teamCellWin : ''} ${dimmed ? styles.teamCellDim : ''} ${myBet > 0 ? styles.teamCellHasBet : ''}`}
                  disabled={!betting}
                  onPointerDown={() => controller?.unlockAudio()}
                  onClick={() => controller?.placeBetOnOption(team.id)}
                  aria-label={`Bet on ${team.name}`}
                >
                  {/* My chip on THIS box only */}
                  {myBet > 0 && chipFace > 0 && (
                    <span className={styles.teamChip} aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={chipImageForAmount(chipFace)}
                        alt=""
                        draggable={false}
                      />
                    </span>
                  )}
                  {/* This box pot — white text (36.7K), separate per cell */}
                  {roomBet > 0 && (
                    <span
                      className={styles.teamPool}
                      title={`${team.name}: ${formatChip(roomBet)}`}
                    >
                      {formatChip(roomBet)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 4) 16 outer logos on green ring (upright, clockwise from top) */}
          <div
            className={`${styles.ringLogoLayer} ${spinning ? styles.ringLogoLayerSpinning : ''}`}
            aria-hidden
          >
            {RING_ICONS.map((icon, index) => {
              const deg = segmentAngleDeg(index);
              const rad = (deg * Math.PI) / 180;
              const x = 50 + Math.cos(rad) * RING_LOGO_RADIUS_PCT;
              const y = 50 + Math.sin(rad) * RING_LOGO_RADIUS_PCT;
              const active = spinning && spinIndex === index;
              const winner =
                !spinning && winLogoIndex === index && !!winHighlight;
              return (
                <span
                  key={icon.id}
                  id={icon.id}
                  className={`${styles.ringLogo} ${active ? styles.ringLogoActive : ''} ${winner ? styles.ringLogoWinner : ''}`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${RING_LOGO_SIZE_PCT}%`,
                    height: `${RING_LOGO_SIZE_PCT}%`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={icon.src} alt="" draggable={false} />
                </span>
              );
            })}
          </div>

          {/* 4) Gold frame */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/football/goold-fream.webp"
            alt=""
            className={`${styles.goldFrame} ${betting ? styles.wheelFramePulse : ''}`}
            draggable={false}
          />

          {/* Phaser: win spark only */}
          <div ref={canvasHostRef} className={styles.canvasHost} />
        </div>

        <div className={styles.historyBlock}>
          <button
            type="button"
            className={styles.repeatBtn}
            disabled={!canRepeat}
            aria-label="Repeat bets"
            onPointerDown={() => controller?.unlockAudio()}
            onClick={() => void controller?.repeatBets()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/football/repeat.webp"
              alt=""
              className={styles.repeatBtnImg}
              draggable={false}
            />
          </button>
          <div className={styles.historyRow} aria-label="Result history">
            <div className={styles.historyStrip}>
              {[...history].reverse().map((winnerId, i) => {
                const ring = ringIconForTeam(winnerId);
                const fallback = teamById(winnerId);
                return (
                  <div
                    key={`${winnerId}-${i}`}
                    className={`${styles.historyDot} ${i === 0 ? styles.historyDotNew : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ring?.src || fallback?.logo}
                      alt={ring?.name || fallback?.name || ''}
                      draggable={false}
                    />
                    {i === 0 && <span className={styles.historyNew}>NEW</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.bottomBlock}>
          <div className={styles.chipsTray} role="group" aria-label="Bet chips">
            {CHIPS.map((chip) => (
              <button
                key={chip.amount}
                type="button"
                ref={(el) => {
                  chipRefs.current[chip.amount] = el;
                }}
                className={`${styles.chipSlot} ${
                  selectedChip === chip.amount ? styles.chipSlotActive : ''
                }`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  controller?.unlockAudio();
                  controller?.setSelectedChip(chip.amount);
                }}
                aria-label={`Select chip ${chip.label}`}
                aria-pressed={selectedChip === chip.amount}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={chip.image}
                  alt=""
                  className={styles.chipCoin}
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showStart && (
        <div className={`${styles.phaseBanner} ${styles.phaseStart}`}>
          START BETTING
        </div>
      )}

      {winPopup && (
        <div
          className={styles.winPopupOverlay}
          role="dialog"
          aria-label="Round result"
        >
          <div className={styles.winPopup}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/football/popup.webp"
              alt=""
              className={styles.winPopupBg}
              draggable={false}
            />

            <div className={styles.winPopupTitle}>
              NO. {winPopup.roundNo}
            </div>

            <button
              type="button"
              className={styles.winPopupClose}
              aria-label="Close"
              onClick={() => setWinPopup(null)}
            >
              ×
            </button>

            <div className={styles.winPopupTimer}>{popupSecs}s</div>

            <div className={styles.winPopupBody}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  ringIconForTeam(winPopup.winnerId)?.src ||
                  teamById(winPopup.winnerId)?.logo ||
                  ''
                }
                alt=""
                className={styles.winPopupLogo}
                draggable={false}
              />
              <div className={styles.winPopupMult}>
                X{winPopup.multiplier}
              </div>
              <div className={styles.winPopupStatus}>
                {winPopup.winCoins > 0
                  ? `You won +${formatChip(winPopup.winCoins)}`
                  : 'You have selected nothing this round'}
              </div>

              <div className={styles.winVictors}>
                <div className={styles.winVictorsTitle}>
                  — The top victors of this round —
                </div>
                <div className={styles.winVictorsRow}>
                  {winVictors.map((v) => (
                    <div key={v.rank} className={styles.winVictor}>
                      <div
                        className={`${styles.winVictorAvatar} ${
                          v.rank === 1
                            ? styles.winVictorGold
                            : v.rank === 2
                              ? styles.winVictorSilver
                              : styles.winVictorBronze
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(v.seed)}`}
                          alt=""
                          draggable={false}
                        />
                        <span className={styles.winVictorCrown}>{v.rank}</span>
                      </div>
                      <div className={styles.winVictorName}>{v.name}</div>
                      <div className={styles.winVictorAmt}>
                        <span className={styles.winVictorCoin}>G</span>
                        {formatChip(v.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
