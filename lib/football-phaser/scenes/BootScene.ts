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

    // No textures: the wheel scene draws with Graphics only, and the splash
    // art (/footbal2/seven.webp) is shown by the HTML splash.

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
    ) as FootballController | null;
    controller?.setLoadProgress(100);
    this.time.delayedCall(280, () => {
      this.scene.start('MainScene');
    });
  }
}
