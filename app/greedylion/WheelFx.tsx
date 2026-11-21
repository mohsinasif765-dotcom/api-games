'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  FOOD_ITEMS,
  FX_ASSETS,
  GAME_HEIGHT,
  GAME_WIDTH,
  WHEEL,
  betCoinCount,
  slotOffset,
} from '@/lib/greedy-king-phaser/config';
import type { GreedyKingController } from '@/lib/greedy-king-phaser/GreedyKingController';
import styles from './greedy-phaser.module.css';

/**
 * Wheel effects layer (bet pedestals, bet coins, spin hand, win spark) in
 * plain DOM + CSS/Web Animations. Replaces the Phaser MainScene so the page
 * no longer downloads/parses Phaser (~1.1 MB JS) or spins up WebGL — the main
 * cost of a cold first open on low-end Android WebViews.
 *
 * Geometry, timings and easings mirror the old scene 1:1 (game-space pixels
 * GAME_WIDTH×GAME_HEIGHT, scaled to fit the host like Phaser Scale.FIT).
 */

type FxController = Pick<GreedyKingController, 'on' | 'currentBets' | 'currentRound'>;

const HAND_OFFSET_X = 18;
const HAND_OFFSET_Y = 8;
const HAND_SIZE = 20;
const BOX_OFFSET_Y_FACTOR = 0.12;
const SPARK_SIZE_FACTOR = 1.28;
const SELECTED_TINT = '#ffb14a';
const SPIN_TINT = '#fff3c4';
const IDLE_DWELL_MS = 1500;
const COIN_SIZE_FACTOR = 0.2;
/** bet-box.webp niche centers (fractions of box size from box center). */
const NICHE_FRAC = [
  { x: -0.3, y: 0.205 },
  { x: 0, y: 0.205 },
  { x: 0.3, y: 0.205 },
] as const;

// Phaser easing equivalents.
const SINE_OUT = 'cubic-bezier(0.61, 1, 0.88, 1)';
const SINE_IN_OUT = 'cubic-bezier(0.37, 0, 0.63, 1)';
const QUAD_OUT = 'cubic-bezier(0.5, 1, 0.89, 1)';

const BOX = WHEEL.slotSize;
const BOX_OFFSET_Y = BOX * BOX_OFFSET_Y_FACTOR;
const COIN = BOX * COIN_SIZE_FACTOR;
const SPARK = WHEEL.slotSize * SPARK_SIZE_FACTOR;

const SLOT_POS = FOOD_ITEMS.map((_, i) => {
  const o = slotOffset(i);
  return { x: WHEEL.cx + o.x, y: WHEEL.cy + o.y };
});

const handTransform = (scale: number) =>
  `translate(-50%, -50%) scale(${scale})`;

export function WheelFx({ controller }: { controller: FxController | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tintRefs = useRef<Array<HTMLDivElement | null>>([]);
  const coinRefs = useRef<Array<Array<HTMLImageElement | null>>>(
    FOOD_ITEMS.map(() => []),
  );
  const handRef = useRef<HTMLImageElement>(null);
  const sparkRef = useRef<HTMLDivElement>(null);
  const sparkImgRef = useRef<HTMLImageElement>(null);

  // Fit GAME_WIDTH×GAME_HEIGHT into the host, centered (Phaser Scale.FIT).
  useLayoutEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return;
    const fit = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const s = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
      const x = (w - GAME_WIDTH * s) / 2;
      const y = (h - GAME_HEIGHT * s) / 2;
      stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!controller) return;

    let idleRoaming = false;
    let idleIndex = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let handAnim: Animation | null = null;
    let sparkSpin: Animation | null = null;
    let sparkFade: Animation | null = null;

    const hand = handRef.current;
    const spark = sparkRef.current;
    const sparkImg = sparkImgRef.current;

    const syncBetCoins = (bets: Record<string, number>) => {
      FOOD_ITEMS.forEach((food, i) => {
        const count = betCoinCount(bets[food.id] || 0, bets);
        coinRefs.current[i]?.forEach((coin, k) => {
          if (coin) coin.style.visibility = k < count ? 'visible' : 'hidden';
        });
      });
    };

    const setRootScale = (i: number, scale: number, durMs: number) => {
      const root = rootRefs.current[i];
      if (!root) return;
      root.style.transition = durMs > 0 ? `transform ${durMs}ms ${SINE_OUT}` : 'none';
      root.style.transform = `scale(${scale})`;
    };

    const highlightSlot = (index: number, mode: 'idle' | 'spin' | 'win') => {
      const tint = mode === 'idle' ? SELECTED_TINT : SPIN_TINT;
      const scaleOn = mode === 'win' ? 1.14 : mode === 'idle' ? 1.05 : 1.08;
      const dur = mode === 'idle' ? 420 : 100;
      FOOD_ITEMS.forEach((_, i) => {
        const active = i === index && index >= 0;
        const t = tintRefs.current[i];
        if (t) {
          t.style.backgroundColor = tint;
          t.style.opacity = active ? '1' : '0';
        }
        setRootScale(i, active ? scaleOn : 1, dur);
      });
    };

    const clearAllHighlights = () => {
      FOOD_ITEMS.forEach((_, i) => {
        const t = tintRefs.current[i];
        if (t) t.style.opacity = '0';
        setRootScale(i, 1, 0);
      });
    };

    const hideSpinHand = () => {
      handAnim?.cancel();
      handAnim = null;
      if (hand) {
        hand.style.visibility = 'hidden';
        hand.style.transform = handTransform(1);
      }
    };

    const moveSpinHand = (index: number, mode: 'idle' | 'spin' | 'win') => {
      if (!hand || index < 0 || index >= FOOD_ITEMS.length) {
        hideSpinHand();
        return;
      }
      const p = SLOT_POS[index];
      handAnim?.cancel();
      hand.style.left = `${p.x + HAND_OFFSET_X}px`;
      hand.style.top = `${p.y + HAND_OFFSET_Y}px`;
      hand.style.visibility = 'visible';
      if (mode === 'win') {
        // 1.10 ↔ 1.22, yoyo ×4 (Phaser repeat: 3), rests at 1.10.
        hand.style.transform = handTransform(1.1);
        handAnim = hand.animate(
          [{ transform: handTransform(1.1) }, { transform: handTransform(1.22) }],
          { duration: 280, iterations: 8, direction: 'alternate', easing: SINE_IN_OUT },
        );
      } else {
        hand.style.transform = handTransform(1);
        handAnim = hand.animate(
          [{ transform: handTransform(1) }, { transform: handTransform(1.08) }],
          { duration: 90, iterations: 2, direction: 'alternate', easing: SINE_OUT },
        );
      }
    };

    const hideWinSpark = () => {
      sparkSpin?.cancel();
      sparkFade?.cancel();
      sparkSpin = null;
      sparkFade = null;
      if (spark) spark.style.visibility = 'hidden';
    };

    const showWinSpark = (index: number) => {
      if (!spark || !sparkImg || index < 0 || index >= FOOD_ITEMS.length) {
        hideWinSpark();
        return;
      }
      hideWinSpark();
      // Lazy: the spark art is only needed on a win (kept off the cold path).
      if (!sparkImg.getAttribute('src')) sparkImg.src = FX_ASSETS.spark;
      const p = SLOT_POS[index];
      spark.style.left = `${p.x}px`;
      spark.style.top = `${p.y + BOX_OFFSET_Y}px`;
      spark.style.visibility = 'visible';
      sparkFade = spark.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        easing: QUAD_OUT,
        fill: 'forwards',
      });
      sparkSpin = sparkImg.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 3600, iterations: Infinity, easing: 'linear' },
      );
    };

    const stopIdleRoam = () => {
      idleRoaming = false;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };

    const scheduleIdleStep = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      if (!idleRoaming) return;
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (!idleRoaming) return;
        // Anticlockwise (decreasing index).
        idleIndex = (idleIndex - 1 + FOOD_ITEMS.length) % FOOD_ITEMS.length;
        moveSpinHand(idleIndex, 'spin');
        highlightSlot(idleIndex, 'idle');
        scheduleIdleStep();
      }, IDLE_DWELL_MS);
    };

    const startIdleRoam = () => {
      if (idleRoaming) return;
      idleRoaming = true;
      if (hand) {
        handAnim?.cancel();
        const p = SLOT_POS[idleIndex];
        hand.style.left = `${p.x + HAND_OFFSET_X}px`;
        hand.style.top = `${p.y + HAND_OFFSET_Y}px`;
        hand.style.transform = handTransform(1);
        hand.style.visibility = 'visible';
      }
      highlightSlot(idleIndex, 'idle');
      scheduleIdleStep();
    };

    const unsubs = [
      controller.on('bets', syncBetCoins),
      controller.on('ready', ({ round }) => {
        if (round?.status === 'betting') startIdleRoam();
      }),
      controller.on('startBetting', startIdleRoam),
      controller.on('spinStart', () => {
        stopIdleRoam();
        hideWinSpark();
        clearAllHighlights();
        if (hand) {
          handAnim?.cancel();
          hand.style.transform = handTransform(1);
          hand.style.visibility = 'visible';
        }
      }),
      controller.on('spinIndex', (idx) => {
        moveSpinHand(idx, 'spin');
        highlightSlot(idx, 'spin');
      }),
      controller.on('spinComplete', ({ winnerId }) => {
        const winIdx = FOOD_ITEMS.findIndex((f) => f.id === winnerId);
        moveSpinHand(winIdx, 'win');
        showWinSpark(winIdx);
        highlightSlot(winIdx, 'win');
      }),
      controller.on('bettingCleared', () => {
        stopIdleRoam();
        hideSpinHand();
        hideWinSpark();
        clearAllHighlights();
        syncBetCoins({});
      }),
    ];

    // Warm the spark art in the background once the game is up.
    const warmSpark = setTimeout(() => {
      const img = new Image();
      img.src = FX_ASSETS.spark;
    }, 4000);

    syncBetCoins(controller.currentBets || {});
    // `ready` may have fired before this layer mounted.
    if (controller.currentRound?.status === 'betting') startIdleRoam();

    return () => {
      clearTimeout(warmSpark);
      stopIdleRoam();
      handAnim?.cancel();
      hideWinSpark();
      unsubs.forEach((u) => u());
    };
  }, [controller]);

  return (
    <div ref={hostRef} className={styles.fxHost} aria-hidden>
      <div
        ref={stageRef}
        className={styles.fxStage}
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        <div
          ref={sparkRef}
          className={styles.fxSpark}
          style={{ width: SPARK, height: SPARK, visibility: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={sparkImgRef} alt="" draggable={false} />
        </div>

        {FOOD_ITEMS.map((food, i) => (
          <div
            key={food.id}
            ref={(el) => {
              rootRefs.current[i] = el;
            }}
            className={styles.fxSlot}
            style={{ left: SLOT_POS[i].x, top: SLOT_POS[i].y }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FX_ASSETS.betBox}
              alt=""
              draggable={false}
              className={styles.fxBox}
              style={{
                left: -BOX / 2,
                top: BOX_OFFSET_Y - BOX / 2,
                width: BOX,
                height: BOX,
              }}
            />
            <div
              ref={(el) => {
                tintRefs.current[i] = el;
              }}
              className={styles.fxTint}
              style={{
                left: -BOX / 2,
                top: BOX_OFFSET_Y - BOX / 2,
                width: BOX,
                height: BOX,
                opacity: 0,
              }}
            />
            {NICHE_FRAC.map((n, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={k}
                ref={(el) => {
                  coinRefs.current[i][k] = el;
                }}
                src={FX_ASSETS.coin}
                alt=""
                draggable={false}
                className={styles.fxCoin}
                style={{
                  left: n.x * BOX - COIN / 2,
                  top: BOX_OFFSET_Y + n.y * BOX - COIN / 2,
                  width: COIN,
                  height: COIN,
                  visibility: 'hidden',
                }}
              />
            ))}
          </div>
        ))}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={handRef}
          src={FX_ASSETS.hand}
          alt=""
          draggable={false}
          className={styles.fxHand}
          style={{ width: HAND_SIZE, visibility: 'hidden' }}
        />
      </div>
    </div>
  );
}
