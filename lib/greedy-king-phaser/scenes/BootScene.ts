import * as Phaser from 'phaser';
import { FOOD_ITEMS } from '../config';
import type { GreedyKingController } from '../GreedyKingController';

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
    ) as GreedyKingController | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this.load.image('logo', '/pizza/greedy_king_logo.webp');
    this.load.image('bet_box', '/gready-king/bet-box.webp');
    this.load.image('bet_coin', '/fruit-party/chips/coin_gold.webp');
    this.load.image('spin_hand', '/gready-king/spin-hand.webp');
    this.load.image('wing_spark', '/gready-king/wing-spark.webp');
    for (const food of FOOD_ITEMS) {
      this.load.image(food.textureKey, food.image);
    }

    this.load.on('progress', (value: number) => {
      controller?.setLoadProgress(value * 100);
    });

    this.load.on('complete', () => {
      controller?.setLoadProgress(100);
      this.time.delayedCall(280, () => {
        this.scene.start('MainScene');
      });
    });
  }
}
