'use client';

import { RefObject, useEffect, useState } from 'react';
import {
  CHIPS,
  FOOD_ITEMS,
  GAME_HEIGHT,
  GAME_WIDTH,
  SLOT_LABEL_NUDGE_Y_PCT,
  STAND_CANVAS_HEIGHT_PCT,
  STAND_CANVAS_TOP_PCT,
  STAND_PANELS,
  WHEEL,
  formatChip,
  foodById,
  slotOffset,
} from '@/lib/greedy-baby-phaser/config';
import type {
  ControllerEvents,
  GameRound,
  GreedyBabyController,
} from '@/lib/greedy-baby-phaser/GreedyBabyController';
import styles from './greedy-baby.module.css';

type Props = {
  controller: GreedyBabyController | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

export function GreedyBabyHud({
  controller,
  splash,
  loadProgress,
  canvasHostRef,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [profit, setProfit] = useState(0);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [round, setRound] = useState<GameRound | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState(100);
  const [muted, setMuted] = useState(false);
  const [ping, setPing] = useState(12);
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );
  const [resultCloseIn, setResultCloseIn] = useState(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setProfit(controller.todayProfit);
    setSelectedChip(controller.selectedChip);
    setMuted(controller.isMuted);
    setHistory(controller.history);
    setRound(controller.currentRound);

    const offs = [
      controller.on('balance', setBalance),
      controller.on('profit', setProfit),
      controller.on('bets', setBets),
      controller.on('round', setRound),
      controller.on('countdown', setCountdown),
      controller.on('selectedChip', setSelectedChip),
      controller.on('muted', setMuted),
      controller.on('ping', setPing),
      controller.on('history', setHistory),
      controller.on('toast', (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2200);
      }),
      controller.on('startBetting', () => {
        setStartBetting(true);
        setResult(null);
        setSpinning(false);
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
        }, 900);
      }),
      controller.on('bettingCleared', () => {
        setBets({});
        setSpinning(false);
      }),
      controller.on('ready', (payload) => {
        setBalance(payload.balance);
        setProfit(payload.todayProfit);
        setHistory(payload.history);
        setRound(payload.round);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [controller]);

  useEffect(() => {
    if (!result) return;
    setResultCloseIn(3);
    const id = window.setInterval(() => {
      setResultCloseIn((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setResult(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [result]);

  const betting = !!controller && round?.status === 'betting' && !spinning;
  const hubSeconds =
    betting && countdown > 0
      ? String(countdown).padStart(2, '0')
      : spinning
        ? '…'
        : '--';
  const myTotal = Object.values(bets).reduce((a, b) => a + b, 0);
  const winnerFood = result ? foodById(result.winnerId) : undefined;
  const displayProfit = Math.max(0, profit);

  const closeResult = () => {
    setResult(null);
    setResultCloseIn(0);
  };

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/greedy-baby/splash.webp"
            alt="Greedy Baby"
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

      <div className={styles.sky} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/greedy-lion/cloud1.webp"
          alt=""
          className={`${styles.cloud} ${styles.cloudA}`}
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/greedy-lion/cloud2.webp"
          alt=""
          className={`${styles.cloud} ${styles.cloudB}`}
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/greedy-lion/cloud1.webp"
          alt=""
          className={`${styles.cloud} ${styles.cloudC}`}
          draggable={false}
        />
      </div>

      <div className={styles.hud}>
        <div className={styles.topBar}>
          <div className={styles.iconCol}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Home"
              onClick={() => window.history.back()}
            >
              ⌂
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Mute"
              onClick={() => controller?.toggleMute()}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
          <div className={styles.metaCol}>
            <div className={styles.roundLabel}>
              Round:{round?.round_number ?? '000'}
            </div>
            <div className={styles.pingPill}>
              <span>●</span>
              <span>{ping}ms</span>
            </div>
          </div>
        </div>

        <div className={styles.bottomBlock}>
        <div className={styles.wheelStage}>
          <div ref={canvasHostRef} className={styles.canvasHost} />
          <div className={styles.hubTimer}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/greedy-baby/baby.webp"
              alt=""
              className={styles.lionImg}
              draggable={false}
            />
            <div className={styles.hubSeconds}>{hubSeconds}</div>
          </div>

          <div
            className={styles.standPanel}
            style={{
              left: `${STAND_PANELS.balance.left}%`,
              top: `${STAND_PANELS.balance.top}%`,
              width: `${STAND_PANELS.balance.width}%`,
              height: `${STAND_PANELS.balance.height}%`,
            }}
          >
            <span className={styles.standPanelLabel}>Balance</span>
            <span className={styles.standPanelValue}>
              ◆ {balance.toLocaleString()}
            </span>
          </div>
          <div
            className={styles.standPanel}
            style={{
              left: `${STAND_PANELS.profit.left}%`,
              top: `${STAND_PANELS.profit.top}%`,
              width: `${STAND_PANELS.profit.width}%`,
              height: `${STAND_PANELS.profit.height}%`,
            }}
          >
            <span className={styles.standPanelLabel}>Profit</span>
            <span
              className={`${styles.standPanelValue} ${styles.standPanelValueGood}`}
            >
              ◆ {Math.max(0, profit).toLocaleString()}
            </span>
          </div>

          {FOOD_ITEMS.map((item, i) => {
            const o = slotOffset(i);
            const left = ((WHEEL.cx + o.x) / GAME_WIDTH) * 100;
            const top =
              ((WHEEL.cy + o.y) / GAME_HEIGHT) * STAND_CANVAS_HEIGHT_PCT +
              STAND_CANVAS_TOP_PCT +
              SLOT_LABEL_NUDGE_Y_PCT;
            const betAmount = bets[item.id] || 0;
            return (
              <button
                key={item.id}
                type="button"
                className={styles.slotHit}
                style={{ left: `${left}%`, top: `${top}%` }}
                disabled={!betting}
                onClick={() => controller?.placeBetOnOption(item.id)}
                aria-label={`Bet on ${item.name}`}
              >
                <span className={styles.slotRow}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt=""
                    className={styles.slotFood}
                    draggable={false}
                  />
                  <span className={styles.multBadge}>x{item.multiplier}</span>
                  {item.hot && <span className={styles.hotBadge}>HOT</span>}
                </span>
                {betAmount > 0 && (
                  <span className={styles.betAmount}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/greedy-lion/botom.webp"
                      alt=""
                      className={styles.betAmountPlate}
                      draggable={false}
                    />
                    <span className={styles.betAmountText}>
                      {formatChip(betAmount)}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.dashboard}>
          <div className={styles.dashboardInner}>
          <div className={styles.historyRow}>
            <span className={styles.historyTitle}>result</span>
            <div className={styles.historyStrip}>
              {history.map((winnerId, i) => {
                const item = foodById(winnerId);
                return (
                  <div key={`${winnerId}-${i}`} className={styles.historyDot}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item?.image} alt="" />
                    {i === history.length - 1 && (
                      <span className={styles.newTag}>NEW</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.chipsRow}>
            {CHIPS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`${styles.chipBtn} ${
                  selectedChip === amount ? styles.chipBtnActive : ''
                }`}
                onClick={() => controller?.setSelectedChip(amount)}
              >
                <span className={styles.chipValue}>{formatChip(amount)}</span>
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerStat}>
            <span className={styles.footerStatLabel}>Total Bet</span>
            <span className={styles.footerStatValue}>
              ◆ {myTotal.toLocaleString()}
            </span>
          </div>
          <div className={styles.footerDivider} aria-hidden />
          <div className={styles.footerStat}>
            <span className={styles.footerStatLabel}>Mine</span>
            <span className={styles.footerStatValueGood}>
              ◆ {balance.toLocaleString()}
            </span>
          </div>
        </div>
        </div>
      </div>

      {startBetting && <div className={styles.banner}>START BETTING</div>}
      {toast && <div className={styles.toast}>{toast}</div>}

      {result && (
        <div className={styles.sheetScrim} onClick={closeResult}>
          <div
            className={styles.resultSheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Round result"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/greedy-lion/result-sheet.webp"
              alt=""
              className={styles.resultSheetBg}
              draggable={false}
            />
            <button
              type="button"
              className={styles.resultClose}
              onClick={closeResult}
            >
              Close({Math.max(0, resultCloseIn)}s)
            </button>

            <div className={styles.resultHero}>
              {winnerFood && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={winnerFood.image}
                  alt=""
                  className={styles.resultFood}
                  draggable={false}
                />
              )}
              <div className={styles.resultBetLine}>
                <span>My Bet:</span>
                <span className={styles.resultCoinAmt}>
                  ◆ {result.userBetOnWinner.toLocaleString()}
                </span>
              </div>
              <div className={styles.resultRewardLine}>
                <span>Reward:</span>
                <span className={styles.resultCoinAmt}>
                  ◆ {Math.max(0, result.winCoins).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={styles.resultFooter}>
              <div className={styles.resultFooterStat}>
                <span className={styles.resultFooterLabel}>Balance</span>
                <span className={styles.resultFooterValue}>
                  ◆ {balance.toLocaleString()}
                </span>
              </div>
              <div className={styles.resultFooterStat}>
                <span className={styles.resultFooterLabel}>Win Today</span>
                <span className={styles.resultFooterValue}>
                  ◆ {displayProfit.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
