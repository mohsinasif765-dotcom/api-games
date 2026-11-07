import * as Phaser from 'phaser';
import { BET_OPTIONS, WHEEL_ART, WHEEL_ART_KEY } from '../config';
import type { Lucky777Controller } from '../Lucky777Controller';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const controller = this.game.registry.get(
      'controller',
    ) as Lucky777Controller | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this.load.image('wing_spark', '/gready-king/wing-spark.webp');
    this.load.image(WHEEL_ART_KEY, WHEEL_ART);
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
