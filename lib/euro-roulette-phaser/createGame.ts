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
      // Fit the wheel stage box — no crop jump
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      autoRound: true,
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

  // Keep FIT square when HUD/grid reflows (otherwise canvas CSS can look “tedha”).
  const refresh = () => {
    try {
      game.scale.refresh();
    } catch {
      /* destroyed */
    }
  };
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => refresh())
      : null;
  ro?.observe(parent);
  window.addEventListener('resize', refresh);
  game.events.once('destroy', () => {
    ro?.disconnect();
    window.removeEventListener('resize', refresh);
  });
  requestAnimationFrame(refresh);

  return game;
}
