'use client';

import type { RevenueRankRow } from '@/lib/greedy-king-phaser/GreedyKingController';
import styles from './greedy-phaser.module.css';

type Props = {
  open: boolean;
  loading: boolean;
  rows: RevenueRankRow[];
  onClose: () => void;
};

function formatRevenue(n: number) {
  return n.toLocaleString();
}

export function RevenueRankPopup({ open, loading, rows, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.historyScrim} onClick={onClose}>
      <div
        className={styles.rankSheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Today's Revenue Rank"
      >
        <div className={styles.historyTitleTab}>Today&apos;s Revenue Rank</div>
        <button
          type="button"
          className={styles.historyClose}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className={styles.rankHead}>
          <span>Ranking</span>
          <span>Profile</span>
          <span>Name</span>
          <span>Revenue</span>
        </div>

        <div className={styles.rankBody}>
          {loading && rows.length === 0 && (
            <div className={styles.historyEmpty}>Loading…</div>
          )}
          {!loading && rows.length === 0 && (
            <div className={styles.historyEmpty}>No rankings yet today</div>
          )}
          {rows.map((row) => (
            <div key={row.playerId} className={styles.rankItem}>
              <span className={styles.rankNum}>{row.rank}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  row.avatarUrl?.trim() ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(row.username || row.playerId)}`
                }
                alt=""
                className={styles.rankAvatar}
                draggable={false}
              />
              <span className={styles.rankName}>{row.username}</span>
              <div className={styles.rankRevenue}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/greedy-lion/g-coin.webp?v=2"
                  alt=""
                  className={styles.historyGCoin}
                  draggable={false}
                />
                <span>{formatRevenue(row.revenue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
