import * as Phaser from 'phaser';
import { FOOD_ITEMS } from '../config';
import type { GreedyBabyController } from '../GreedyBabyController';

/**
 * Asset preload only — no labels / Phaser Text (loading copy lives in HTML splash).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const controller = this.game.registry.get(
      'controller',
    ) as GreedyBabyController | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // (baby.webp is HUD art — not used by the scene.)
    this.load.image('bet_box', '/greedy-lion/bet-box.webp');
    // 64px coin (shown ~11px) instead of the 400px chip.
    this.load.image('bet_coin', '/greedy-lion/bet-coin.webp');
    this.load.image('spin_hand', '/greedy-lion/spin-hand.webp');
    // Pre-cropped win glow (what spark.setScale(1) used to reveal), 3 KB vs 86 KB.
    this.load.image('wing_spark', '/greedy-lion/wing-spark-glow.webp');
    for (const food of FOOD_ITEMS) {
      this.load.image(food.textureKey, food.image);
    }

    this.load.on('progress', (value: number) => {
      controller?.setLoadProgress(value * 100);
    });

  }

  /**
   * Runs after preload finishes — also when nothing was queued (Phaser skips
   * the loader 'complete' event in that case, which would strand the splash).
   */
  create() {
    const controller = this.game.registry.get(
      'controller',
    ) as GreedyBabyController | null;
    controller?.setLoadProgress(100);
    this.time.delayedCall(280, () => {
      this.scene.start('MainScene');
    });
  }
}
