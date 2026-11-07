import * as Phaser from 'phaser';
import {
  GAME_WIDTH,
  WHEEL,
  WHEEL_SEGMENTS,
  WHEEL_SPIN_LOOPS,
  WHEEL_SPIN_MS,
  WHEEL_NEON,
  WHEEL_NEON_OUTER,
  SLICE_HIGHLIGHT,
  SLICE_HIGHLIGHT_INNER,
  SLICE_HIGHLIGHT_MID,
  SLICE_HIGHLIGHT_GLOSS,
  SLICE_HIGHLIGHT_EDGE,
  segmentOffset,
  segmentStartRad,
  slicePalette,
  type SlicePalette,
} from '../config';
import type { Lucky77Controller } from '../Lucky77Controller';

const TEX_BASE = 'l77_wheel_base';
const texWin = (i: number) => `l77_wheel_win_${i}`;

function hexToColor(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/**
 * Code-drawn disc baked once (same colors as spinner-art.png).
 * Image assets are kept on disk but not used for the live spin.
 * Win blink swaps prebaked textures — exact one-slice gold.
 */
export class MainScene extends Phaser.Scene {
  private controller: Lucky77Controller | null = null;
  private unsubs: Array<() => void> = [];
  private wheelRoot: Phaser.GameObjects.Container | null = null;
  private wheelDisc: Phaser.GameObjects.Image | null = null;
  private logoNodes: Phaser.GameObjects.Image[] = [];
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private blinkOn = false;
  private spinTween: Phaser.Tweens.Tween | null = null;
  private pendingWinIndex: number | null = null;
  private texSize = 0;

  constructor() {
    super('MainScene');
  }

  create() {
    this.controller = this.game.registry.get('controller') as Lucky77Controller;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    const { cx, cy, logoSize } = WHEEL;
    this.texSize = GAME_WIDTH;

    this.bakeWheelTextures();

    this.wheelRoot = this.add.container(cx, cy).setDepth(5);
    this.wheelDisc = this.add
      .image(0, 0, TEX_BASE)
      .setDisplaySize(this.texSize, this.texSize);
    this.wheelRoot.add(this.wheelDisc);

    this.logoNodes = WHEEL_SEGMENTS.map((opt, i) => {
      const o = segmentOffset(i);
      const img = this.add
        .image(o.x, o.y, opt.textureKey)
        .setDisplaySize(logoSize, logoSize);
      this.wheelRoot!.add(img);
      return img;
    });

    // Gold V pointer: CSS clipped to wheel hole (under faream) — see Lucky77Hud.

    this.bindController();
  }

  private bakeWheelTextures() {
    const size = this.texSize;
    const ox = size / 2;
    const oy = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    this.paintWheel(g, ox, oy, -1);
    if (this.textures.exists(TEX_BASE)) this.textures.remove(TEX_BASE);
    g.generateTexture(TEX_BASE, size, size);
    g.clear();

    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
      const key = texWin(i);
      this.paintWheel(g, ox, oy, i);
      if (this.textures.exists(key)) this.textures.remove(key);
      g.generateTexture(key, size, size);
      g.clear();
    }

    g.destroy();
  }

  private fillSlice(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    radius: number,
    start: number,
    end: number,
    hex: string,
    alpha = 1,
  ) {
    g.fillStyle(hexToColor(hex), alpha);
    g.slice(ox, oy, radius, start, end, false);
    g.fillPath();
  }

  private drawJewelSlice(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    start: number,
    end: number,
    palette: SlicePalette,
    outerRadius: number,
    glowStrength: number,
  ) {
    this.fillSlice(g, ox, oy, outerRadius, start, end, palette.base);
    this.fillSlice(
      g,
      ox,
      oy,
      outerRadius * 0.52,
      start,
      end,
      palette.inner,
      0.55,
    );

    const sheenStart = start + (end - start) * 0.05;
    const sheenEnd = start + (end - start) * 0.28;
    this.fillSlice(g, ox, oy, outerRadius, sheenStart, sheenEnd, '#FFFFFF', 0.16);

    const pad = 0.035;
    g.lineStyle(5, hexToColor(palette.gloss), 0.35 + glowStrength * 0.35);
    g.beginPath();
    g.arc(ox, oy, outerRadius - 5, start + pad, end - pad, false);
    g.strokePath();

    g.lineStyle(2.2, 0xffffff, 0.22 + glowStrength * 0.35);
    g.beginPath();
    g.arc(ox, oy, outerRadius - 11, start + pad * 1.4, end - pad * 1.4, false);
    g.strokePath();
  }

  private drawGoldWinSlice(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    start: number,
    end: number,
    outerRadius: number,
  ) {
    this.fillSlice(g, ox, oy, outerRadius, start, end, SLICE_HIGHLIGHT_INNER);
    this.fillSlice(g, ox, oy, outerRadius * 0.9, start, end, SLICE_HIGHLIGHT_MID);
    this.fillSlice(g, ox, oy, outerRadius * 0.72, start, end, SLICE_HIGHLIGHT);
    this.fillSlice(
      g,
      ox,
      oy,
      outerRadius * 0.42,
      start,
      end,
      SLICE_HIGHLIGHT_INNER,
      0.85,
    );

    const sheenStart = start + (end - start) * 0.04;
    const sheenEnd = start + (end - start) * 0.32;
    this.fillSlice(g, ox, oy, outerRadius, sheenStart, sheenEnd, '#FFFFFF', 0.42);
    this.fillSlice(
      g,
      ox,
      oy,
      outerRadius * 0.82,
      sheenStart,
      sheenEnd,
      SLICE_HIGHLIGHT_GLOSS,
      0.55,
    );

    const shadeStart = start + (end - start) * 0.68;
    this.fillSlice(g, ox, oy, outerRadius, shadeStart, end, '#6D4C00', 0.35);

    const pad = 0.03;
    g.lineStyle(7, hexToColor(SLICE_HIGHLIGHT_EDGE), 0.95);
    g.beginPath();
    g.arc(ox, oy, outerRadius - 4, start + pad, end - pad, false);
    g.strokePath();

    g.lineStyle(3.5, 0xffffff, 0.75);
    g.beginPath();
    g.arc(ox, oy, outerRadius - 10, start + pad * 1.5, end - pad * 1.5, false);
    g.strokePath();
  }

  private paintWheel(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    activeIndex: number,
  ) {
    const { outerRadius, hubRadius } = WHEEL;
    const n = WHEEL_SEGMENTS.length;
    const slice = (Math.PI * 2) / n;

    g.fillStyle(0x0a0520, 0.4);
    g.fillCircle(ox, oy, outerRadius + 1);

    for (let i = 0; i < n; i++) {
      const start = segmentStartRad(i);
      const end = start + slice;
      if (i === activeIndex) {
        this.drawGoldWinSlice(g, ox, oy, start, end, outerRadius);
        continue;
      }
      const isJackpot = WHEEL_SEGMENTS[i]?.id === 'seventy_seven';
      this.drawJewelSlice(
        g,
        ox,
        oy,
        start,
        end,
        slicePalette(i),
        outerRadius,
        isJackpot ? 0.55 : 0.22,
      );
    }

    // Soft seam only — gold spokes are drawn fixed above the disc.
    for (let i = 0; i < n; i++) {
      const a = segmentStartRad(i);
      const x1 = ox + Math.cos(a) * (hubRadius + 4);
      const y1 = oy + Math.sin(a) * (hubRadius + 4);
      const x2 = ox + Math.cos(a) * (outerRadius - 3);
      const y2 = oy + Math.sin(a) * (outerRadius - 3);
      g.lineStyle(1.2, 0x1a0030, 0.35);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }

    // Neon rim like spinner-art
    g.lineStyle(7, hexToColor(WHEEL_NEON), 0.95);
    g.strokeCircle(ox, oy, outerRadius - 2);
    g.lineStyle(3, hexToColor(WHEEL_NEON_OUTER), 0.75);
    g.strokeCircle(ox, oy, outerRadius - 7);
    g.lineStyle(2, 0xffffff, 0.35);
    g.strokeCircle(ox, oy, outerRadius - 11);

    // Hub
    g.lineStyle(5, hexToColor(WHEEL_NEON), 0.9);
    g.strokeCircle(ox, oy, hubRadius + 8);
    g.lineStyle(2, hexToColor(WHEEL_NEON_OUTER), 0.7);
    g.strokeCircle(ox, oy, hubRadius + 5);
    g.fillStyle(0x1a0538, 0.98);
    g.fillCircle(ox, oy, hubRadius + 1);
  }

  private setDiscTexture(activeIndex: number) {
    const disc = this.wheelDisc;
    if (!disc) return;
    const key = activeIndex >= 0 ? texWin(activeIndex) : TEX_BASE;
    if (disc.texture.key !== key) {
      disc.setTexture(key);
      disc.setDisplaySize(this.texSize, this.texSize);
    }
  }

  private setLogoHighlight(activeIndex: number, grow = 1.1) {
    const base = WHEEL.logoSize;
    this.logoNodes.forEach((img, i) => {
      const size = i === activeIndex ? base * grow : base;
      img.setDisplaySize(size, size);
      img.setAlpha(activeIndex >= 0 && i !== activeIndex ? 0.75 : 1);
    });
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
    this.setDiscTexture(-1);

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
    this.setDiscTexture(-1);
    this.setLogoHighlight(-1);
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

    this.blinkOn = true;
    this.setDiscTexture(winIdx);
    this.setLogoHighlight(winIdx, 1.14);

    this.blinkTimer = this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        this.blinkOn = !this.blinkOn;
        this.setDiscTexture(this.blinkOn ? winIdx : -1);
        this.setLogoHighlight(this.blinkOn ? winIdx : -1, 1.14);
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

  private destroyBakedTextures() {
    if (this.textures.exists(TEX_BASE)) this.textures.remove(TEX_BASE);
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
      const key = texWin(i);
      if (this.textures.exists(key)) this.textures.remove(key);
    }
  }

  shutdown() {
    this.killSpinTween();
    this.stopWinBlink();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.destroyBakedTextures();
  }
}
