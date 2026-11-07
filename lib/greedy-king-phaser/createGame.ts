import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { GreedyKingController } from './GreedyKingController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateGreedyKingGameOptions = {
  parent: HTMLElement;
  controller: GreedyKingController;
};

export function createGreedyKingGame({
  parent,
  controller,
}: CreateGreedyKingGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#00000000',
    transparent: true,
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
  return game;
}
