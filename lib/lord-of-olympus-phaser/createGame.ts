import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { LordOfOlympusController } from './LordOfOlympusController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateLordOfOlympusGameOptions = {
  parent: HTMLElement;
  controller: LordOfOlympusController;
  onLoadProgress?: (pct: number) => void;
  onGameReady?: () => void;
};

export function createLordOfOlympusGame({
  parent,
  controller,
  onLoadProgress,
  onGameReady,
}: CreateLordOfOlympusGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1a0a2e',
    scene: [BootScene, MainScene],
    scale: {
      // Full mobile width in Flutter bottom sheet (FIT left empty sides)
      mode: Phaser.Scale.ENVELOP,
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
