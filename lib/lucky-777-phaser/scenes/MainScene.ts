import * as Phaser from 'phaser';
import {
  WHEEL,
  WHEEL_SEGMENTS,
  WHEEL_SPIN_MS,
  WHEEL_SPIN_LOOPS,
  WHEEL_ART_KEY,
  GAME_WIDTH,
} from '../config';
import type { Lucky777Controller } from '../Lucky777Controller';

/**
 * Single disc art (fruits baked into wheel.png). No overlay sprites.
 */
export class MainScene extends Phaser.Scene {
  private controller: Lucky777Controller | null = null;
  private unsubs: Array<() => void> = [];
  private wheelRoot: Phaser.GameObjects.Container | null = null;
  private wheelDisc: Phaser.GameObjects.Image | null = null;
  private highlightedIndex: number | null = null;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private blinkOn = false;
  private spinTween: Phaser.Tweens.Tween | null = null;
  private pendingWinIndex: number | null = null;
  private texSize = 0;

  constructor() {
    super('MainScene');
  }

  create() {
    this.controller = this.game.registry.get(
      'controller',
    ) as Lucky777Controller;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    const { cx, cy } = WHEEL;
    this.texSize = GAME_WIDTH;

    this.wheelRoot = this.add.container(cx, cy).setDepth(5);
    this.wheelDisc = this.add
      .image(0, 0, WHEEL_ART_KEY)
      .setDisplaySize(this.texSize, this.texSize);
    this.wheelRoot.add(this.wheelDisc);

    this.bindController();
  }

  private setDiscHighlight(on: boolean) {
    const disc = this.wheelDisc;
    if (!disc) return;
    if (on) disc.setTint(0xfff0a0);
    else disc.clearTint();
  }

  private angleForSlice(idx: number): number {
    const n = WHEEL_SEGMENTS.length;
    return -((idx * 360) / n);
  }

  private killSpinTween() {
    if (this.spinTween) {
      this.spinTween.stop();
      this.spinTween = null;
    }
    if (this.wheelRoot) {
      this.tweens.killTweensOf(this.wheelRoot);
    }
  }

  private spinWheelTo(winIdx: number) {
    const root = this.wheelRoot;
    if (!root || winIdx < 0) return;

    this.killSpinTween();
    this.setDiscHighlight(false);

    const target = this.angleForSlice(winIdx);
    const current = root.angle;
    const currentMod = ((current % 360) + 360) % 360;
    const targetMod = ((target % 360) + 360) % 360;

    let delta = currentMod - targetMod;
    if (delta <= 0) delta += 360;
    delta += 360 * WHEEL_SPIN_LOOPS;

    this.spinTween = this.tweens.add({
      targets: root,
      angle: current - delta,
      duration: WHEEL_SPIN_MS,
      ease: 'Linear',
      onComplete: () => {
        this.spinTween = null;
        root.setAngle(this.angleForSlice(winIdx));
      },
    });
  }

  private clearHighlight() {
    this.stopWinBlink();
    this.highlightedIndex = null;
    this.setDiscHighlight(false);
  }

  private stopWinBlink() {
    if (this.blinkTimer) {
      this.blinkTimer.remove(false);
      this.blinkTimer = null;
    }
    this.blinkOn = false;
  }

  private startWinBlink(winIdx: number) {
    this.stopWinBlink();
    if (winIdx < 0) return;

    this.highlightedIndex = winIdx;
    this.blinkOn = true;
    this.setDiscHighlight(true);

    this.blinkTimer = this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        this.blinkOn = !this.blinkOn;
        this.setDiscHighlight(this.blinkOn);
      },
    });
  }

  private bindController() {
    const c = this.controller;
    if (!c) return;

    this.unsubs.push(
      c.on('spinStart', ({ winIndex }) => {
        this.clearHighlight();
        this.pendingWinIndex = winIndex;
        this.spinWheelTo(winIndex);
      }),
    );

    this.unsubs.push(
      c.on('spinComplete', ({ winnerId }) => {
        let winIdx = this.pendingWinIndex ?? -1;
        if (winIdx < 0 || WHEEL_SEGMENTS[winIdx]?.id !== winnerId) {
          winIdx = WHEEL_SEGMENTS.findIndex((t) => t.id === winnerId);
        }
        this.pendingWinIndex = null;
        if (this.wheelRoot && winIdx >= 0) {
          this.killSpinTween();
          this.wheelRoot.setAngle(this.angleForSlice(winIdx));
        }
        this.startWinBlink(winIdx);
      }),
    );

    this.unsubs.push(
      c.on('bettingCleared', () => {
        this.clearHighlight();
      }),
    );
  }

  shutdown() {
    this.killSpinTween();
    this.stopWinBlink();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
