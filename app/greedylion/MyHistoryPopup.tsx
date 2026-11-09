'use client';

import type { BetHistoryRow } from '@/lib/greedy-king-phaser/GreedyKingController';
import { foodById, formatChip } from '@/lib/greedy-king-phaser/config';
import styles from './greedy-phaser.module.css';

type Props = {
  open: boolean;
  loading: boolean;
  rows: BetHistoryRow[];
  onClose: () => void;
};

function formatPlayDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function MyHistoryPopup({ open, loading, rows, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.historyScrim} onClick={onClose}>
      <div
        className={styles.historySheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="My History"
      >
        <div className={styles.historyTitleTab}>My History</div>
        <button
          type="button"
          className={styles.historyClose}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className={styles.historyHead}>
          <span>Play Time</span>
          <span>Play Details</span>
          <span>Result</span>
        </div>

        <div className={styles.historyBody}>
          {loading && rows.length === 0 && (
            <div className={styles.historyEmpty}>Loading…</div>
          )}
          {!loading && rows.length === 0 && (
            <div className={styles.historyEmpty}>No play history yet</div>
          )}
          {rows.map((row) => {
            const winner = row.winnerId ? foodById(row.winnerId) : undefined;
            return (
              <div key={row.roundId} className={styles.historyItem}>
                <div className={styles.historyTime}>
                  <span>{formatPlayDate(row.playedAt)}</span>
                  <span>
                    Round:{row.roundNumber ?? row.roundId.slice(0, 4)}
                  </span>
                </div>

                <div className={styles.historyDetails}>
                  {row.bets.map((bet, i) => {
                    const food = foodById(bet.option);
                    return (
                      <div
                        key={`${bet.option}-${i}`}
                        className={styles.historyDetailRow}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={food?.image}
                          alt=""
                          className={styles.historyFoodIcon}
                          draggable={false}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/greedy-lion/g-coin.webp?v=2"
                          alt=""
                          className={styles.historyGCoin}
                          draggable={false}
                        />
                        <span className={styles.historyAmt}>
                          {formatChip(bet.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.historyResult}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={winner?.image}
                    alt=""
                    className={styles.historyFoodIcon}
                    draggable={false}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/greedy-lion/g-coin.webp?v=2"
                    alt=""
                    className={styles.historyGCoin}
                    draggable={false}
                  />
                  <span className={styles.historyAmt}>
                    {formatChip(row.resultAmount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
