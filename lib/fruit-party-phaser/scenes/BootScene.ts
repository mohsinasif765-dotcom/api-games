import * as Phaser from 'phaser';
import { CHIPS, FRUIT_ITEMS } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.setBackgroundColor('#1a0530');

    let splash: Phaser.GameObjects.Image | null = null;

    const barY = height * 0.9;
    const barMax = width * 0.62;
    const barBg = this.add
      .rectangle(cx, barY, barMax, 8, 0xffffff, 0.18)
      .setOrigin(0.5)
      .setDepth(2);
    const barFill = this.add
      .rectangle(cx - barMax / 2, barY, 0, 8, 0xffd54f)
      .setOrigin(0, 0.5)
      .setDepth(3);
    const pctText = this.add
      .text(cx, barY + 18, 'Loading 0%', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#ffffffcc',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);

    this.load.image('splash', '/fruit-party/splash.jpg');
    this.load.image('bg_mage', '/fruit-party/bg-mage.webp');
    this.load.image('frame', '/fruit-party/partymain-frame.webp');
    this.load.image('chip_gold', '/fruit-party/chips/coin_gold.webp');
    this.load.image('cell_box1', '/fruit-party/box1.webp');
    this.load.image('cell_box2', '/fruit-party/box2.webp');
    this.load.image('timer_box', '/fruit-party/timer-box.webp');
    this.load.image('timer_box_light', '/fruit-party/timerboxlight.webp');
    this.load.image('cell_highlight', '/fruit-party/highlight.webp');
    this.load.image('win_spark', '/fruit-party/win-spark.webp');
    this.load.image('result_popup', '/fruit-party/result-popup.webp');
    this.load.image('chip_pill_on', '/fruit-party/chip_pill_selected.webp');
    this.load.image('chip_pill_off', '/fruit-party/chip_pill_unselected.webp');
    this.load.image('chip_pedestal_on', '/fruit-party/chip_pedestal_selected.webp');
    this.load.image('chip_pedestal_off', '/fruit-party/chip_pedestal_unselected.webp');
    this.load.image('auto_btn', '/fruit-party/autobutton.webp');
    this.load.image('speaker_btn', '/fruit-party/speaker.webp');
    this.load.image('home_btn', '/fruit-party/home.webp');

    for (const fruit of FRUIT_ITEMS) {
      this.load.image(fruit.textureKey, fruit.image);
    }
    for (const chip of CHIPS) {
      this.load.image(chip.textureKey, chip.image);
    }

    this.load.on('filecomplete-image-splash', () => {
      splash = this.add.image(cx, height / 2, 'splash').setDepth(0);
      const cover = Math.max(width / splash.width, height / splash.height);
      splash.setScale(cover);
    });

    this.load.on('progress', (value: number) => {
      barFill.width = barMax * value;
      pctText.setText(`Loading ${Math.floor(value * 100)}%`);
    });

    this.load.on('complete', () => {
      barFill.width = barMax;
      pctText.setText('Loading 100%');
      const fadeTargets: Phaser.GameObjects.GameObject[] = [
        barBg,
        barFill,
        pctText,
      ];
      if (splash) fadeTargets.push(splash);
      this.tweens.add({
        targets: fadeTargets,
        alpha: 0,
        duration: 450,
        delay: 280,
        onComplete: () => {
          this.scene.start('MainScene', {
            controller: this.game.registry.get('controller'),
          });
        },
      });
    });
  }
}
