import * as Phaser from 'phaser';
import { WHEEL_ART, WHEEL_ART_KEY } from '../config';
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

    // The scene draws only the wheel disc (fruits are baked into it); option
    // art is shown by the HTML HUD, so don't decode it again in WebGL.
    this.load.image(WHEEL_ART_KEY, WHEEL_ART);

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
    ) as Lucky777Controller | null;
    controller?.setLoadProgress(100);
    this.time.delayedCall(280, () => {
      this.scene.start('MainScene');
    });
  }
}
