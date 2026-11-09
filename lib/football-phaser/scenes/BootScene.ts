import * as Phaser from 'phaser';
import type { FootballController } from '../FootballController';

/**
 * Asset preload only — loading copy lives in HTML splash.
 * Outer ring logos: waiting for new assets.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const controller = this.game.registry.get(
      'controller',
    ) as FootballController | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this.load.image('splash', '/footbal2/seven.webp');
    this.load.image('wing_spark', '/greedy-lion/wing-spark.webp');

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
