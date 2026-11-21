import * as Phaser from 'phaser';
import { BET_OPTIONS } from '../config';
import type { Lucky77Controller } from '../Lucky77Controller';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const controller = this.game.registry.get(
      'controller',
    ) as Lucky77Controller | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // spinner-art.png kept on disk; live disc is code-baked in MainScene.
    // Wheel logos: 256px copies (scripts/build-phaser-lite-assets.mjs).
    for (const opt of BET_OPTIONS) {
      this.load.image(opt.textureKey, opt.image);
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
    ) as Lucky77Controller | null;
    controller?.setLoadProgress(100);
    this.time.delayedCall(280, () => {
      this.scene.start('MainScene');
    });
  }
}
