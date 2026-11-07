import * as Phaser from 'phaser';
import type { TeenPattiController } from '../TeenPattiController';

/** Ambient canvas — party cards / flags live in the React HUD. */
export class MainScene extends Phaser.Scene {
  private unsubs: Array<() => void> = [];

  constructor() {
    super('MainScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    const controller = this.game.registry.get(
      'controller',
    ) as TeenPattiController | null;
    if (!controller) return;

    // Keep scene alive for load lifecycle; HUD owns interactive board.
    this.unsubs.push(controller.on('spinStart', () => {}));
    this.unsubs.push(controller.on('spinComplete', () => {}));
  }

  shutdown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
