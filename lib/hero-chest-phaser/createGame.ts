import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { HeroChestController } from './HeroChestController';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';

export type CreateHeroChestGameOptions = {
  parent: HTMLElement;
  controller: HeroChestController;
  onLoadProgress?: (pct: number) => void;
  onGameReady?: () => void;
};

export function createHeroChestGame({
  parent,
  controller,
  onLoadProgress,
  onGameReady,
}: CreateHeroChestGameOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1a0a05',
    scene: [BootScene, MainScene],
    scale: {
      // Fill the phone WebView edge-to-edge (no skinny letterbox sides)
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
      transparent: false,
    },
    audio: {
      disableWebAudio: false,
    },
    // Animated win-box.gif is shown via DOM (Phaser can't play GIFs)
    dom: {
      createContainer: true,
    },
    banner: false,
  });

  game.registry.set('controller', controller);
  if (onLoadProgress) game.registry.set('onLoadProgress', onLoadProgress);
  if (onGameReady) game.registry.set('onGameReady', onGameReady);
  return game;
}
