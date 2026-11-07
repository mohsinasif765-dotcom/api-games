import * as Phaser from 'phaser';
import { MULTIPLIERS, SYMBOLS } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#1a0a05');

    const v = 'v=12';
    // In-game atmosphere BG (loading splash uses splash.webp separately in page.tsx)
    this.load.image('splash', `/luckygem/bg.webp?${v}`);

    for (const s of SYMBOLS) {
      this.load.image(s.textureKey, `${s.image}?${v}`);
    }
    for (const m of MULTIPLIERS) {
      this.load.image(m.textureKey, `${m.image}?${v}`);
    }

    // Shared chrome
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
