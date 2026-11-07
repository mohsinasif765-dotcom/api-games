import * as Phaser from 'phaser';
import { FOOD_ITEMS, WHEEL, betCoinCount, slotOffset } from '../config';
import type { GreedyBabyController } from '../GreedyBabyController';

/**
 * Bet pedestals + spin hand + win spark behind winning box.
 * Food image + xN labels live in HTML (same row) so they stay aligned.
 */
export class MainScene extends Phaser.Scene {
  private controller: GreedyBabyController | null = null;
  private unsubs: Array<() => void> = [];
  private slotRoots: Phaser.GameObjects.Container[] = [];
  private spinHand: Phaser.GameObjects.Image | null = null;
  private winSpark: Phaser.GameObjects.Image | null = null;
  private winSparkMask: Phaser.GameObjects.Graphics | null = null;
  private winnerId: string | null = null;
  private highlightedIndex: number | null = null;
  /** Phaser scale for HAND_SIZE — never use setScale(1) after setDisplaySize. */
  private handBaseScale = 1;

  private idleRoaming = false;
  private idleIndex = 0;
  private idleDir = 1;
  private idleSteps = 0;
  private idleCall: Phaser.Time.TimerEvent | null = null;

  private static readonly HAND_OFFSET_X = 18;
  private static readonly HAND_OFFSET_Y = 8;
  /** On-screen size of spin pointer (px). */
  private static readonly HAND_SIZE = 20;
  private static readonly BOX_OFFSET_Y_FACTOR = 0.12;
  /** Just a bit larger than the bet box. */
  private static readonly SPARK_SIZE_FACTOR = 1.28;
  /** Match slected-coin.png warm gold / pink selected look (betting idle). */
  private static readonly SELECTED_TINT = 0xffb14a;
  /** Result spinner — soft bright lift (same idea as idle gold, not solid white/dark). */
  private static readonly SPIN_TINT = 0xfff3c4;
  /** Pause on each box before next step (anticlockwise idle roam). */
  private static readonly IDLE_DWELL_MS = 1500;
  /**
   * bet-box.webp niche centers (asset 210×210, origin at texture center).
   * Left → mid → right arches in the lower row.
   */
  private static readonly NICHE_FRAC: ReadonlyArray<{ x: number; y: number }> = [
    { x: -0.3, y: 0.205 },
    { x: 0, y: 0.205 },
    { x: 0.3, y: 0.205 },
  ];
  private static readonly COIN_SIZE_FACTOR = 0.2;

  constructor() {
    super('MainScene');
  }

  create() {
    this.controller = this.game.registry.get(
      'controller',
    ) as GreedyBabyController;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    const { cx, cy, slotSize } = WHEEL;
    const boxSize = slotSize;
    const boxOffsetY = slotSize * MainScene.BOX_OFFSET_Y_FACTOR;
    const coinSize = boxSize * MainScene.COIN_SIZE_FACTOR;

    const sparkSize = slotSize * MainScene.SPARK_SIZE_FACTOR;
    this.winSparkMask = this.add.graphics().setVisible(false);
    this.winSpark = this.add
      .image(cx, cy, 'wing_spark')
      .setDisplaySize(sparkSize, sparkSize)
      .setDepth(5)
      .setVisible(false)
      .setAlpha(1);

    this.slotRoots = FOOD_ITEMS.map((food, i) => {
      const o = slotOffset(i);
      const root = this.add.container(cx + o.x, cy + o.y).setDepth(10);
      const box = this.add
        .image(0, boxOffsetY, 'bet_box')
        .setDisplaySize(boxSize, boxSize);
      root.add(box);

      const coins = MainScene.NICHE_FRAC.map((n) => {
        const coin = this.add
          .image(
            n.x * boxSize,
            boxOffsetY + n.y * boxSize,
            'bet_coin',
          )
          .setDisplaySize(coinSize, coinSize)
          .setVisible(false);
        root.add(coin);
        return coin;
      });

      root.setData('foodId', food.id);
      root.setData('box', box);
      root.setData('coins', coins);
      return root;
    });

    const handTex = this.textures.get('spin_hand').getSourceImage() as {
      width: number;
    };
    this.handBaseScale = MainScene.HAND_SIZE / Math.max(1, handTex.width);

    this.spinHand = this.add
      .image(cx, cy, 'spin_hand')
      .setScale(this.handBaseScale)
      .setDepth(30)
      .setVisible(false);

    this.bindController();
    this.syncBetCoins(this.controller.currentBets || {});

    // `ready` may have already fired before this scene mounted.
    if (this.controller.currentRound?.status === 'betting') {
      this.startIdleRoam();
    }
  }

  private bindController() {
    const c = this.controller;
    if (!c) return;

    this.unsubs.push(
      c.on('bets', (bets) => {
        this.syncBetCoins(bets);
      }),
    );

    this.unsubs.push(
      c.on('ready', ({ round }) => {
        if (round?.status === 'betting') this.startIdleRoam();
      }),
    );

    this.unsubs.push(
      c.on('startBetting', () => {
        this.startIdleRoam();
      }),
    );

    this.unsubs.push(
      c.on('spinStart', () => {
        this.stopIdleRoam();
        this.winnerId = null;
        this.highlightedIndex = null;
        this.hideWinSpark();
        this.clearAllHighlights();
        this.spinHand
          ?.setVisible(true)
          .setScale(this.handBaseScale)
          .setAlpha(1);
      }),
    );

    this.unsubs.push(
      c.on('spinIndex', (idx) => {
        this.highlightedIndex = idx;
        this.moveSpinHand(idx, 'spin');
        this.highlightSlot(idx, 'spin');
      }),
    );

    this.unsubs.push(
      c.on('spinComplete', ({ winnerId }) => {
        this.winnerId = winnerId;
        const winIdx = FOOD_ITEMS.findIndex((f) => f.id === winnerId);
        this.highlightedIndex = winIdx >= 0 ? winIdx : null;
        this.moveSpinHand(winIdx, 'win');
        this.showWinSpark(winIdx);
        this.highlightSlot(winIdx, 'win');
      }),
    );

    this.unsubs.push(
      c.on('bettingCleared', () => {
        this.winnerId = null;
        this.highlightedIndex = null;
        this.stopIdleRoam();
        this.hideSpinHand();
        this.hideWinSpark();
        this.clearAllHighlights();
        this.syncBetCoins({});
      }),
    );
  }

  /** Fill left→right niches: 1 / 2 / 3 coins from relative bet size. */
  private syncBetCoins(bets: Record<string, number>) {
    this.slotRoots.forEach((root) => {
      const foodId = root.getData('foodId') as string;
      const coins = root.getData('coins') as Phaser.GameObjects.Image[];
      const amount = bets[foodId] || 0;
      const count = betCoinCount(amount, bets);
      coins.forEach((coin, i) => {
        coin.setVisible(i < count);
      });
    });
  }

  private startIdleRoam() {
    if (this.idleRoaming) return;
    this.idleRoaming = true;
    this.idleSteps = 0;
    // Antclockwise only (decreasing index — clockwise would be +1).
    this.idleDir = -1;

    const hand = this.spinHand;
    if (hand) {
      hand.setVisible(true).setAlpha(1).setScale(this.handBaseScale);
      const o = slotOffset(this.idleIndex);
      hand.setPosition(
        WHEEL.cx + o.x + MainScene.HAND_OFFSET_X,
        WHEEL.cy + o.y + MainScene.HAND_OFFSET_Y,
      );
    }

    this.highlightSlot(this.idleIndex, 'idle');
    this.scheduleIdleStep();
  }

  private stopIdleRoam() {
    this.idleRoaming = false;
    if (this.idleCall) {
      this.idleCall.remove(false);
      this.idleCall = null;
    }
  }

  private scheduleIdleStep() {
    if (this.idleCall) {
      this.idleCall.remove(false);
      this.idleCall = null;
    }
    if (!this.idleRoaming) return;
    this.idleCall = this.time.delayedCall(MainScene.IDLE_DWELL_MS, () => {
      this.idleCall = null;
      this.advanceIdleRoam();
    });
  }

  private advanceIdleRoam() {
    if (!this.idleRoaming) return;

    const n = FOOD_ITEMS.length;
    this.idleDir = -1;
    this.idleIndex = (this.idleIndex + this.idleDir + n) % n;
    this.highlightedIndex = this.idleIndex;
    this.moveSpinHand(this.idleIndex, 'spin');
    this.highlightSlot(this.idleIndex, 'idle');
    this.scheduleIdleStep();
  }

  private highlightSlot(index: number, mode: 'idle' | 'spin' | 'win') {
    const tint =
      mode === 'idle' ? MainScene.SELECTED_TINT : MainScene.SPIN_TINT;
    const scaleOn = mode === 'win' ? 1.14 : mode === 'idle' ? 1.05 : 1.08;
    const dur = mode === 'idle' ? 420 : 100;

    this.slotRoots.forEach((root, i) => {
      const active = i === index && index >= 0;
      const box = root.getData('box') as Phaser.GameObjects.Image;
      this.tweens.killTweensOf(root);
      this.tweens.killTweensOf(box);

      box.clearTint();
      box.setAlpha(1);

      if (active) {
        box.setTint(tint);
        this.tweens.add({
          targets: root,
          scale: scaleOn,
          duration: dur,
          ease: 'Sine.easeOut',
        });
      } else {
        this.tweens.add({
          targets: root,
          scale: 1,
          duration: dur,
          ease: 'Sine.easeOut',
        });
      }
    });
  }

  private clearAllHighlights() {
    this.slotRoots.forEach((root) => {
      this.tweens.killTweensOf(root);
      root.setScale(1);
      const box = root.getData('box') as Phaser.GameObjects.Image;
      this.tweens.killTweensOf(box);
      box.clearTint();
      box.setAlpha(1);
    });
  }

  private showWinSpark(index: number) {
    const spark = this.winSpark;
    const maskGfx = this.winSparkMask;
    if (!spark || !maskGfx || index < 0 || index >= FOOD_ITEMS.length) {
      this.hideWinSpark();
      return;
    }

    const o = slotOffset(index);
    const boxOffsetY = WHEEL.slotSize * MainScene.BOX_OFFSET_Y_FACTOR;
    const x = WHEEL.cx + o.x;
    const y = WHEEL.cy + o.y + boxOffsetY;
    const radius =
      (WHEEL.slotSize * MainScene.SPARK_SIZE_FACTOR) / 2;

    this.tweens.killTweensOf(spark);
    spark.clearMask(true);
    maskGfx.clear();
    maskGfx.fillStyle(0xffffff, 1);
    maskGfx.fillCircle(x, y, radius);
    spark.setMask(maskGfx.createGeometryMask());

    spark.setVisible(true);
    spark.setPosition(x, y);
    spark.setDepth(5);
    spark.setAlpha(0);
    spark.setScale(1);
    spark.setRotation(0);

    this.tweens.add({
      targets: spark,
      alpha: 1,
      duration: 220,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: spark,
      angle: 360,
      duration: 3600,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private hideWinSpark() {
    const spark = this.winSpark;
    if (!spark) return;
    this.tweens.killTweensOf(spark);
    spark.clearMask(true);
    this.winSparkMask?.clear();
    spark.setVisible(false).setAlpha(1).setScale(1).setRotation(0);
  }

  private moveSpinHand(
    index: number,
    mode: 'idle' | 'spin' | 'win',
  ) {
    const hand = this.spinHand;
    if (!hand || index < 0 || index >= FOOD_ITEMS.length) {
      this.hideSpinHand();
      return;
    }

    const o = slotOffset(index);
    const x = WHEEL.cx + o.x + MainScene.HAND_OFFSET_X;
    const y = WHEEL.cy + o.y + MainScene.HAND_OFFSET_Y;

    hand.setVisible(true);
    hand.setRotation(0);
    hand.setFlipX(false);
    hand.setFlipY(false);

    const base = this.handBaseScale;
    this.tweens.killTweensOf(hand);
    hand.setPosition(x, y);

    if (mode === 'win') {
      hand.setScale(base * 1.1);
      this.tweens.add({
        targets: hand,
        scale: base * 1.22,
        duration: 280,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
      });
    } else {
      // Fast snap (idle dwell + result spin) — same as pehle.
      hand.setScale(base);
      this.tweens.add({
        targets: hand,
        scale: base * 1.08,
        duration: 90,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
  }

  private hideSpinHand() {
    const hand = this.spinHand;
    if (!hand) return;
    this.tweens.killTweensOf(hand);
    hand.setVisible(false).setScale(this.handBaseScale);
  }

  shutdown() {
    this.stopIdleRoam();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
