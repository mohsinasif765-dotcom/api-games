import * as Phaser from 'phaser';
import { CHIPS, CHEST_ITEMS } from '../config';

/**
 * Asset preload only — splash UI lives in React/Tailwind on the page.
 * Progress is reported via game.registry callbacks.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#120805');

    this.load.image('splash', '/hero-chest/splash.webp');
    this.load.image('frame', '/hero-chest/main-frame.webp');
    this.load.image('center_hero', '/hero-chest/center-hero.webp');
    this.load.image('home_btn', '/fruit-party/home.webp');
    this.load.image('speaker_btn', '/fruit-party/speaker.webp');
    this.load.image('panel_btn', '/fruit-party/autobutton.webp');
    this.load.image('chip_gold', '/fruit-party/chips/coin_gold.webp');
    this.load.image('records_panel', '/hero-chest/records-panel.webp');

    for (const chest of CHEST_ITEMS) {
      this.load.image(chest.textureKey, chest.image);
    }
    for (const chip of CHIPS) {
      this.load.image(chip.textureKey, chip.image);
    }

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
