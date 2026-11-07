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

    this.load.image('wing_spark', '/gready-king/wing-spark.webp');
    // spinner-art.png kept on disk; live disc is code-baked in MainScene.
    for (const opt of BET_OPTIONS) {
      this.load.image(opt.textureKey, opt.image);
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
