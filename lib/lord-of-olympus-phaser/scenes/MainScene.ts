import * as Phaser from 'phaser';
import {
  BOARD_UV,
  BUY_FREE_SPINS_MULT,
  COLS,
  DOUBLE_CHANCE_BET_MULT,
  PANEL_UV,
  ROWS,
  SYMBOLS,
  symbolById,
  type ClusterWin,
  type SymbolId,
} from '../config';
import type { LordOfOlympusController } from '../LordOfOlympusController';

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

type FrameLayout = {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  left: number;
  top: number;
  board: { x: number; y: number; w: number; h: number };
  panel: (uv: { cx: number; cy: number; w: number; h: number }) => {
    cx: number;
    cy: number;
    w: number;
    h: number;
  };
};

export class MainScene extends Phaser.Scene {
  private ctrl!: LordOfOlympusController;
  private unsubs: Array<() => void> = [];

  private balanceText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private doubleBetText!: Phaser.GameObjects.Text;
  private buyPriceText!: Phaser.GameObjects.Text;
  private winSymImg!: Phaser.GameObjects.Image;
  private winSymLabel!: Phaser.GameObjects.Text;
  private winSymCount!: Phaser.GameObjects.Text;
  private winSymSize = 64;
  private spinBtn!: Phaser.GameObjects.Container;
  private fastBtn!: Phaser.GameObjects.Container;
  private muteBtn!: Phaser.GameObjects.Image;
  private doubleChanceOn = false;
  private doubleToggleGfx!: Phaser.GameObjects.Graphics;
  private doubleToggleLabel!: Phaser.GameObjects.Text;

  private cells: CellView[] = [];
  private highlightGfx!: Phaser.GameObjects.Graphics;

  private pendingGrid: SymbolId[] | null = null;
  private pendingTotalWin = 0;
  private pendingClusterWins: ClusterWin[] = [];
  private landing = false;
  private resultPopup: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('MainScene');
  }

  init(data: { controller?: LordOfOlympusController }) {
    this.ctrl =
      data?.controller ||
      (this.game.registry.get('controller') as LordOfOlympusController);
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#2a1848');
    this.cameras.main.setRoundPixels(true);

    const onReady = this.game.registry.get('onGameReady') as
      | (() => void)
      | undefined;
    onReady?.();

    this.buildAtmosphere(width, height);
    const layout = this.placeFrame(width, height);
    this.placeZeus(width, layout);
    this.buildBanner(width, layout);
    this.buildGrid(layout);
    this.highlightGfx = this.add.graphics().setDepth(8);
    this.buildFeaturePanels(layout);
    this.buildChrome(width);
    this.buildFooter(width, height);
    this.bindController();
    this.refreshFeaturePrices();

    this.input.once('pointerdown', () => this.ctrl.unlockAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  /** Full-bleed temple sky (Zeus placed after frame so it sits just above it). */
  private buildAtmosphere(width: number, height: number) {
    const sky = this.add.image(width / 2, height * 0.45, 'game_bg').setDepth(0);
    sky.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const skyCover =
      Math.max(width / sky.width, height / sky.height) * 1.05;
    sky.setScale(skyCover).setAlpha(0.95);

    this.add
      .rectangle(width / 2, height * 0.82, width, height * 0.45, 0x1a0a2e, 0.22)
      .setDepth(0.5);
  }

  private placeZeus(width: number, layout: FrameLayout) {
    const zeus = this.add.image(width / 2, 0, 'zeus_bust').setDepth(1);
    zeus.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    zeus.setOrigin(0.5, 1);
    const zw = width * 0.78;
    const zh = zw * (zeus.height / zeus.width);
    zeus.setDisplaySize(zw, zh);
    // Peek just above the gold frame
    zeus.setPosition(width / 2, layout.top + layout.fh * 0.04);
  }

  private placeFrame(width: number, height: number): FrameLayout {
    const frame = this.add.image(0, 0, 'main_frame').setDepth(2);
    frame.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Full width, pinned above the yellow footer (room WebView bottom sheet)
    const footerReserve = height * 0.095;
    const targetW = width * 0.985;
    const maxH = height * 0.78;
    const scale = Math.min(targetW / frame.width, maxH / frame.height);
    const fw = frame.width * scale;
    const fh = frame.height * scale;
    const fx = width / 2;
    const fy = height - footerReserve - fh / 2;
    frame.setPosition(fx, fy).setDisplaySize(fw, fh);

    const left = fx - fw / 2;
    const top = fy - fh / 2;
    const board = {
      x: left + BOARD_UV.x0 * fw,
      y: top + BOARD_UV.y0 * fh,
      w: (BOARD_UV.x1 - BOARD_UV.x0) * fw,
      h: (BOARD_UV.y1 - BOARD_UV.y0) * fh,
    };

    const panel = (uv: { cx: number; cy: number; w: number; h: number }) => ({
      cx: left + uv.cx * fw,
      cy: top + uv.cy * fh,
      w: uv.w * fw,
      h: uv.h * fh,
    });

    return { fx, fy, fw, fh, left, top, board, panel };
  }

  private buildBanner(width: number, layout: FrameLayout) {
    const y = layout.top + layout.fh * 0.06;
    crisp(
      this.add
        .text(width / 2, y, 'WIN UP TO 5000X BET', {
          fontFamily: 'Arial Black, Arial, Helvetica, sans-serif',
          fontSize: '22px',
          color: '#FFF59D',
          fontStyle: 'bold',
          stroke: '#3a1800',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(6),
    );
  }

  private buildGrid(layout: FrameLayout) {
    const { board } = layout;

    // Reserve a big share of board width as gutters so 6 columns clearly spread
    const gapFrac = 0.48; // 48% of board width = space BETWEEN columns
    const gapX = (board.w * gapFrac) / (COLS - 1);
    const cellW = (board.w * (1 - gapFrac)) / COLS;
    const cellH = board.h / ROWS;
    // Fill each column cell — cropped assets keep the gem looking large
    const symSize = Math.round(Math.min(cellW * 1.18, cellH * 0.94));

    // Cascade left pull: leftmost moves most, each next column a bit less
    const leftPull = [
      board.w * 0.055,
      board.w * 0.040,
      board.w * 0.028,
      board.w * 0.018,
      board.w * 0.010,
      board.w * 0.004,
    ];

    this.cells = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const cx = Math.round(
          board.x + col * (cellW + gapX) + cellW / 2 - (leftPull[col] ?? 0),
        );
        const cy = Math.round(board.y + (row + 0.5) * cellH);
        const start = SYMBOLS[i % SYMBOLS.length]!;
        const img = this.add
          .image(cx, cy, start.textureKey)
          .setOrigin(0.5, 0.5)
          .setDepth(5);
        img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        const cell: CellView = { img, cx, cy, size: symSize };
        this.fitCell(cell, start.textureKey);
        this.cells.push(cell);
      }
    }
  }

  private buildFeaturePanels(layout: FrameLayout) {
    const left = layout.panel(PANEL_UV.left);
    const center = layout.panel(PANEL_UV.center);
    const right = layout.panel(PANEL_UV.right);
    const bar = layout.panel(PANEL_UV.bar);

    // —— Left panel: winning symbol showcase ——
    crisp(
      this.add
        .text(left.cx, left.cy - left.h * 0.38, 'WIN SYMBOL', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '11px',
          color: '#C9A227',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    const symBox = Math.round(Math.min(left.w, left.h) * 0.55);
    this.winSymSize = symBox;
    this.winSymImg = this.add
      .image(left.cx, left.cy + left.h * 0.02, SYMBOLS[0]!.textureKey)
      .setDisplaySize(symBox, symBox)
      .setAlpha(0.25)
      .setDepth(41);
    this.winSymImg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.winSymLabel = crisp(
      this.add
        .text(left.cx, left.cy + left.h * 0.38, '—', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: '#FFE9A0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    this.winSymCount = crisp(
      this.add
        .text(left.cx, left.cy - left.h * 0.18, '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '13px',
          color: '#FFEB3B',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(42),
    );

    // —— Double Chance (parchment center) ——
    crisp(
      this.add
        .text(center.cx, center.cy - center.h * 0.28, 'DOUBLE CHANCE\nTO WIN FEATURE', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '13px',
          color: '#3a2208',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    this.doubleBetText = crisp(
      this.add
        .text(center.cx - center.w * 0.18, center.cy + center.h * 0.22, 'BET 0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '14px',
          color: '#2a1800',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );

    this.doubleToggleGfx = this.add.graphics().setDepth(41);
    this.doubleToggleLabel = crisp(
      this.add
        .text(0, 0, 'OFF', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: '#FFFFFF',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(42),
    );
    const toggleHit = this.add
      .rectangle(
        center.cx + center.w * 0.28,
        center.cy + center.h * 0.22,
        72,
        28,
        0xffffff,
        0.001,
      )
      .setInteractive({ useHandCursor: true })
      .setDepth(43);
    toggleHit.on('pointerdown', () => {
      this.doubleChanceOn = !this.doubleChanceOn;
      this.drawDoubleToggle(
        center.cx + center.w * 0.28,
        center.cy + center.h * 0.22,
      );
      this.refreshFeaturePrices();
      this.showToast(
        this.doubleChanceOn
          ? 'Double Chance ON (coming soon)'
          : 'Double Chance OFF',
      );
    });
    this.drawDoubleToggle(
      center.cx + center.w * 0.28,
      center.cy + center.h * 0.22,
    );

    // —— Buy Free Spins (blue right) ——
    crisp(
      this.add
        .text(right.cx, right.cy - right.h * 0.22, 'BUY FREE\nSPINS', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '14px',
          color: '#FFE9A0',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    this.buyPriceText = crisp(
      this.add
        .text(right.cx, right.cy + right.h * 0.28, '0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '22px',
          color: '#FFEB3B',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    const buyHit = this.add
      .rectangle(right.cx, right.cy, right.w * 0.9, right.h * 0.85, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(43);
    buyHit.on('pointerdown', () => {
      this.showToast('Buy Free Spins coming soon');
    });

    // —— Win bar ——
    this.winText = crisp(
      this.add
        .text(bar.cx, bar.cy, '0 Win', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#FFFFFF',
          fontStyle: 'bold',
          stroke: '#4a148c',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
  }

  private drawDoubleToggle(cx: number, cy: number) {
    const g = this.doubleToggleGfx;
    g.clear();
    const w = 64;
    const h = 26;
    const on = this.doubleChanceOn;
    g.fillStyle(on ? 0x2e7d32 : 0x43a047, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(1.5, 0xe8f5e9, 0.9);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    // knob
    const kx = on ? cx + w / 2 - 12 : cx - w / 2 + 12;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(kx, cy, 9);
    this.doubleToggleLabel
      .setText(on ? 'ON' : 'OFF')
      .setPosition(cx + (on ? -8 : 8), cy);
  }

  private refreshFeaturePrices() {
    const bet = this.ctrl.bet;
    const shown = this.doubleChanceOn
      ? Math.round(bet * DOUBLE_CHANCE_BET_MULT)
      : bet;
    this.doubleBetText?.setText(`BET ${formatCoins(shown)}`);
    this.buyPriceText?.setText(formatCoins(bet * BUY_FREE_SPINS_MULT));
  }

  private buildChrome(width: number) {
    // Gold square home / menu like reference
    const home = this.makeGoldSquareBtn(48, 48, '←', () => {
      if (typeof window !== 'undefined') window.history.back();
    });
    home.setDepth(50);

    this.muteBtn = this.add
      .image(width - 48, 48, 'speaker_btn')
      .setDisplaySize(48, 48)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.muteBtn.on('pointerdown', () => {
      this.ctrl.unlockAudio();
      this.ctrl.toggleMute();
      this.muteBtn.setAlpha(this.ctrl.isMuted ? 0.45 : 1);
    });

    this.toastText = crisp(
      this.add
        .text(width / 2, 100, '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '22px',
          color: '#FFE082',
          fontStyle: 'bold',
          backgroundColor: '#000000dd',
          padding: { x: 16, y: 10 },
        })
        .setOrigin(0.5)
        .setDepth(80)
        .setAlpha(0),
    );
  }

  private makeGoldSquareBtn(x: number, y: number, label: string, onClick: () => void) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0xf5d76e, 1);
    g.fillRoundedRect(-26, -26, 52, 52, 10);
    g.lineStyle(2, 0xfff8e1, 0.9);
    g.strokeRoundedRect(-26, -26, 52, 52, 10);
    const t = crisp(
      this.add
        .text(0, -1, label, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#3a1800',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    const hit = this.add
      .rectangle(0, 0, 52, 52, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    c.add([g, t, hit]);
    return c;
  }

  /** Yellow control dock — balance · bet −/+ · x1 · green SPIN */
  private buildFooter(width: number, height: number) {
    const barY = height * 0.935;
    const dockH = 110;

    const dock = this.add.graphics().setDepth(39);
    dock.fillGradientStyle(0xffe082, 0xffe082, 0xf9a825, 0xf9a825, 1);
    dock.fillRoundedRect(10, barY - dockH / 2, width - 20, dockH, 18);
    dock.lineStyle(2, 0xfff8e1, 0.7);
    dock.strokeRoundedRect(10, barY - dockH / 2, width - 20, dockH, 18);

    // Balance
    this.add.image(56, barY - 8, 'chip_gold').setDisplaySize(40, 40).setDepth(41);
    this.balanceText = crisp(
      this.add
        .text(56, barY + 28, '0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '18px',
          color: '#3a1800',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );

    // Bet − amount +
    const betCx = width * 0.38;
    this.makeSquareBtn(betCx - 78, barY, 44, '−', () => this.ctrl.bumpBet(-1));
    const betPlate = this.add.graphics().setDepth(40);
    betPlate.fillStyle(0x3a1800, 0.85);
    betPlate.fillRoundedRect(betCx - 48, barY - 22, 96, 44, 10);
    betPlate.lineStyle(1.5, 0xffe082, 0.6);
    betPlate.strokeRoundedRect(betCx - 48, barY - 22, 96, 44, 10);
    this.betText = crisp(
      this.add
        .text(betCx, barY, formatCoins(this.ctrl.bet), {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '24px',
          color: '#FFE9A0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41),
    );
    this.makeSquareBtn(betCx + 78, barY, 44, '+', () => this.ctrl.bumpBet(1));

    // x1 / FAST
    this.fastBtn = this.makeMultBtn(betCx + 140, barY);

    // Green SPIN (right)
    this.spinBtn = this.makeSpinButton(width * 0.78, barY);
  }

  private makeSquareBtn(
    x: number,
    y: number,
    size: number,
    label: string,
    onClick: () => void,
  ) {
    const c = this.add.container(x, y).setDepth(42);
    const g = this.add.graphics();
    g.fillStyle(0x5d4037, 1);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, 8);
    g.fillGradientStyle(0xffe082, 0xffe082, 0xd4af37, 0xd4af37, 1);
    g.fillRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, 6);
    const text = crisp(
      this.add
        .text(0, -1, label, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#3a1800',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    const hit = this.add
      .rectangle(0, 0, size, size, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    c.add([g, text, hit]);
    return c;
  }

  private makeMultBtn(x: number, y: number) {
    const c = this.add.container(x, y).setDepth(42);
    const w = 52;
    const h = 44;
    const body = this.add.graphics();
    const redraw = (on: boolean) => {
      body.clear();
      body.fillStyle(on ? 0xff8f00 : 0xffe082, 1);
      body.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      body.lineStyle(1.5, 0x5d4037, 0.7);
      body.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    };
    redraw(false);
    const text = crisp(
      this.add
        .text(0, 0, 'x1', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '18px',
          color: '#3a1800',
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
    c.add([body, text, hit]);
    (
      c as Phaser.GameObjects.Container & {
        redrawFast?: (on: boolean) => void;
        label?: Phaser.GameObjects.Text;
      }
    ).redrawFast = redraw;
    (
      c as Phaser.GameObjects.Container & { label?: Phaser.GameObjects.Text }
    ).label = text;
    return c;
  }

  private makeSpinButton(x: number, y: number) {
    const c = this.add.container(x, y).setDepth(42);
    const w = 168;
    const h = 72;

    const glow = this.add.ellipse(0, 3, w + 12, h + 10, 0x69f0ae, 0.28);
    const body = this.add.ellipse(0, 0, w, h, 0x1b9e3e);
    const bodyTop = this.add.ellipse(0, -7, w * 0.9, h * 0.5, 0x3ddc65, 0.5);
    const shine = this.add.ellipse(0, -16, w * 0.65, 16, 0xffffff, 0.2);
    const ring = this.add
      .ellipse(0, 0, w + 4, h + 4, 0xa5ffb0, 0.001)
      .setStrokeStyle(2.5, 0xe8f5e9, 0.75);

    const label = crisp(
      this.add
        .text(0, -8, 'SPIN', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '30px',
          color: '#FFFFFF',
          fontStyle: 'bold',
          stroke: '#0d5c22',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
    const sub = crisp(
      this.add
        .text(0, 18, 'HOLD FOR AUTOSPIN', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '9px',
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

  private refreshFastBtn() {
    const btn = this.fastBtn as Phaser.GameObjects.Container & {
      redrawFast?: (on: boolean) => void;
      label?: Phaser.GameObjects.Text;
    };
    btn.redrawFast?.(this.ctrl.isFast);
    btn.label?.setText(this.ctrl.isFast ? 'x2' : 'x1');
  }

  private fitCell(cell: CellView, textureKey?: string) {
    if (textureKey) cell.img.setTexture(textureKey);
    cell.img.setOrigin(0.5, 0.5);
    // Display size first, never leave a bare setScale(1) after it
    cell.img.setDisplaySize(cell.size, cell.size);
    cell.img.setPosition(cell.cx, cell.cy).setAlpha(1);
  }

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

  private bindController() {
    const c = this.ctrl;
    this.unsubs.push(
      c.on('balance', (v) => this.balanceText.setText(formatCoins(v))),
      c.on('bet', (v) => {
        this.betText.setText(formatCoins(v));
        this.refreshFeaturePrices();
      }),
      c.on('toast', (msg) => this.showToast(msg)),
      c.on('fast', () => this.refreshFastBtn()),
      c.on('spinStart', (payload) => this.playSpin(payload)),
      c.on('spinComplete', () => {}),
      c.on('ready', (r) => {
        this.balanceText.setText(formatCoins(r.balance));
        this.betText.setText(formatCoins(r.bet));
        this.refreshFeaturePrices();
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
    totalWin: number;
    clusterWins: ClusterWin[];
  }) {
    this.landing = false;
    this.hideResultPopup();
    this.pendingGrid = payload.grid;
    this.pendingTotalWin = payload.totalWin;
    this.pendingClusterWins = payload.clusterWins;
    this.highlightGfx.clear();
    this.winText.setText('0 Win');
    this.clearWinSymbol();

    this.cells.forEach((cell) => {
      this.tweens.killTweensOf(cell.img);
      this.fitCell(cell);
    });

    const fast = this.ctrl.isFast;
    const spinMs = fast ? 800 : 2000;
    const stagger = fast ? 45 : 110;

    let landed = false;
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const i = row * COLS + col;
        const cell = this.cells[i]!;
        const delay = col * stagger;
        this.tweens.add({
          targets: cell.img,
          alpha: { from: 1, to: 0.4 },
          duration: 65,
          yoyo: true,
          repeat: Math.floor(spinMs / 130),
          delay,
          onUpdate: () => {
            if (Math.random() > 0.55) {
              const rnd = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
              this.fitCell(cell, rnd.textureKey);
            }
          },
          onComplete: () => {
            this.fitCell(cell);
            if (col === COLS - 1 && row === ROWS - 1 && !landed) {
              landed = true;
              this.landReels();
            }
          },
        });
      }
    }
  }

  private landReels() {
    if (this.landing) return;
    this.landing = true;

    if (!this.pendingGrid) {
      void this.ctrl.finishSpin();
      return;
    }
    const grid = this.pendingGrid;

    grid.forEach((id, i) => {
      const cell = this.cells[i]!;
      const def = symbolById(id)!;
      this.tweens.killTweensOf(cell.img);
      this.fitCell(cell, def.textureKey);
      this.pulseFromDisplaySize(cell.img, 1.05, 100);
    });

    this.showResult({
      totalWin: this.pendingTotalWin,
      clusterWins: this.pendingClusterWins,
    });

    void this.ctrl.finishSpin();
  }

  private clearWinSymbol() {
    if (!this.winSymImg) return;
    this.tweens.killTweensOf(this.winSymImg);
    this.winSymImg.setScale(1);
    this.winSymImg.setDisplaySize(this.winSymSize, this.winSymSize);
    this.winSymImg.setAlpha(0.25);
    this.winSymLabel?.setText('—');
    this.winSymCount?.setText('');
  }

  private showWinSymbol(top: ClusterWin) {
    const def = symbolById(top.symbol);
    if (!def || !this.winSymImg) return;
    this.tweens.killTweensOf(this.winSymImg);
    this.winSymImg.setTexture(def.textureKey);
    this.winSymImg.setScale(1);
    this.winSymImg.setDisplaySize(this.winSymSize, this.winSymSize);
    this.winSymImg.setAlpha(1);
    this.winSymLabel.setText(top.symbol.toUpperCase());
    this.winSymCount.setText(`${top.count}×`);
    this.pulseFromDisplaySize(this.winSymImg, 1.12, 160, 2);
  }

  private showResult(payload: {
    totalWin: number;
    clusterWins: ClusterWin[];
  }) {
    const win = Math.max(0, Math.round(payload.totalWin));
    this.winText.setText(`${formatCoins(win)} Win`);
    this.highlightGfx.clear();

    if (win <= 0 || payload.clusterWins.length === 0) {
      this.clearWinSymbol();
      return;
    }

    const winCells = new Set<number>();
    payload.clusterWins.forEach((cw) =>
      cw.cells.forEach((i) => winCells.add(i)),
    );

    this.highlightGfx.lineStyle(3, 0xffeb3b, 0.9);
    winCells.forEach((idx) => {
      const cell = this.cells[idx]!;
      const s = cell.size * 0.52;
      this.highlightGfx.strokeRoundedRect(
        cell.cx - s,
        cell.cy - s,
        s * 2,
        s * 2,
        10,
      );
      this.fitCell(cell);
      this.pulseFromDisplaySize(cell.img, 1.12, 160, 2);
    });

    const top = payload.clusterWins.reduce((a, b) =>
      a.payout >= b.payout ? a : b,
    );
    this.showWinSymbol(top);
    this.showWinPopup(win, top);
  }

  private showWinPopup(win: number, top: ClusterWin) {
    this.hideResultPopup();
    const { width, height } = this.scale;
    const c = this.add
      .container(width / 2, height * 0.4)
      .setDepth(120)
      .setAlpha(0);
    this.resultPopup = c;

    const panelW = Math.min(420, width * 0.78);
    const panelH = 220;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(
      -panelW / 2 - 8,
      -panelH / 2 - 8,
      panelW + 16,
      panelH + 16,
      28,
    );
    g.fillStyle(0xd4af37, 1);
    g.fillRoundedRect(
      -panelW / 2 - 3,
      -panelH / 2 - 3,
      panelW + 6,
      panelH + 6,
      24,
    );
    g.fillGradientStyle(0x2a1850, 0x2a1850, 0x12061f, 0x12061f, 1);
    g.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 22);
    g.lineStyle(2, 0xffe9a0, 0.7);
    g.strokeRoundedRect(
      -panelW / 2 + 6,
      -panelH / 2 + 6,
      panelW - 12,
      panelH - 12,
      18,
    );

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
          stroke: '#4a148c',
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );

    const sub = crisp(
      this.add
        .text(0, 52, `${top.count}× ${top.symbol.toUpperCase()} cluster`, {
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
