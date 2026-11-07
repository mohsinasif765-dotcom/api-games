import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { LuckyGemController } from './LuckyGemController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateLuckyGemGameOptions = {
  parent: HTMLElement;
  controller: LuckyGemController;
  onLoadProgress?: (pct: number) => void;
  onGameReady?: () => void;
};

export function createLuckyGemGame({
  parent,
  controller,
  onLoadProgress,
  onGameReady,
}: CreateLuckyGemGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#120805',
    scene: [BootScene, MainScene],
    scale: {
      // FIT = entire 780×1440 game visible (ENVELOP was cropping with negative margin)
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      autoRound: true,
    },
    render: {
      antialias: true,
      roundPixels: true,
      powerPreference: 'high-performance',
    },
    audio: { disableWebAudio: false },
    banner: false,
  });

  game.registry.set('controller', controller);
  if (onLoadProgress) game.registry.set('onLoadProgress', onLoadProgress);
  if (onGameReady) game.registry.set('onGameReady', onGameReady);
  return game;
}
