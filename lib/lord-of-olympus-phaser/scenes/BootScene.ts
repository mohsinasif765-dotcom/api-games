import * as Phaser from 'phaser';
import { SYMBOLS } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#1a0a2e');

    const v = 'v=5';
    // Loading splash stays splash.webp (page.tsx). In-game atmosphere uses bg.webp.
    this.load.image('game_bg', `/loard-of-olympus/bg.webp?${v}`);
    this.load.image('zeus_bust', `/loard-of-olympus/zeus-bust.webp?${v}`);
    this.load.image('main_frame', `/loard-of-olympus/main-container.webp?${v}`);

    for (const s of SYMBOLS) {
      this.load.image(s.textureKey, `${s.image}?${v}`);
    }

    this.load.image('home_btn', '/fruit-party/home.webp');
    this.load.image('speaker_btn', '/fruit-party/speaker.webp');
    this.load.image('chip_gold', '/fruit-party/chips/coin_gold.webp');

    const onProgress = this.game.registry.get('onLoadProgress') as
      | ((pct: number) => void)
      | undefined;

    this.load.on('progress', (value: number) => {
      onProgress?.(Math.round(Phaser.Math.Clamp(value, 0, 1) * 100));
    });

    this.load.on('complete', () => {
      onProgress?.(100);
      this.scene.start('MainScene', {
        controller: this.game.registry.get('controller'),
      });
    });
  }
}
