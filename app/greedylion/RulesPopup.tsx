'use client';

import { FOOD_ITEMS } from '@/lib/greedy-king-phaser/config';
import styles from './greedy-phaser.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
};

const STEPS = [
  'Choose a chip amount at the bottom.',
  'Tap any food on the wheel to place your bet.',
  'You can bet on more than one food each round.',
  'When the lion timer ends, the wheel spins.',
  'If your food wins, you get bet × multiplier.',
];

export function RulesPopup({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.historyScrim} onClick={onClose}>
      <div
        className={styles.rulesSheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Game Rules"
      >
        <div className={styles.historyTitleTab}>Game Rules</div>
        <button
          type="button"
          className={styles.historyClose}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className={styles.rulesBody}>
          <p className={styles.rulesIntro}>
            Feed the Greedy Lion! Pick foods, place bets, and win big when your
            dish is chosen.
          </p>

          <h3 className={styles.rulesSection}>How to play</h3>
          <ol className={styles.rulesList}>
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <h3 className={styles.rulesSection}>Food multipliers</h3>
          <div className={styles.rulesFoodGrid}>
            {FOOD_ITEMS.map((food) => (
              <div key={food.id} className={styles.rulesFoodCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={food.image}
                  alt=""
                  className={styles.rulesFoodIcon}
                  draggable={false}
                />
                <span className={styles.rulesFoodName}>{food.name}</span>
                <span className={styles.rulesFoodMult}>x{food.multiplier}</span>
              </div>
            ))}
          </div>

          <p className={styles.rulesTip}>
            Tip: Higher multipliers pay more — but they win less often. Good
            luck!
          </p>
        </div>
      </div>
    </div>
  );
}
