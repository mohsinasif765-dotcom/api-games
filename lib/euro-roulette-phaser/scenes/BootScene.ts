import * as Phaser from 'phaser';
import type { EuroRouletteController } from '../EuroRouletteController';

/** Preload spinner asset from /euro-roulette/wheel.webp */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const controller = this.game.registry.get(
      'controller',
    ) as EuroRouletteController | null;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // cache-bust when wheel art is replaced (circular transparent trim)
    this.load.image('euro_wheel', '/euro-roulette/wheel.webp?v=17');

    this.load.on('progress', (value: number) => {
      controller?.setLoadProgress(Math.floor(value * 100));
    });
    this.load.on('complete', () => {
      controller?.setLoadProgress(100);
      this.time.delayedCall(200, () => {
        this.scene.start('MainScene');
      });
    });
  }
}
