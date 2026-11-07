import * as Phaser from 'phaser';
import type { FootballController } from '../FootballController';

/**
 * Transparent scene — outer logo spin / win glow is HTML (aligned to ring).
 * Kept so Boot → Main lifecycle and controller registry stay intact.
 */
export class MainScene extends Phaser.Scene {
  private controller: FootballController | null = null;
  private unsubs: Array<() => void> = [];

  constructor() {
    super('MainScene');
  }

  create() {
    this.controller = this.game.registry.get(
      'controller',
    ) as FootballController;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    void this.controller;
  }

  shutdown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
