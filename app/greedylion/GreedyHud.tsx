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
} from '@/lib/greedy-king-phaser/config';
import type {
  BetHistoryRow,
  ControllerEvents,
  GameRound,
  GreedyKingController,
  RevenueRankRow,
  RoundRankRow,
} from '@/lib/greedy-king-phaser/GreedyKingController';
import { MyHistoryPopup } from './MyHistoryPopup';
import { RevenueRankPopup } from './RevenueRankPopup';
import { RulesPopup } from './RulesPopup';
import styles from './greedy-phaser.module.css';

type Props = {
  controller: GreedyKingController | null;
  splash: boolean;
  loadProgress: number;
  canvasHostRef: RefObject<HTMLDivElement | null>;
};

export function GreedyHud({
  controller,
  splash,
  loadProgress,
  canvasHostRef,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [profit, setProfit] = useState(0);
  const [playerName, setPlayerName] = useState('Player');
  const [avatarUrl, setAvatarUrl] = useState(
    'https://api.dicebear.com/7.x/avataaars/svg?seed=player',
  );
  const [bets, setBets] = useState<Record<string, number>>({});
  const [round, setRound] = useState<GameRound | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState(1000);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [startBetting, setStartBetting] = useState(false);
  const [result, setResult] = useState<ControllerEvents['spinComplete'] | null>(
    null,
  );
  const [resultCloseIn, setResultCloseIn] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [betHistory, setBetHistory] = useState<BetHistoryRow[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankRows, setRankRows] = useState<RevenueRankRow[]>([]);
  const [topRank, setTopRank] = useState<RevenueRankRow | null>(null);
  const [roundVictors, setRoundVictors] = useState<RoundRankRow[]>([]);
  const [roundRankLoading, setRoundRankLoading] = useState(false);

  useEffect(() => {
    if (!controller) return;
    setBalance(controller.balance);
    setProfit(controller.todayProfit);
    setPlayerName(controller.username?.trim() || 'Player');
    setAvatarUrl(
      controller.avatarUrl?.trim() ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(controller.username || controller.userId || 'player')}`,
    );
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
        setRoundVictors([]);
        setRoundRankLoading(true);
        const enriched = {
          ...payload,
          roundNumber:
            payload.roundNumber ??
            controller.currentRound?.round_number ??
            null,
        };
        window.setTimeout(() => {
          setResult(enriched);
        }, 900);
        // Wait for settlement, then load real round ranking (retry)
        const loadRank = (attempt: number) => {
          void controller.loadRoundRank(payload.roundId).then((rows) => {
            if (rows.length > 0 || attempt >= 4) {
              setRoundVictors(rows);
              setRoundRankLoading(false);
              return;
            }
            window.setTimeout(() => loadRank(attempt + 1), 900);
          });
        };
        window.setTimeout(() => loadRank(0), 1200);
        window.setTimeout(() => {
          void controller.loadRevenueRank().then((rows) => {
            setTopRank(rows[0] ?? null);
          });
        }, 1600);
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
        setPlayerName(payload.username?.trim() || 'Player');
        setAvatarUrl(
          payload.avatarUrl?.trim() ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(payload.username || payload.userId || 'player')}`,
        );
        void controller.loadRevenueRank().then((rows) => {
          setTopRank(rows[0] ?? null);
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [controller]);

  useEffect(() => {
    if (!result) return;
    setResultCloseIn(6);
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
  const winnerFood = result ? foodById(result.winnerId) : undefined;
  const displayProfit = Math.max(0, profit);

  const closeResult = () => {
    setResult(null);
    setResultCloseIn(0);
  };

  const openHistory = () => {
    if (!controller) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    void controller
      .loadBetHistory()
      .then((rows) => setBetHistory(rows))
      .finally(() => setHistoryLoading(false));
  };

  const openRank = () => {
    if (!controller) return;
    setRankOpen(true);
    setRankLoading(true);
    void controller
      .loadRevenueRank()
      .then((rows) => {
        setRankRows(rows);
        setTopRank(rows[0] ?? null);
      })
      .finally(() => setRankLoading(false));
  };

  const topRankAvatar =
    topRank?.avatarUrl?.trim() ||
    (topRank
      ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(topRank.username || topRank.playerId)}`
      : '');

  return (
    <>
      {splash && (
        <div className={styles.splash}>
          <div className={styles.splashInner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/greedy-lion/splash.jpg"
              alt="Greedy Lion"
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
              <div className={styles.splashPct}>
                LOADING… {loadProgress}%
              </div>
            </div>
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
              className={styles.backBtn}
              aria-label="Back"
              onClick={() => {
                void import('@/lib/flutter-bridge')
                  .then(({ closeGame }) => {
                    closeGame();
                    window.setTimeout(() => window.history.back(), 120);
                  })
                  .catch(() => window.history.back());
              }}
            />
          </div>
          <div className={styles.metaCol}>
            <button
              type="button"
              className={`${styles.musicBtn} ${muted ? styles.musicBtnMuted : ''}`}
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                if (controller) {
                  controller.toggleMute();
                } else {
                  setMuted((m) => !m);
                }
              }}
            />
            <button
              type="button"
              className={styles.helpBtn}
              aria-label="Help"
              onClick={() => setRulesOpen(true)}
            />
          </div>
        </div>

        <div className={styles.bottomBlock}>
        <div className={styles.wheelStage}>
          <div ref={canvasHostRef} className={styles.canvasHost} />
          <div className={styles.hubTimer}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/greedy-lion/lion.webp"
              alt=""
              className={styles.lionImg}
              draggable={false}
            />
            <div className={styles.hubSeconds}>{hubSeconds}</div>
          </div>

          {/* Salad stays above; Balance box removed — Revenue Rank in that slot */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/greedy-lion/salad.webp"
            alt=""
            className={styles.balancePromo}
            style={{
              left: `${STAND_PANELS.balance.left + STAND_PANELS.balance.width / 2}%`,
              top: `${STAND_PANELS.balance.top}%`,
            }}
            draggable={false}
          />
          <button
            type="button"
            className={styles.revenueRankBtn}
            aria-label="Today's Revenue Rank"
            style={{
              left: `${STAND_PANELS.balance.left}%`,
              top: `${STAND_PANELS.balance.top}%`,
              width: `${STAND_PANELS.balance.width}%`,
              height: `${STAND_PANELS.balance.height}%`,
            }}
            onClick={openRank}
          >
            {topRank ? (
              <span className={styles.revenueRankPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={topRankAvatar}
                  alt=""
                  className={styles.revenueRankAvatar}
                  draggable={false}
                />
                <span className={styles.revenueRankMeta}>
                  <span className={styles.revenueRankName}>
                    {topRank.username}
                  </span>
                  <span className={styles.revenueRankAmount}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/greedy-lion/g-coin.webp?v=2"
                      alt=""
                      className={styles.revenueRankCoin}
                      draggable={false}
                    />
                    {topRank.revenue.toLocaleString()}
                  </span>
                </span>
              </span>
            ) : (
              <span className={styles.revenueRankEmpty}>No rank yet</span>
            )}
          </button>
          {/* Pizza stays above; Profit box removed — My History in that slot */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/greedy-lion/pizza.webp"
            alt=""
            className={styles.profitPromo}
            style={{
              left: `${STAND_PANELS.profit.left + STAND_PANELS.profit.width / 2}%`,
              top: `${STAND_PANELS.profit.top}%`,
            }}
            draggable={false}
          />
          <button
            type="button"
            className={styles.myHistoryBtn}
            aria-label="My History"
            style={{
              left: `${STAND_PANELS.profit.left}%`,
              top: `${STAND_PANELS.profit.top}%`,
              width: `${STAND_PANELS.profit.width}%`,
              height: `${STAND_PANELS.profit.height}%`,
            }}
            onClick={openHistory}
          />

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

          <div className={styles.footer}>
            <div className={styles.footerProfile}>
              <div className={styles.footerAvatarWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl}
                  alt=""
                  className={styles.footerAvatar}
                  draggable={false}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/greedy-lion/avatar-frame.webp"
                  alt=""
                  className={styles.footerAvatarFrame}
                  draggable={false}
                />
              </div>
              <div className={styles.footerProfileMeta}>
                <span className={styles.footerName}>{playerName}</span>
                <div className={styles.footerPill}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/greedy-lion/g-coin.webp?v=2"
                    alt=""
                    className={styles.footerCoin}
                    draggable={false}
                  />
                  <span className={styles.footerPillValue}>
                    {balance.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className={styles.footerPlus}
                    aria-label="Add coins"
                    onClick={() => {
                      void import('@/lib/flutter-bridge').then(({ openWallet }) =>
                        openWallet(),
                      );
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.footerWin}>
              <span className={styles.footerWinLabel}>Total win today:</span>
              <div className={styles.footerPill}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/greedy-lion/g-coin.webp?v=2"
                  alt=""
                  className={styles.footerCoin}
                  draggable={false}
                />
                <span className={styles.footerPillValue}>
                  {displayProfit.toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={styles.footerAuto}
              aria-label="Auto Play"
            />
          </div>
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
              ({Math.max(0, resultCloseIn)}s)
            </button>

            {/* Pin to sheet so feet sit on painted checkered table */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/greedy-lion/lain.webp"
              alt=""
              className={styles.resultLion}
              draggable={false}
            />

            <div className={styles.resultHero}>
              <div className={styles.resultStage}>
                {winnerFood && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={winnerFood.image}
                    alt=""
                    className={styles.resultFood}
                    draggable={false}
                  />
                )}
              </div>

              <div className={styles.resultRoundTitle}>
                Round{' '}
                {result.roundNumber ??
                  round?.round_number ??
                  controller?.currentRound?.round_number ??
                  '—'}
                &apos;s Result:
              </div>
              <div className={styles.resultStatLine}>
                <span>This Round Earnings:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/greedy-lion/g-coin.webp?v=2"
                  alt=""
                  className={styles.resultGCoin}
                  draggable={false}
                />
                <span className={styles.resultCoinAmt}>
                  {Math.max(0, result.winCoins).toLocaleString()}
                </span>
              </div>
              <div className={styles.resultStatLine}>
                <span>This Round Bets:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/greedy-lion/g-coin.webp?v=2"
                  alt=""
                  className={styles.resultGCoin}
                  draggable={false}
                />
                <span className={styles.resultCoinAmt}>
                  {(result.totalBet ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={styles.resultRanking}>
              <div className={styles.resultRankingTitle}>
                This Round Ranking:
              </div>
              {roundRankLoading && roundVictors.length === 0 ? (
                <div className={styles.resultRankEmpty}>Loading ranking…</div>
              ) : roundVictors.length === 0 ? (
                <div className={styles.resultRankEmpty}>No ranking yet</div>
              ) : (
                <div className={styles.resultPodium}>
                  {[2, 1, 3].map((rank) => {
                    const slot = roundVictors.find((r) => r.rank === rank);
                    if (!slot) {
                      return <div key={rank} className={styles.resultVictor} />;
                    }
                    const avatar =
                      slot.avatarUrl?.trim() ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(slot.username || slot.playerId)}`;
                    return (
                      <div
                        key={slot.playerId}
                        className={`${styles.resultVictor} ${
                          rank === 1
                            ? styles.resultVictorGold
                            : rank === 2
                              ? styles.resultVictorSilver
                              : styles.resultVictorBronze
                        }`}
                      >
                        <div className={styles.resultVictorAvatar}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={avatar} alt="" draggable={false} />
                          <span className={styles.resultVictorCrown}>
                            {rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}
                          </span>
                        </div>
                        <div className={styles.resultVictorName}>
                          {slot.username}
                        </div>
                        <div className={styles.resultVictorAmt}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/greedy-lion/g-coin.webp?v=2"
                            alt=""
                            className={styles.resultGCoin}
                            draggable={false}
                          />
                          {slot.amount.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <MyHistoryPopup
        open={historyOpen}
        loading={historyLoading}
        rows={betHistory}
        onClose={() => setHistoryOpen(false)}
      />
      <RevenueRankPopup
        open={rankOpen}
        loading={rankLoading}
        rows={rankRows}
        onClose={() => setRankOpen(false)}
      />
      <RulesPopup open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </>
  );
}
