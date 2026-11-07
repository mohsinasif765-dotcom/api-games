import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { FruitPartyController } from './FruitPartyController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateFruitPartyGameOptions = {
  parent: HTMLElement;
  controller: FruitPartyController;
};

export function createFruitPartyGame({
  parent,
  controller,
}: CreateFruitPartyGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0d0518',
    scene: [BootScene, MainScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    audio: {
      disableWebAudio: false,
    },
    banner: false,
  });

  game.registry.set('controller', controller);

  // BootScene transitions to MainScene; ensure controller is passed
  game.events.once('ready', () => {
    // MainScene reads registry in init/create
  });

  return game;
}
