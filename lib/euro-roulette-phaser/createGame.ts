import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { EuroRouletteController } from './EuroRouletteController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateEuroRouletteGameOptions = {
  parent: HTMLElement;
  controller: EuroRouletteController;
};

export function createEuroRouletteGame({
  parent,
  controller,
}: CreateEuroRouletteGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#00000000',
    transparent: true,
    scene: [BootScene, MainScene],
    scale: {
      // The square canvas host is sized and scaled together with the HUD.
      mode: Phaser.Scale.NONE,
    },
    render: {
      antialias: true,
      // roundPixels makes rotating sprites wobble
      roundPixels: false,
      powerPreference: 'high-performance',
      transparent: true,
    },
    audio: {
      disableWebAudio: false,
    },
    banner: false,
  });

  game.registry.set('controller', controller);
  return game;
}
