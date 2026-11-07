import * as Phaser from 'phaser';
import {
  MULTIPLIERS,
  PAYLINES,
  SYMBOLS,
  WHEEL_SEGMENTS,
  multById,
  pickWeighted,
  symbolById,
  type MultId,
  type SymbolId,
  type WheelSeg,
} from '../config';
import { drawTempleFrame } from '../drawTempleFrame';
import type { LuckyGemController } from '../LuckyGemController';

function crisp(text: Phaser.GameObjects.Text) {
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(window.devicePixelRatio || 2, 3)
      : 2;
  text.setResolution(dpr);
  return text;
}

function formatCoins(n: number) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    const v = abs / 1_000_000_000;
    return `${sign}${trimDec(v)}B`;
  }
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${trimDec(v)}M`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    return `${sign}${trimDec(v)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

function trimDec(v: number) {
  if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.05) {
    return String(Math.round(v));
  }
  return v.toFixed(1).replace(/\.0$/, '');
}

type CellView = {
  img: Phaser.GameObjects.Image;
  cx: number;
  cy: number;
  size: number;
};


export class MainScene extends Phaser.Scene {
  private ctrl!: LuckyGemController;
  private unsubs: Array<() => void> = [];

  private balanceText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private spinBtn!: Phaser.GameObjects.Container;
  private fastBtn!: Phaser.GameObjects.Container;
  private muteBtn!: Phaser.GameObjects.Image;

  private cells: CellView[] = [];
  private specialImgs: Phaser.GameObjects.Image[] = [];
  private specialCx = 0;
  private specialSize = 0;
  private lineGfx!: Phaser.GameObjects.Graphics;

  private wheel!: Phaser.GameObjects.Container;
  private wheelSegs: WheelSeg[] = WHEEL_SEGMENTS;
  private pendingWheel: WheelSeg | null = null;

  private pendingGrid: SymbolId[] | null = null;
  private pendingSpecial: MultId | null = null;
  private pendingTotalWin = 0;
  private pendingLineWins: Array<{ line: number; symbol: SymbolId; payout: number }> =
    [];
  private landing = false;
  private resultPopup: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('MainScene');
  }

  init(data: { controller?: LuckyGemController }) {
    this.ctrl =
      data?.controller ||
      (this.game.registry.get('controller') as LuckyGemController);
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#120805');
    this.cameras.main.setRoundPixels(true);

    const onReady = this.game.registry.get('onGameReady') as
      | (() => void)
      | undefined;
    onReady?.();

    // Full-bleed temple splash (brighter so it reads like reference)
    const bg = this.add.image(width / 2, height / 2, 'splash').setDepth(0);
    bg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const cover = Math.max(width / bg.width, height / bg.height) * 1.1;
    bg.setScale(cover).setAlpha(0.75);
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x0a0402, 0.28)
      .setDepth(0.5);

    // Code-drawn temple frame — larger playfield
    const targetW = width * 0.84;
    const targetH = height * 0.62;
    const templeGfx = this.add.graphics().setDepth(2);
    const layout = drawTempleFrame(
      templeGfx,
      width * 0.455,
      height * 0.47,
      targetW,
      targetH,
    );

    // Prize wheel BEHIND temple (depth < 2), clipped to arch half
    this.buildPrizeWheel(
      layout.archCx,
      layout.archCy,
      layout.archRadius,
    );

    // 3×3 symbols — framed plate images (their own gold boxes)
    const { board } = layout;
    const gap = Math.max(5, board.w * 0.014);
    const cellW = (board.w - gap * 2) / 3;
    const cellH = (board.h - gap * 2) / 3;
    const symSize = Math.round(Math.min(cellW, cellH) * 0.94);

    this.cells = [];
    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = Math.round(board.x + col * (cellW + gap) + cellW / 2);
      const cy = Math.round(board.y + row * (cellH + gap) + cellH / 2);
      const start = SYMBOLS[i % SYMBOLS.length]!;
      const img = this.add
        .image(cx, cy, start.textureKey)
        .setDisplaySize(symSize, symSize)
        .setDepth(5);
      img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.cells.push({ img, cx, cy, size: symSize });
    }

    this.lineGfx = this.add.graphics().setDepth(8);

    this.buildSpecialWheel(
      layout.frameCx + layout.frameW * 0.58,
      board.y,
      board.h,
      cellH,
      gap,
    );

    this.buildChrome(width, height);
    this.buildControls(width, height);
    this.bindController();

    this.input.once('pointerdown', () => this.ctrl.unlockAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  private buildPrizeWheel(cx: number, cy: number, radius: number) {
    const segs = this.wheelSegs;
    const n = segs.length;
    const slice = (Math.PI * 2) / n;
    const rim = Math.max(3, Math.round(radius * 0.045));

    // Behind frame — only upper half peeks through arch
    this.wheel = this.add.container(cx, cy).setDepth(1.5);
    // Start with first slice CENTER under the pointer (not the divider)
    this.wheel.setAngle((360 / n) * 0.5);

    const disc = this.add.graphics();
    disc.fillStyle(0xc9a227, 1);
    disc.fillCircle(0, 0, radius + rim);
    disc.fillStyle(0x3a1800, 1);
    disc.fillCircle(0, 0, radius + rim * 0.4);

    for (let i = 0; i < n; i++) {
      const seg = segs[i]!;
      const a0 = -Math.PI / 2 + i * slice;
      const a1 = a0 + slice;
      disc.fillStyle(seg.color, 1);
      disc.beginPath();
      disc.moveTo(0, 0);
      disc.arc(0, 0, radius, a0, a1, false);
      disc.closePath();
      disc.fillPath();
      disc.lineStyle(1.5, 0xffe082, 0.85);
      disc.beginPath();
      disc.moveTo(0, 0);
      disc.lineTo(Math.cos(a0) * radius, Math.sin(a0) * radius);
      disc.strokePath();
    }
    disc.fillStyle(0xc9a227, 1);
    disc.fillCircle(0, 0, radius * 0.14);
    disc.fillStyle(0x5d4037, 1);
    disc.fillCircle(0, 0, radius * 0.07);
    this.wheel.add(disc);

    const fontPx = Math.max(11, Math.round(radius * 0.13));
    for (let i = 0; i < n; i++) {
      const seg = segs[i]!;
      const mid = -Math.PI / 2 + (i + 0.5) * slice;
      const lx = Math.cos(mid) * radius * 0.58;
      const ly = Math.sin(mid) * radius * 0.58;
      const label = crisp(
        this.add
          .text(lx, ly, seg.label, {
            fontFamily: 'Arial Black, Arial, Helvetica, sans-serif',
            fontSize: `${fontPx}px`,
            color: '#FFFDE7',
            fontStyle: 'bold',
            stroke: '#1a0a00',
            strokeThickness: 3,
          })
          .setOrigin(0.5),
      );
      this.wheel.add(label);
    }

    // Clip to arch cavity: upper semicircle only (fits inside gold rim)
    const maskG = this.make.graphics({ x: 0, y: 0 });
    maskG.fillStyle(0xffffff, 1);
    maskG.beginPath();
    maskG.moveTo(cx - radius - rim, cy);
    maskG.arc(cx, cy, radius + rim + 1, Math.PI, 0, false);
    maskG.closePath();
    maskG.fillPath();
    this.wheel.setMask(maskG.createGeometryMask());

    // Pointer under the red gem (no center spoke / Start label over the slice)
    const tipY = cy - radius + 2;
    const pointer = this.add.graphics().setDepth(3);
    pointer.fillStyle(0xffe082, 1);
    pointer.fillTriangle(cx - 8, tipY - 12, cx + 8, tipY - 12, cx, tipY + 2);
    pointer.lineStyle(1.5, 0x5d4037, 1);
    pointer.strokeTriangle(cx - 8, tipY - 12, cx + 8, tipY - 12, cx, tipY + 2);
  }

  private buildSpecialWheel(
    cx: number,
    top: number,
    h: number,
    cellH: number,
    gap: number,
  ) {
    this.specialCx = Math.round(cx);
    // Smaller than board cells so they don't dominate / overlap
    this.specialSize = Math.round(cellH * 0.62);

    this.add
      .rectangle(
        this.specialCx,
        top + h / 2,
        this.specialSize + 10,
        h + 4,
        0x1a0a05,
        0.45,
      )
      .setStrokeStyle(1.5, 0xc9a227, 0.55)
      .setDepth(3);

    this.specialImgs = [];
    for (let i = 0; i < 3; i++) {
      const y = Math.round(top + i * (cellH + gap) + cellH / 2);
      const m = MULTIPLIERS[i % MULTIPLIERS.length]!;
      const img = this.add
        .image(this.specialCx, y, m.textureKey)
        .setDisplaySize(this.specialSize, this.specialSize)
        .setDepth(5);
      img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.specialImgs.push(img);
    }
  }

  private setSpecialTexture(img: Phaser.GameObjects.Image, key: string) {
    img.setTexture(key);
    // Reset scale first so setDisplaySize can compute the correct frame scale
    img.setScale(1);
    img.setDisplaySize(this.specialSize, this.specialSize);
  }

  /**
   * Fit a cell image to its slot. Never leave setScale(1) after setDisplaySize —
   * that resets to native texture size and stacks huge symbols on the board.
   */
  private fitCell(cell: CellView, textureKey?: string) {
    if (textureKey) cell.img.setTexture(textureKey);
    cell.img.setScale(1);
    cell.img.setDisplaySize(cell.size, cell.size);
    cell.img.setPosition(cell.cx, cell.cy).setAlpha(1);
  }

  /** Bounce around the current display-size scale (not absolute 1.x). */
  private pulseFromDisplaySize(
    img: Phaser.GameObjects.Image,
    factor: number,
    duration: number,
    repeat = 0,
  ) {
    const baseX = img.scaleX;
    const baseY = img.scaleY;
    this.tweens.killTweensOf(img);
    this.tweens.add({
      targets: img,
      scaleX: baseX * factor,
      scaleY: baseY * factor,
      duration,
      yoyo: true,
      repeat,
      onComplete: () => img.setScale(baseX, baseY),
    });
  }

  private buildChrome(width: number, _height: number) {
    const home = this.add
      .image(52, 52, 'home_btn')
      .setDisplaySize(64, 64)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    home.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.history.back();
    });

    this.muteBtn = this.add
      .image(width - 52, 52, 'speaker_btn')
      .setDisplaySize(56, 56)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.muteBtn.on('pointerdown', () => {
      this.ctrl.unlockAudio();
      this.ctrl.toggleMute();
      this.muteBtn.setAlpha(this.ctrl.isMuted ? 0.45 : 1);
    });

    this.toastText = crisp(
      this.add
        .text(width / 2, 120, '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#FFE082',
          fontStyle: 'bold',
          backgroundColor: '#000000dd',
          padding: { x: 20, y: 12 },
        })
        .setOrigin(0.5)
        .setDepth(80)
        .setAlpha(0),
    );
  }

  private buildControls(width: number, height: number) {
    const barY = height * 0.93;
    const dockH = 118;
    const dockY = barY + 8;

    // Modern dock plate behind controls
    const dock = this.add.graphics().setDepth(39);
    dock.fillStyle(0x000000, 0.45);
    dock.fillRoundedRect(16, dockY - dockH / 2, width - 32, dockH, 28);
    dock.lineStyle(1.5, 0xd4af37, 0.35);
    dock.strokeRoundedRect(16, dockY - dockH / 2, width - 32, dockH, 28);
    // soft top highlight
    dock.lineStyle(1, 0xffe9a0, 0.18);
    dock.lineBetween(40, dockY - dockH / 2 + 2, width - 40, dockY - dockH / 2 + 2);

    // Win capsule
    const winW = width * 0.5;
    const winH = 40;
    const winY = barY - 78;
    const winBg = this.add.graphics().setDepth(40);
    winBg.fillStyle(0xd4af37, 0.25);
    winBg.fillRoundedRect(width / 2 - winW / 2 - 2, winY - winH / 2 - 2, winW + 4, winH + 4, 20);
    winBg.fillGradientStyle(0x1a1008, 0x1a1008, 0x0a0502, 0x0a0502, 0.95);
    winBg.fillRoundedRect(width / 2 - winW / 2, winY - winH / 2, winW, winH, 18);
    winBg.lineStyle(1.5, 0xf5d76e, 0.75);
    winBg.strokeRoundedRect(width / 2 - winW / 2, winY - winH / 2, winW, winH, 18);
    this.winText = crisp(
      this.add
        .text(width / 2, winY, 'Win 0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '24px',
          color: '#FFE9A0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );

    // Balance chip + value
    this.add.image(52, barY, 'chip_gold').setDisplaySize(36, 36).setDepth(41);
    this.balanceText = crisp(
      this.add
        .text(78, barY, '0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '24px',
          color: '#FFE9A0',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setDepth(41),
    );

    this.fastBtn = this.makeFastButton(width * 0.30, barY);
    this.spinBtn = this.makeSpinButton(width * 0.52, barY);

    const betCx = width * 0.82;
    this.makeRoundBtn(betCx - 72, barY, 42, '−', () => this.ctrl.bumpBet(-1));
    // Bet value capsule
    const betCap = this.add.graphics().setDepth(40);
    betCap.fillStyle(0x120805, 0.85);
    betCap.fillRoundedRect(betCx - 42, barY - 18, 84, 36, 12);
    betCap.lineStyle(1.5, 0xd4af37, 0.55);
    betCap.strokeRoundedRect(betCx - 42, barY - 18, 84, 36, 12);
    this.betText = crisp(
      this.add
        .text(betCx, barY, formatCoins(this.ctrl.bet), {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '22px',
          color: '#FFE9A0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    this.makeRoundBtn(betCx + 72, barY, 42, '+', () => this.ctrl.bumpBet(1));
  }

  private makeSpinButton(x: number, y: number) {
    const c = this.add.container(x, y).setDepth(42);
    const w = 176;
    const h = 72;

    // Soft glow
    const glow = this.add.ellipse(0, 4, w + 16, h + 12, 0x2ecc40, 0.22);
    // Outer ring
    const ring = this.add
      .ellipse(0, 0, w + 6, h + 6, 0xa5ffb0, 0.35)
      .setStrokeStyle(2, 0xe8f5e9, 0.5);
    // Body
    const body = this.add.ellipse(0, 0, w, h, 0x1b9e3e);
    const bodyTop = this.add.ellipse(0, -6, w * 0.92, h * 0.55, 0x3ddc65, 0.55);
    const shine = this.add.ellipse(0, -16, w * 0.7, 18, 0xffffff, 0.2);

    const label = crisp(
      this.add
        .text(0, -6, 'SPIN', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '32px',
          color: '#FFFFFF',
          fontStyle: 'bold',
          stroke: '#0d5c22',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
    const sub = crisp(
      this.add
        .text(0, 20, 'HOLD FOR AUTOSPIN', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '10px',
          color: '#DFF7E6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    const hit = this.add
      .ellipse(0, 0, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.ctrl.unlockAudio();
      void this.ctrl.spin();
    });
    hit.on('pointerover', () => body.setFillStyle(0x22b34a));
    hit.on('pointerout', () => body.setFillStyle(0x1b9e3e));
    c.add([glow, ring, body, bodyTop, shine, label, sub, hit]);
    return c;
  }

  private makeFastButton(x: number, y: number) {
    const c = this.add.container(x, y).setDepth(42);
    const w = 108;
    const h = 52;
    const body = this.add.graphics();
    const redraw = (on: boolean) => {
      body.clear();
      body.fillStyle(on ? 0xff8f00 : 0xf5d76e, 1);
      body.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
      body.lineStyle(1.5, 0xfff8e1, 0.85);
      body.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    };
    redraw(false);

    const bolt = crisp(
      this.add.text(-26, -1, '⚡', { fontSize: '22px' }).setOrigin(0.5),
    );
    const text = crisp(
      this.add
        .text(12, 0, 'FAST', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '18px',
          color: '#2a1200',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    const hit = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.ctrl.toggleFast();
      this.refreshFastBtn();
    });
    c.add([body, bolt, text, hit]);
    (
      c as Phaser.GameObjects.Container & {
        redrawFast?: (on: boolean) => void;
      }
    ).redrawFast = redraw;
    return c;
  }

  private makeRoundBtn(
    x: number,
    y: number,
    r: number,
    label: string,
    onClick: () => void,
  ) {
    const c = this.add.container(x, y).setDepth(42);
    const g = this.add.graphics();
    g.fillStyle(0x2a1a08, 1);
    g.fillCircle(0, 0, r / 2 + 2);
    g.fillGradientStyle(0xffe9a0, 0xffe9a0, 0xd4af37, 0xd4af37, 1);
    g.fillCircle(0, 0, r / 2);
    g.lineStyle(1.5, 0xfff8e1, 0.7);
    g.strokeCircle(0, 0, r / 2);
    const text = crisp(
      this.add
        .text(0, -1, label, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#2a1200',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    const hit = this.add
      .circle(0, 0, r / 2, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    c.add([g, text, hit]);
    return c;
  }

  private refreshFastBtn() {
    const redraw = (
      this.fastBtn as Phaser.GameObjects.Container & {
        redrawFast?: (on: boolean) => void;
      }
    ).redrawFast;
    redraw?.(this.ctrl.isFast);
  }

  private bindController() {
    const c = this.ctrl;
    this.unsubs.push(
      c.on('balance', (v) => this.balanceText.setText(formatCoins(v))),
      c.on('bet', (v) => this.betText.setText(formatCoins(v))),
      c.on('toast', (msg) => this.showToast(msg)),
      c.on('fast', () => this.refreshFastBtn()),
      c.on('spinStart', (payload) => this.playSpin(payload)),
      // Result UI is shown on land; spinComplete only syncs balance side-effects
      c.on('spinComplete', () => {}),
      c.on('ready', (r) => {
        this.balanceText.setText(formatCoins(r.balance));
        this.betText.setText(formatCoins(r.bet));
      }),
    );
    this.balanceText.setText(formatCoins(c.balance));
    this.betText.setText(formatCoins(c.bet));
  }

  private showToast(msg: string) {
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 1800,
      duration: 280,
    });
  }

  private playSpin(payload: {
    grid: SymbolId[];
    specialId: MultId;
    specialMult: number;
    totalWin: number;
    lineWins: Array<{ line: number; symbol: SymbolId; payout: number }>;
  }) {
    this.landing = false;
    this.hideResultPopup();
    this.pendingGrid = payload.grid;
    this.pendingSpecial = payload.specialId;
    this.pendingTotalWin = payload.totalWin;
    this.pendingLineWins = payload.lineWins;
    this.pendingWheel = pickWeighted(this.wheelSegs);
    this.lineGfx.clear();
    this.winText.setText('Win 0');

    // Kill leftover tweens so scales/positions don't glitch
    this.cells.forEach((cell) => {
      this.tweens.killTweensOf(cell.img);
      this.fitCell(cell);
    });
    this.specialImgs.forEach((img) => {
      this.tweens.killTweensOf(img);
      img.setScale(1);
      img.setDisplaySize(this.specialSize, this.specialSize);
      img.setAlpha(1);
    });

    const fast = this.ctrl.isFast;
    const spinMs = fast ? 900 : 2200;
    const stagger = fast ? 60 : 140;

    // Prize wheel spin → pointer stops on CENTER of one slice
    const n = this.wheelSegs.length;
    const slice = 360 / n;
    const idx = Math.max(0, this.wheelSegs.indexOf(this.pendingWheel!));
    const targetAngle = (idx + 0.5) * slice;
    const spins = fast ? 2 : 4;
    const cur = ((this.wheel.angle % 360) + 360) % 360;
    const delta = ((targetAngle - cur) % 360 + 360) % 360;
    this.tweens.add({
      targets: this.wheel,
      angle: this.wheel.angle + spins * 360 + delta,
      duration: spinMs,
      ease: 'Cubic.easeOut',
    });

    // Reel spin — texture flicker only (no Y bounce = no jump glitch)
    let landed = false;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const i = row * 3 + col;
        const cell = this.cells[i]!;
        const delay = col * stagger;
        this.tweens.add({
          targets: cell.img,
          alpha: { from: 1, to: 0.4 },
          duration: 70,
          yoyo: true,
          repeat: Math.floor(spinMs / 140),
          delay,
          onUpdate: () => {
            if (Math.random() > 0.6) {
              const rnd = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
              this.fitCell(cell, rnd.textureKey);
            }
          },
          onComplete: () => {
            this.fitCell(cell);
            if (col === 2 && row === 2 && !landed) {
              landed = true;
              this.landReels();
            }
          },
        });
      }
    }

    // Special column spin — keep fixed size when swapping textures
    this.tweens.add({
      targets: this.specialImgs,
      alpha: { from: 1, to: 0.4 },
      duration: 70,
      yoyo: true,
      repeat: Math.floor(spinMs / 140),
      onUpdate: () => {
        this.specialImgs.forEach((img) => {
          if (Math.random() > 0.5) {
            const rnd =
              MULTIPLIERS[Math.floor(Math.random() * MULTIPLIERS.length)]!;
            this.setSpecialTexture(img, rnd.textureKey);
          }
        });
      },
    });
  }

  private landReels() {
    if (this.landing) return;
    this.landing = true;

    if (!this.pendingGrid || !this.pendingSpecial) {
      void this.ctrl.finishSpin();
      return;
    }
    const grid = this.pendingGrid;
    const specialId = this.pendingSpecial;

    grid.forEach((id, i) => {
      const cell = this.cells[i]!;
      const def = symbolById(id)!;
      this.tweens.killTweensOf(cell.img);
      this.fitCell(cell, def.textureKey);
      this.pulseFromDisplaySize(cell.img, 1.05, 110);
    });

    const mid = this.specialImgs[1]!;
    const mdef = multById(specialId)!;
    this.specialImgs.forEach((img, i) => {
      this.tweens.killTweensOf(img);
      img.setAlpha(1);
      if (i === 1) this.setSpecialTexture(img, mdef.textureKey);
      else {
        const other =
          MULTIPLIERS[(MULTIPLIERS.indexOf(mdef) + i + 1) % MULTIPLIERS.length]!;
        this.setSpecialTexture(img, other.textureKey);
      }
    });
    this.pulseFromDisplaySize(mid, 1.08, 140);

    // Show win immediately (don't wait for network credit)
    this.showResult({
      totalWin: this.pendingTotalWin,
      lineWins: this.pendingLineWins,
    });

    void this.ctrl.finishSpin();
  }

  private showResult(payload: {
    totalWin: number;
    lineWins: Array<{ line: number; symbol: SymbolId; payout: number }>;
  }) {
    const win = Math.max(0, Math.round(payload.totalWin));
    this.winText.setText(`Win ${formatCoins(win)}`);
    this.lineGfx.clear();

    if (win <= 0 || payload.lineWins.length === 0) return;

    payload.lineWins.forEach((lw) => {
      const cells = PAYLINES[lw.line]!;
      this.lineGfx.lineStyle(5, 0xffeb3b, 0.95);
      this.lineGfx.beginPath();
      cells.forEach((idx, n) => {
        const cell = this.cells[idx]!;
        if (n === 0) this.lineGfx.moveTo(cell.cx, cell.cy);
        else this.lineGfx.lineTo(cell.cx, cell.cy);
        this.fitCell(cell);
        this.pulseFromDisplaySize(cell.img, 1.1, 180, 2);
      });
      this.lineGfx.strokePath();
    });

    this.showWinPopup(win, payload.lineWins.length, payload.lineWins[0]?.symbol);
  }

  private showWinPopup(
    win: number,
    lines: number,
    symbol?: SymbolId,
  ) {
    this.hideResultPopup();
    const { width, height } = this.scale;
    const c = this.add.container(width / 2, height * 0.42).setDepth(120).setAlpha(0);
    this.resultPopup = c;

    const panelW = Math.min(420, width * 0.78);
    const panelH = 220;
    const g = this.add.graphics();
    // Soft dim behind panel (local)
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-panelW / 2 - 8, -panelH / 2 - 8, panelW + 16, panelH + 16, 28);
    // Gold outer
    g.fillStyle(0xd4af37, 1);
    g.fillRoundedRect(-panelW / 2 - 3, -panelH / 2 - 3, panelW + 6, panelH + 6, 24);
    // Inner dark
    g.fillGradientStyle(0x2a1808, 0x2a1808, 0x100804, 0x100804, 1);
    g.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 22);
    // Inner gold stroke
    g.lineStyle(2, 0xffe9a0, 0.7);
    g.strokeRoundedRect(-panelW / 2 + 6, -panelH / 2 + 6, panelW - 12, panelH - 12, 18);

    const title = crisp(
      this.add
        .text(0, -68, 'YOU WIN!', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '36px',
          color: '#FFE9A0',
          fontStyle: 'bold',
          stroke: '#3a1800',
          strokeThickness: 5,
        })
        .setOrigin(0.5),
    );

    const amount = crisp(
      this.add
        .text(0, -8, `+${formatCoins(win)}`, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '48px',
          color: '#FFFFFF',
          fontStyle: 'bold',
          stroke: '#1b5e20',
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );

    const symLabel = symbol ? symbol.toUpperCase() : 'LINE';
    const sub = crisp(
      this.add
        .text(0, 52, `${lines} line${lines > 1 ? 's' : ''} · ${symLabel}`, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '16px',
          color: '#F5D76E',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    c.add([g, title, amount, sub]);
    c.setScale(0.82);

    this.tweens.add({
      targets: c,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: c,
      alpha: 0,
      scaleX: 0.9,
      scaleY: 0.9,
      delay: 2200,
      duration: 320,
      ease: 'Cubic.easeIn',
      onComplete: () => this.hideResultPopup(),
    });
  }

  private hideResultPopup() {
    if (!this.resultPopup) return;
    this.tweens.killTweensOf(this.resultPopup);
    this.resultPopup.destroy(true);
    this.resultPopup = null;
  }

  shutdown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
