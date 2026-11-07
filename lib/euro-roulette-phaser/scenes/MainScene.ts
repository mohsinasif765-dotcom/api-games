import * as Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  wheelAngleForNumber,
} from '../config';
import type { EuroRouletteController } from '../EuroRouletteController';

/**
 * Photo spinner locked at stage center — original wheel numbers (no text overlay).
 */
export class MainScene extends Phaser.Scene {
  private ctrl!: EuroRouletteController;
  private wheel!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private resultText!: Phaser.GameObjects.Text;
  private readonly cx = GAME_WIDTH / 2;
  private readonly cy = GAME_HEIGHT / 2;
  private wheelR = 0;
  private offs: Array<() => void> = [];
  private spinning = false;
  private ballAngle = -90;
  private ballRadius = 0;
  private spinTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super('MainScene');
  }

  create() {
    this.ctrl = this.game.registry.get(
      'controller',
    ) as EuroRouletteController;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    // Leave padding so top rim + pointer are never cropped by the stage.
    this.wheelR = Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.44;
    const wheelSize = Math.round(this.wheelR * 2);
    this.wheel = this.add
      .image(this.cx, this.cy, 'euro_wheel')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(wheelSize, wheelSize)
      .setDepth(1);
    // Lock uniform scale in case texture isn't perfectly square
    const sx = this.wheel.scaleX;
    this.wheel.setScale(sx);

    const tipY = this.cy - this.wheelR + 2;
    const pointer = this.add.graphics().setDepth(4);
    pointer.fillStyle(0xf5e6a3, 1);
    pointer.fillTriangle(
      this.cx,
      tipY - 20,
      this.cx - 14,
      tipY + 6,
      this.cx + 14,
      tipY + 6,
    );
    pointer.lineStyle(2, 0x8b6914, 1);
    pointer.strokeTriangle(
      this.cx,
      tipY - 20,
      this.cx - 14,
      tipY + 6,
      this.cx + 14,
      tipY + 6,
    );

    if (!this.textures.exists('euro_ball')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 14);
      g.fillStyle(0xf0f0f0, 1);
      g.fillCircle(11, 11, 5);
      g.generateTexture('euro_ball', 32, 32);
      g.destroy();
    }

    this.ballRadius = this.wheelR * 0.78;
    this.ball = this.add
      .image(this.cx, this.cy - this.ballRadius, 'euro_ball')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(20, 20)
      .setDepth(5)
      .setVisible(false);

    this.resultText = this.add
      .text(this.cx, this.cy + this.wheelR + 28, '', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '36px',
        color: '#f5e6a3',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(6);

    this.bindController();
  }

  private placeBall() {
    const rad = Phaser.Math.DegToRad(this.ballAngle);
    this.ball.setPosition(
      this.cx + Math.cos(rad) * this.ballRadius,
      this.cy + Math.sin(rad) * this.ballRadius,
    );
  }

  private clearSpinTweens() {
    for (const t of this.spinTweens) {
      t.stop();
      t.remove();
    }
    this.spinTweens = [];
  }

  private bindController() {
    const c = this.ctrl;
    this.offs = [
      c.on('spinStart', ({ winnerNumber }) => {
        this.spinTo(winnerNumber);
      }),
      c.on('spinComplete', () => {
        /* no number under wheel — result is only in HUD popup / NEW badge */
      }),
      c.on('bettingCleared', () => {
        this.resultText.setAlpha(0).setText('');
        this.spinning = false;
        this.ball.setVisible(false);
      }),
      c.on('startBetting', () => {
        this.resultText.setAlpha(0).setText('');
        this.ball.setVisible(false);
      }),
    ];
  }

  private spinTo(n: number) {
    this.clearSpinTweens();
    this.spinning = true;
    this.resultText.setAlpha(0);

    this.wheel.setPosition(this.cx, this.cy);
    this.wheel.setOrigin(0.5, 0.5);
    // Keep X/Y scale identical every spin (non-uniform = oval wobble)
    const s = Math.min(this.wheel.scaleX, this.wheel.scaleY) || this.wheel.scaleX;
    this.wheel.setScale(s);

    const target = wheelAngleForNumber(n);
    const current = this.wheel.angle;
    const curNorm = ((current % 360) + 360) % 360;
    const tgtNorm = ((target % 360) + 360) % 360;
    let wheelTravel = tgtNorm - curNorm - 360 * 5;
    if (wheelTravel > -360 * 4) wheelTravel -= 360;

    const trackR = this.wheelR * 0.86;
    const pocketR = this.wheelR * 0.72;
    this.ballRadius = trackR;
    // Ball runs the OPPOSITE way from the wheel, then settles under the top pointer
    const ballDir = wheelTravel < 0 ? 1 : -1;
    this.ballAngle = -90 + ballDir * Phaser.Math.Between(15, 55);
    this.ball.setVisible(true);
    this.placeBall();

    const ballState = {
      angle: this.ballAngle,
      radius: this.ballRadius,
    };
    const ballEndAngle = -90 + ballDir * 360 * 7;

    const syncBall = () => {
      this.ballAngle = ballState.angle;
      this.ballRadius = ballState.radius;
      this.placeBall();
    };

    this.spinTweens.push(
      this.tweens.add({
        targets: this.wheel,
        angle: current + wheelTravel,
        duration: 8800,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          this.wheel.setPosition(this.cx, this.cy);
        },
        onComplete: () => {
          this.wheel.angle = target;
          this.wheel.setPosition(this.cx, this.cy);
        },
      }),
      this.tweens.add({
        targets: ballState,
        angle: ballEndAngle,
        duration: 8800,
        ease: 'Cubic.easeOut',
        onUpdate: syncBall,
      }),
      this.tweens.add({
        targets: ballState,
        radius: pocketR,
        duration: 2200,
        delay: 6600,
        ease: 'Bounce.easeOut',
        onUpdate: syncBall,
        onComplete: () => {
          this.ballAngle = -90;
          this.ballRadius = pocketR;
          this.placeBall();
          this.spinning = false;
        },
      }),
    );
  }

  shutdown() {
    this.clearSpinTweens();
    this.offs.forEach((off) => off());
    this.offs = [];
  }
}
