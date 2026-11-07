import * as Phaser from 'phaser';
import {
  CHIPS,
  GRID_LAYOUT,
  SLOTS,
  SPIN_ORDER,
  chestById,
  chipTextureForAmount,
} from '../config';
import type { HeroChestController } from '../HeroChestController';
import { coverSplash } from '../splashLayout';

type Rect = { x: number; y: number; w: number; h: number };

type CellView = {
  id: string;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  chest: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Rectangle;
  myBetText: Phaser.GameObjects.Text;
  roomBetText: Phaser.GameObjects.Text;
  chipStack: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Rectangle;
};

function pctSlot(
  frame: Rect,
  s: { top: number; left: number; w: number; h: number },
): Rect {
  return {
    x: Math.round(frame.x + (s.left / 100) * frame.w),
    y: Math.round(frame.y + (s.top / 100) * frame.h),
    w: Math.round((s.w / 100) * frame.w),
    h: Math.round((s.h / 100) * frame.h),
  };
}

/** Crisp text on retina — call after creating Text. */
function crispText<T extends Phaser.GameObjects.Text>(
  text: T,
  dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2,
): T {
  text.setResolution(dpr);
  return text;
}

/** Integer display size, keep square art sharp when downscaling. */
function fitSquareImage(
  img: Phaser.GameObjects.Image,
  size: number,
): Phaser.GameObjects.Image {
  const s = Math.max(1, Math.round(size));
  img.setDisplaySize(s, s);
  img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return img;
}

export class MainScene extends Phaser.Scene {
  private ctrl!: HeroChestController;
  private unsubs: Array<() => void> = [];

  private frameRect!: Rect;
  private balanceText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private pingText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private historyCol!: Phaser.GameObjects.Container;
  private resultOverlay!: Phaser.GameObjects.Container;
  private resultWinDom!: Phaser.GameObjects.DOMElement;
  private resultWinSparkEl: HTMLImageElement | null = null;
  private resultWinMultEl: HTMLElement | null = null;
  private resultWinLine!: Phaser.GameObjects.Text;
  private resultDetail!: Phaser.GameObjects.Text;
  private resultChestSize = 140;
  private recordsOverlay!: Phaser.GameObjects.Container;

  private cells = new Map<string, CellView>();
  private keyViews: Array<{
    amount: number;
    container: Phaser.GameObjects.Container;
    keyImg: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Rectangle;
  }> = [];
  private keyBarCenter = { x: 0, y: 0 };
  private selectedChip = 2000;
  private winningId: string | null = null;
  private lastWinAmount = 0;
  private muteBtn!: Phaser.GameObjects.Image;
  private winLabel!: Phaser.GameObjects.Text;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;

  /** Soft anti-clockwise highlight roam while betting (Greedy King style). */
  private idleRoaming = false;
  private idleIndex = 0;
  private idleCall: Phaser.Time.TimerEvent | null = null;
  private static readonly IDLE_DWELL_MS = 700;

  constructor() {
    super('MainScene');
  }

  init(data: { controller?: HeroChestController }) {
    this.ctrl =
      data?.controller ||
      (this.game.registry.get('controller') as HeroChestController);
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a0a05');
    this.cameras.main.setRoundPixels(true);

    const onReady = this.game.registry.get('onGameReady') as
      | (() => void)
      | undefined;
    onReady?.();

    // Splash art as full-bleed room background (cover + slight zoom = full mobile width)
    const bg = this.add.image(width / 2, height / 2, 'splash').setDepth(0);
    coverSplash(bg, width, height, 1.14);
    bg.setAlpha(0.62);
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x120805, 0.42)
      .setDepth(0.5);

    // Square cabinet sits near the bottom on tall mobile (not vertically centered)
    const frameImg = this.add.image(width / 2, height / 2, 'frame').setOrigin(0.5);
    frameImg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const scale = Math.min(width / frameImg.width, height / frameImg.height) * 0.98;
    frameImg.setScale(scale).setDepth(1);
    const bottomPad = Math.round(height * 0.085);
    const frameCy = height - bottomPad - frameImg.displayHeight / 2;
    frameImg.setPosition(width / 2, frameCy);
    this.frameRect = {
      x: Math.round(frameImg.x - frameImg.displayWidth / 2),
      y: Math.round(frameImg.y - frameImg.displayHeight / 2),
      w: Math.round(frameImg.displayWidth),
      h: Math.round(frameImg.displayHeight),
    };

    this.buildTimer();
    this.buildBoard();
    this.buildHistoryCol();
    this.buildKeyBar();
    this.buildFooter();
    this.buildChromeHud(width, height);
    this.buildResultOverlay(width, height);
    this.buildRecordsOverlay(width, height);

    this.selectedChip = this.ctrl.selectedChip;
    this.bindController();
    this.refreshHudFromController();

    this.input.once('pointerdown', () => this.ctrl.unlockAudio());

    const round = this.ctrl.currentRound;
    if (round?.status === 'betting') {
      this.startIdleRoam();
    } else if (round?.status === 'spinning' && round.winner_result) {
      const winIdx = SPIN_ORDER.indexOf(round.winner_result);
      if (winIdx >= 0) this.setHighlightIndex(winIdx);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  shutdown() {
    this.stopIdleRoam();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private buildTimer() {
    const r = pctSlot(this.frameRect, SLOTS.timer);
    this.add
      .image(r.x + r.w / 2, r.y + r.h / 2, 'panel_btn')
      .setDisplaySize(Math.round(r.w * 1.15), Math.round(r.h * 1.35))
      .setDepth(5)
      .setTint(0x3a2410);
    this.countdownText = crispText(
      this.add
        .text(r.x + r.w / 2, r.y + r.h / 2, '--', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${Math.max(28, Math.floor(r.h * 0.7))}px`,
          color: '#FFE082',
          fontStyle: 'bold',
          stroke: '#2a1200',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(6),
    );
  }

  private buildBoard() {
    const board = pctSlot(this.frameRect, SLOTS.board);
    const gapX = Math.round(board.w * 0.012);
    const gapY = Math.round(board.h * 0.012);
    const cellW = (board.w - gapX * 2) / 3;
    const cellH = (board.h - gapY * 2) / 3;
    // Stay inside cell — overflow (1.06) caused soft overlaps / mushy edges
    const boxSize = Math.round(Math.min(cellW, cellH) * 0.92);

    GRID_LAYOUT.forEach((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = Math.round(board.x + col * (cellW + gapX) + cellW / 2);
      const y = Math.round(board.y + row * (cellH + gapY) + cellH / 2);

      if (!id) {
        fitSquareImage(this.add.image(x, y, 'center_hero'), boxSize * 0.96).setDepth(
          9,
        );
        return;
      }

      const meta = chestById(id)!;
      const container = this.add.container(x, y).setDepth(10);
      const glow = this.add
        .rectangle(0, 0, boxSize + 8, boxSize + 8, 0xffeb3b, 0)
        .setStrokeStyle(4, 0xffeb3b, 0)
        .setVisible(false);
      const chest = fitSquareImage(this.add.image(0, 0, meta.textureKey), boxSize);
      const roomBetText = crispText(
        this.add
          .text(0, Math.round(cellH * 0.42), '', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${Math.max(14, Math.floor(cellW * 0.1))}px`,
            color: '#1565C0',
            fontStyle: 'bold',
            backgroundColor: '#fffffff0',
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5)
          .setVisible(false),
      );
      const myBetText = crispText(
        this.add
          .text(0, Math.round(cellH * 0.48), '', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${Math.max(14, Math.floor(cellW * 0.11))}px`,
            color: '#FFD54F',
            fontStyle: 'bold',
            backgroundColor: '#000000b3',
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5)
          .setVisible(false),
      );
      // Chips sit on the bottom edge of the chest — not over the middle art
      const chipStack = this.add.container(0, Math.round(cellH * 0.34));

      const hit = this.add
        .rectangle(0, 0, Math.round(cellW * 0.94), Math.round(cellH * 0.94), 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.ctrl.unlockAudio();
        this.ctrl.placeBetOnOption(id);
      });

      container.add([glow, chest, chipStack, roomBetText, myBetText, hit]);
      this.cells.set(id, {
        id,
        x,
        y,
        container,
        chest,
        glow,
        myBetText,
        roomBetText,
        chipStack,
        hit,
      });
    });
  }

  private buildHistoryCol() {
    const r = pctSlot(this.frameRect, SLOTS.history);
    this.historyCol = this.add
      .container(r.x + r.w / 2, r.y + 8)
      .setDepth(8);
  }

  private buildKeyBar() {
    const r = pctSlot(this.frameRect, SLOTS.keys);
    this.keyBarCenter = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const rowH = r.h / CHIPS.length;
    this.keyViews = [];

    CHIPS.forEach((chip, i) => {
      const cy = r.y + rowH * (i + 0.5);
      const cx = r.x + r.w / 2;
      const container = this.add.container(cx, cy).setDepth(8);
      const keySize = Math.min(r.w * 0.92, rowH * 0.78);
      const glow = this.add
        .rectangle(0, 0, keySize * 1.15, keySize * 1.15, 0xffd54f, 0)
        .setStrokeStyle(2, 0xffd54f, 0)
        .setVisible(false);
      const keyImg = fitSquareImage(
        this.add.image(0, 0, chip.textureKey),
        keySize,
      );
      const hit = this.add
        .rectangle(0, 0, r.w * 0.95, rowH * 0.9, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.ctrl.unlockAudio();
        this.ctrl.setSelectedChip(chip.amount);
        this.updateKeySelection(chip.amount);
      });
      container.add([glow, keyImg, hit]);
      this.keyViews.push({ amount: chip.amount, container, keyImg, glow });
    });
    this.updateKeySelection(this.selectedChip);
  }

  /** Layered gold/emerald plaque for footer stats. */
  private addPlaque(
    cx: number,
    cy: number,
    w: number,
    h: number,
    tint: number,
  ) {
    const shadow = this.add
      .ellipse(cx, cy + h * 0.28, w * 0.92, h * 0.28, 0x000000, 0.35)
      .setDepth(5);
    const base = this.add
      .image(cx, cy, 'panel_btn')
      .setDisplaySize(w, h)
      .setTint(tint)
      .setDepth(6);
    return { shadow, base };
  }

  private buildFooter() {
    const r = pctSlot(this.frameRect, SLOTS.footer);
    const cy = r.y + r.h / 2;
    const h = r.h * 0.92;
    const fontSm = Math.max(16, Math.floor(h * 0.22));
    const fontLg = Math.max(26, Math.floor(h * 0.36));

    const balCx = r.x + r.w * 0.2;
    this.addPlaque(balCx, cy, r.w * 0.36, h, 0xd4a017);
    const coin = Math.round(Math.min(h * 0.55, 52));
    fitSquareImage(
      this.add.image(balCx - r.w * 0.1, cy, 'chip_gold'),
      coin,
    ).setDepth(7);
    this.balanceText = crispText(
      this.add
        .text(balCx + r.w * 0.04, cy, '0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${fontLg}px`,
          color: '#FFF8E1',
          fontStyle: 'bold',
          stroke: '#4a2800',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(7),
    );

    const winCx = r.x + r.w * 0.52;
    this.addPlaque(winCx, cy, r.w * 0.28, h, 0x2e7d32);
    this.winLabel = crispText(
      this.add
        .text(winCx, cy - h * 0.22, 'WIN', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${fontSm}px`,
          color: '#C8E6C9',
          fontStyle: 'bold',
          stroke: '#0d2f0d',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(7),
    );
    this.winText = crispText(
      this.add
        .text(winCx, cy + h * 0.16, '0', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${fontLg}px`,
          color: '#B9F6CA',
          fontStyle: 'bold',
          stroke: '#0d2f0d',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(7),
    );

    const recCx = r.x + r.w * 0.82;
    const rec = this.addPlaque(recCx, cy, r.w * 0.28, h, 0xb71c1c);
    rec.base.setInteractive({ useHandCursor: true });
    crispText(
      this.add
        .text(recCx, cy, 'Records', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${Math.max(18, Math.floor(h * 0.28))}px`,
          color: '#FFEBEE',
          fontStyle: 'bold',
          stroke: '#4a0000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(7),
    );
    rec.base.on('pointerdown', () => {
      this.tweens.add({
        targets: rec.base,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 80,
        yoyo: true,
      });
      this.showRecords();
    });
  }

  private buildChromeHud(width: number, _height: number) {
    // Sit chrome just above the cabinet (not stuck at the very top of the phone)
    const rowY = Math.max(36, this.frameRect.y - 44);
    const homeX = 36 + 32;
    const rightX = width - 36 - 28;

    const home = this.add
      .image(homeX, rowY, 'home_btn')
      .setDisplaySize(68, 68)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    home.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.history.back();
    });

    this.roundText = crispText(
      this.add
        .text(homeX + 48, rowY - 10, 'round:0000', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '22px',
          color: '#FFE082',
          fontStyle: 'bold',
          backgroundColor: '#00000099',
          padding: { x: 14, y: 6 },
        })
        .setDepth(50),
    );

    this.muteBtn = this.add
      .image(rightX, rowY, 'speaker_btn')
      .setDisplaySize(60, 60)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.muteBtn.on('pointerdown', () => {
      this.ctrl.unlockAudio();
      this.ctrl.toggleMute();
      this.updateMuteBtn(this.ctrl.isMuted);
    });
    this.updateMuteBtn(this.ctrl.isMuted);

    const helpY = rowY + 72;
    const help = this.add
      .image(rightX, helpY, 'panel_btn')
      .setDisplaySize(60, 60)
      .setOrigin(0.5)
      .setTint(0xc9a227)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    crispText(
      this.add
        .text(rightX, helpY, '?', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '32px',
          color: '#2a1200',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(51),
    );
    help.on('pointerdown', () =>
      this.showToast('Pick a key, tap a chest. Win = bet × multiplier.'),
    );

    this.pingText = crispText(
      this.add
        .text(width - 20, Math.max(12, rowY - 40), '12ms', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '18px',
          color: '#B9F6CA',
          fontStyle: 'bold',
          backgroundColor: '#00000099',
          padding: { x: 10, y: 4 },
        })
        .setOrigin(1, 0)
        .setDepth(50),
    );

    this.toastText = crispText(
      this.add
        .text(width / 2, Math.max(80, this.frameRect.y - 90), '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '26px',
          color: '#FFE082',
          fontStyle: 'bold',
          backgroundColor: '#000000dd',
          padding: { x: 28, y: 16 },
        })
        .setOrigin(0.5)
        .setDepth(80)
        .setAlpha(0),
    );

    this.bannerText = crispText(
      this.add
        .text(width / 2, this.frameRect.y + this.frameRect.h * 0.42, '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '44px',
          color: '#FFD54F',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(70)
        .setAlpha(0),
    );
  }

  private updateMuteBtn(muted: boolean) {
    if (!this.muteBtn) return;
    this.muteBtn.setAlpha(muted ? 0.45 : 1);
    this.muteBtn.setTint(muted ? 0x90a4ae : 0xffffff);
  }

  private buildResultOverlay(width: number, height: number) {
    this.resultOverlay = this.add
      .container(width / 2, height / 2)
      .setDepth(90)
      .setAlpha(0)
      .setVisible(false);

    const dim = this.add
      .rectangle(0, 0, width * 1.2, height * 1.2, 0x000000, 0.62)
      .setInteractive();

    const boxSize = Math.round(Math.min(width * 0.48, 400));
    this.resultChestSize = boxSize;

    // Inject spin keyframes once
    if (
      typeof document !== 'undefined' &&
      !document.getElementById('hc-win-spark-style')
    ) {
      const style = document.createElement('style');
      style.id = 'hc-win-spark-style';
      style.textContent = `
        @keyframes hcSparkSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${boxSize}px;height:${boxSize}px;position:relative;pointer-events:none;overflow:visible;`;

    const spark = document.createElement('img');
    spark.src = '/hero-chest/win-spark.webp';
    spark.alt = '';
    spark.style.cssText = `
      position:absolute;left:50%;top:50%;width:165%;height:165%;
      opacity:0;pointer-events:none;
      animation:hcSparkSpin 3.5s linear infinite;
      transform:translate(-50%,-50%);
    `;
    this.resultWinSparkEl = spark;

    const chest = document.createElement('img');
    chest.src = '/hero-chest/win-box.gif';
    chest.alt = 'Win';
    chest.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:auto;';

    const mult = document.createElement('div');
    mult.style.cssText = `
      position:absolute;top:4%;right:6%;left:auto;bottom:auto;
      display:flex;align-items:center;justify-content:center;
      font-family:Arial Black,Arial,Helvetica,sans-serif;
      font-size:${Math.max(36, Math.floor(boxSize * 0.18))}px;font-weight:900;
      color:#FFEB3B;
      text-shadow:
        -2px -2px 0 #5d1a00, 2px -2px 0 #5d1a00, -2px 2px 0 #5d1a00, 2px 2px 0 #5d1a00,
        0 3px 8px #000;
      pointer-events:none;opacity:0;line-height:1;
      z-index:2;
    `;
    this.resultWinMultEl = mult;

    wrap.append(spark, chest, mult);

    this.resultWinDom = this.add
      .dom(0, -56, wrap)
      .setOrigin(0.5)
      .setVisible(false);

    this.resultWinLine = crispText(
      this.add
        .text(0, Math.round(boxSize * 0.42), '', {
          fontFamily: 'Arial Black, Arial, Helvetica, sans-serif',
          fontSize: '44px',
          color: '#76FF03',
          stroke: '#000000',
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );

    this.resultDetail = crispText(
      this.add
        .text(0, Math.round(boxSize * 0.58), '', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '28px',
          color: '#FFE082',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.resultOverlay.add([
      dim,
      this.resultWinDom,
      this.resultWinLine,
      this.resultDetail,
    ]);
  }

  private showResult(payload: {
    winnerId: string;
    winCoins: number;
    userBetOnWinner: number;
  }) {
    const chest = chestById(payload.winnerId);
    this.lastWinAmount = payload.winCoins;
    this.winText.setText(this.formatCoins(payload.winCoins || 0));

    this.resultWinDom.setVisible(true).setScale(0.82).setAlpha(1);
    if (this.resultWinSparkEl) this.resultWinSparkEl.style.opacity = '0.95';

    const mult = chest?.multiplier ?? 0;
    if (this.resultWinMultEl) {
      this.resultWinMultEl.textContent = mult > 0 ? `x${mult}` : '';
      this.resultWinMultEl.style.opacity = mult > 0 ? '1' : '0';
    }

    if (payload.winCoins > 0) {
      this.resultWinLine.setText('YOU WIN!').setColor('#76FF03');
      this.resultDetail.setText(`+${this.formatCoins(payload.winCoins)} coins`);
    } else if (payload.userBetOnWinner > 0) {
      this.resultWinLine.setText('NICE TRY').setColor('#FFAB40');
      this.resultDetail.setText(chest?.name ?? 'No win');
    } else {
      this.resultWinLine.setText('RESULT').setColor('#FFD54F');
      this.resultDetail.setText(chest?.name ?? 'Better luck next time');
    }

    this.resultOverlay.setVisible(true).setAlpha(0).setScale(0.88);
    this.tweens.killTweensOf(this.resultOverlay);
    this.tweens.killTweensOf(this.resultWinDom);
    this.tweens.add({
      targets: this.resultOverlay,
      alpha: 1,
      scale: 1,
      duration: 380,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.resultWinDom,
      scale: 1,
      duration: 420,
      ease: 'Back.easeOut',
      delay: 60,
    });

    this.time.delayedCall(4500, () => this.hideResult());
  }

  private hideResult() {
    if (!this.resultOverlay?.visible) return;
    this.tweens.killTweensOf(this.resultWinDom);
    this.tweens.add({
      targets: this.resultOverlay,
      alpha: 0,
      scale: 0.94,
      duration: 220,
      onComplete: () => {
        this.resultOverlay?.setVisible(false);
        this.resultWinDom?.setVisible(false);
        if (this.resultWinSparkEl) this.resultWinSparkEl.style.opacity = '0';
        if (this.resultWinMultEl) this.resultWinMultEl.style.opacity = '0';
      },
    });
  }

  private buildRecordsOverlay(width: number, height: number) {
    this.recordsOverlay = this.add
      .container(width / 2, height / 2)
      .setDepth(95)
      .setVisible(false)
      .setAlpha(0);
  }

  private async showRecords() {
    const { width, height } = this.scale;
    this.recordsOverlay.removeAll(true);

    const panelW = Math.min(width * 0.92, 700);
    // Match generated portrait asset ~3:4
    const panelH = panelW * (900 / 680);

    const dim = this.add
      .rectangle(0, 0, width * 1.2, height * 1.2, 0x000000, 0.7)
      .setInteractive();
    dim.on('pointerdown', () => this.hideRecords());

    const panel = this.add
      .image(0, 0, 'records_panel')
      .setDisplaySize(Math.round(panelW), Math.round(panelH));
    panel.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Title sits on the gold ribbon of the art
    const title = crispText(
      this.add
        .text(0, -panelH * 0.355, 'My Records', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${Math.max(32, Math.floor(panelW * 0.065))}px`,
          color: '#3a1a00',
          fontStyle: 'bold',
          stroke: '#ffe9a8',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );

    const close = crispText(
      this.add
        .text(panelW * 0.38, -panelH * 0.42, '✕', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '32px',
          color: '#FFF8E1',
          fontStyle: 'bold',
          backgroundColor: '#00000088',
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true }),
    );
    close.on('pointerdown', () => this.hideRecords());

    const loading = crispText(
      this.add
        .text(0, panelH * 0.02, 'Loading…', {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '28px',
          color: '#FFE082',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.recordsOverlay.add([dim, panel, title, close, loading]);
    this.recordsOverlay.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.recordsOverlay,
      alpha: 1,
      duration: 240,
      ease: 'Cubic.easeOut',
    });

    if (!this.ctrl.userId) {
      loading.setText('Open from the app to see records');
      return;
    }

    const records = await this.ctrl.fetchMyRecords(16);
    if (!this.recordsOverlay.visible) return;
    loading.destroy();

    // Dark inset of the art — list area
    const listTop = -panelH * 0.18;
    const listBottom = panelH * 0.32;
    const listH = listBottom - listTop;
    const innerW = panelW * 0.72;

    if (records.length === 0) {
      this.recordsOverlay.add(
        crispText(
          this.add
            .text(0, panelH * 0.02, 'No bets yet — place a key!', {
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: '26px',
              color: '#FFE082',
              fontStyle: 'bold',
            })
            .setOrigin(0.5),
        ),
      );
      return;
    }

    const show = records.slice(0, 9);
    const rowH = Math.min(72, listH / show.length);

    show.forEach((rec, i) => {
      const y = listTop + rowH * (i + 0.5);
      const chest = chestById(rec.optionId);
      const net = rec.isWin ? rec.payout - rec.amount : -rec.amount;

      const rowBg = this.add
        .rectangle(0, y, innerW, rowH * 0.82, 0x1a0c05, 0.55)
        .setStrokeStyle(1, rec.isWin ? 0xc9a227 : 0x8d6e63, 0.55);

      const thumb = fitSquareImage(
        this.add.image(-innerW * 0.4, y, chest?.textureKey || 'chest_5a'),
        rowH * 0.7,
      );

      const badge = crispText(
        this.add
          .text(-innerW * 0.28, y, rec.isWin ? 'WIN' : 'LOSS', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${Math.max(16, Math.floor(rowH * 0.32))}px`,
            color: rec.isWin ? '#E8F5E9' : '#FFEBEE',
            fontStyle: 'bold',
            backgroundColor: rec.isWin ? '#2e7d32cc' : '#c62828cc',
            padding: { x: 8, y: 3 },
          })
          .setOrigin(0, 0.5),
      );

      const mult = crispText(
        this.add
          .text(-innerW * 0.02, y, chest ? `x${chest.multiplier}` : '', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${Math.max(20, Math.floor(rowH * 0.36))}px`,
            color: '#FFE082',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );

      const betTxt = crispText(
        this.add
          .text(innerW * 0.16, y, this.formatBetShort(rec.amount), {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${Math.max(18, Math.floor(rowH * 0.32))}px`,
            color: '#ffffffcc',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5),
      );

      const netTxt = crispText(
        this.add
          .text(
            innerW * 0.42,
            y,
            `${net >= 0 ? '+' : '-'}${this.formatBetShort(Math.abs(net))}`,
            {
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: `${Math.max(20, Math.floor(rowH * 0.36))}px`,
              color: net >= 0 ? '#A5D6A7' : '#EF9A9A',
              fontStyle: 'bold',
            },
          )
          .setOrigin(1, 0.5),
      );

      this.recordsOverlay.add([rowBg, thumb, badge, mult, betTxt, netTxt]);
    });

    const wins = records.filter((r) => r.isWin).length;
    const losses = records.length - wins;
    this.recordsOverlay.add(
      crispText(
        this.add
          .text(0, panelH * 0.38, `${wins} wins  ·  ${losses} losses`, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '24px',
            color: '#FFE082',
            fontStyle: 'bold',
            stroke: '#2a1200',
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      ),
    );
  }

  private hideRecords() {
    if (!this.recordsOverlay.visible) return;
    this.tweens.add({
      targets: this.recordsOverlay,
      alpha: 0,
      duration: 160,
      onComplete: () => this.recordsOverlay.setVisible(false),
    });
  }

  private bindController() {
    const c = this.ctrl;
    this.unsubs.push(
      c.on('ready', () => {
        this.refreshHudFromController();
        if (this.ctrl.currentRound?.status === 'betting') this.startIdleRoam();
      }),
      c.on('balance', (v) => this.balanceText.setText(this.formatCoins(v))),
      c.on('round', (round) => {
        const n = String(round?.round_number || 0).padStart(4, '0');
        this.roundText.setText(`round:${n}`);
        if (round?.status === 'betting' && !this.ctrl.isSpinning) {
          this.startIdleRoam();
        }
      }),
      c.on('countdown', (sec) => {
        if (this.ctrl.isSpinning) {
          this.countdownText.setText('··');
          return;
        }
        this.countdownText.setText(sec > 0 ? `${sec}s` : '--');
      }),
      c.on('ping', (ms) => this.pingText.setText(`${ms}ms`)),
      c.on('toast', (msg) => this.showToast(msg)),
      c.on('selectedChip', (amt) => this.updateKeySelection(amt)),
      c.on('bets', ({ current, all }) => this.updateBetLabels(current, all)),
      c.on('chipFly', (fly) => this.animateChipFly(fly)),
      c.on('history', (h) => this.renderHistory(h)),
      c.on('startBetting', () => {
        this.showBanner('START BETTING');
        this.countdownText.setText('GO');
        this.lastWinAmount = 0;
        this.winText.setText('0');
        this.startIdleRoam();
      }),
      c.on('bettingCleared', () => {
        this.winningId = null;
        this.stopIdleRoam();
        this.clearHighlights();
        this.updateBetLabels({}, {});
        this.hideResult();
      }),
      c.on('spinStart', () => {
        this.winningId = null;
        this.stopIdleRoam();
        this.clearHighlights();
        this.hideResult();
        this.countdownText.setText('··');
      }),
      c.on('spinIndex', (idx) => this.setHighlightIndex(idx, 'spin')),
      c.on('spinComplete', (payload) => {
        this.winningId = payload.winnerId;
        const winIdx = SPIN_ORDER.indexOf(payload.winnerId);
        if (winIdx >= 0) this.setHighlightIndex(winIdx, 'win');
        this.showResult(payload);
      }),
    );
  }

  private refreshHudFromController() {
    const c = this.ctrl;
    this.balanceText.setText(this.formatCoins(c.balance));
    this.winText.setText(this.formatCoins(this.lastWinAmount));
    const n = String(c.currentRound?.round_number || 0).padStart(4, '0');
    this.roundText.setText(`round:${n}`);
    this.renderHistory(c.history);
    this.updateBetLabels(c.currentBets, c.allBets);
    this.updateKeySelection(c.selectedChip);
  }

  private updateKeySelection(amount: number) {
    this.selectedChip = amount;
    this.keyViews.forEach((view) => {
      const selected = view.amount === amount;
      view.container.setScale(selected ? 1.12 : 1);
      view.glow.setVisible(selected);
      view.glow.setStrokeStyle(2, 0xffd54f, selected ? 1 : 0);
      view.keyImg.setTint(selected ? 0xffffff : 0xcccccc);
    });
  }

  private updateBetLabels(
    current: Record<string, number>,
    all: Record<string, number> = {},
  ) {
    for (const [id, cell] of this.cells) {
      const my = current[id] || 0;
      const total = all[id] || 0;
      const roomOnly = Math.max(0, total - my);

      if (roomOnly > 0) {
        cell.roomBetText.setText(this.formatBetShort(roomOnly)).setVisible(true);
      } else {
        cell.roomBetText.setVisible(false);
      }

      if (my > 0) {
        cell.myBetText.setText(this.formatBetShort(my)).setVisible(true);
      } else {
        cell.myBetText.setVisible(false);
      }

      this.renderCellChipStack(cell, total);
    }
  }

  private renderCellChipStack(cell: CellView, total: number) {
    cell.chipStack.removeAll(true);
    if (total <= 0) return;
    const count = Math.min(3, Math.max(1, Math.ceil(total / 10000)));
    const key = chipTextureForAmount(
      total >= 500000
        ? 500000
        : total >= 100000
          ? 100000
          : total >= 10000
            ? 10000
            : 2000,
    );
    for (let i = 0; i < count; i++) {
      const img = fitSquareImage(
        this.add.image((i - (count - 1) / 2) * 20, -i * 6, key),
        32,
      );
      cell.chipStack.add(img);
    }
  }

  private animateChipFly(fly: {
    optionId: string;
    amount: number;
    from: 'self' | 'room';
  }) {
    const cell = this.cells.get(fly.optionId);
    if (!cell) return;

    const key = chipTextureForAmount(fly.amount);
    let sx = this.keyBarCenter.x;
    let sy = this.keyBarCenter.y;

    if (fly.from === 'self') {
      const view = this.keyViews.find((v) => v.amount === this.selectedChip);
      if (view) {
        sx = view.container.x;
        sy = view.container.y;
      }
    } else {
      const { width } = this.scale;
      sx = Phaser.Math.Between(20, width - 20);
      sy = this.frameRect.y + 40;
    }

    const chip = this.add
      .image(sx, sy, key)
      .setDisplaySize(44, 44)
      .setDepth(120);

    this.tweens.add({
      targets: chip,
      x: cell.x,
      y: cell.y + cell.hit.height * 0.34,
      displayWidth: 28,
      displayHeight: 28,
      alpha: 0.35,
      duration: 380,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        chip.destroy();
        this.tweens.add({
          targets: cell.container,
          scale: 1.06,
          duration: 70,
          yoyo: true,
        });
      },
    });
  }

  private formatBetShort(n: number) {
    return this.formatCoins(n);
  }

  /** Compact coin labels: 1500→1.5K, 2000→2K, 1_500_000→1.5M */
  private formatCoins(n: number) {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) {
      const v = abs / 1_000_000;
      const s =
        abs % 1_000_000 === 0
          ? v.toFixed(0)
          : v.toFixed(1).replace(/\.0$/, '');
      return `${sign}${s}M`;
    }
    if (abs >= 1000) {
      const v = abs / 1000;
      const s =
        abs % 1000 === 0 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
      return `${sign}${s}K`;
    }
    return `${sign}${Math.round(abs)}`;
  }

  private clearHighlights() {
    for (const cell of this.cells.values()) {
      cell.glow.setVisible(false);
      cell.glow.setStrokeStyle(3, 0xffeb3b, 0);
      cell.glow.setFillStyle(0xffeb3b, 0);
      this.tweens.killTweensOf(cell.container);
      cell.container.setScale(1);
      cell.chest.clearTint();
    }
  }

  private setHighlightIndex(idx: number, mode: 'idle' | 'spin' | 'win' = 'spin') {
    const id = SPIN_ORDER[idx];
    this.clearHighlights();
    const cell = this.cells.get(id);
    if (!cell) return;

    const stroke =
      mode === 'idle' ? 0xffd54f : mode === 'win' ? 0xffeb3b : 0xfff176;
    const fillA = mode === 'idle' ? 0.1 : mode === 'win' ? 0.18 : 0.14;
    const scale = mode === 'win' ? 1.08 : mode === 'idle' ? 1.04 : 1.06;

    cell.glow.setVisible(true);
    cell.glow.setStrokeStyle(mode === 'idle' ? 2 : 3, stroke, 1);
    cell.glow.setFillStyle(stroke, fillA);

    if (mode === 'idle') {
      this.tweens.add({
        targets: cell.container,
        scale: scale,
        duration: 280,
        ease: 'Sine.easeOut',
      });
    } else {
      cell.container.setScale(scale);
    }

    if (this.winningId === id || mode === 'win') {
      cell.chest.setTint(0xfff59d);
    }
  }

  /** Soft anti-clockwise roam across chests while bet timer runs. */
  private startIdleRoam() {
    if (this.ctrl.isSpinning) return;
    if (this.idleRoaming) return;
    this.idleRoaming = true;
    this.setHighlightIndex(this.idleIndex, 'idle');
    this.scheduleIdleStep();
  }

  private stopIdleRoam() {
    this.idleRoaming = false;
    if (this.idleCall) {
      this.idleCall.remove(false);
      this.idleCall = null;
    }
  }

  private scheduleIdleStep() {
    if (this.idleCall) {
      this.idleCall.remove(false);
      this.idleCall = null;
    }
    if (!this.idleRoaming) return;
    this.idleCall = this.time.delayedCall(MainScene.IDLE_DWELL_MS, () => {
      this.idleCall = null;
      this.advanceIdleRoam();
    });
  }

  private advanceIdleRoam() {
    if (!this.idleRoaming || this.ctrl.isSpinning) {
      this.stopIdleRoam();
      return;
    }
    const n = SPIN_ORDER.length;
    // Anti-clockwise: decreasing index
    this.idleIndex = (this.idleIndex - 1 + n) % n;
    this.setHighlightIndex(this.idleIndex, 'idle');
    this.scheduleIdleStep();
  }

  private renderHistory(history: string[]) {
    this.historyCol.removeAll(true);
    const items = history.slice(-8).reverse();
    const size = Math.round(Math.max(44, this.frameRect.w * 0.08));
    items.forEach((id, i) => {
      const chest = chestById(id);
      if (!chest) return;
      const y = i * (size + 10);
      const img = fitSquareImage(this.add.image(0, y, chest.textureKey), size);
      this.historyCol.add(img);
      if (i === 0) {
        const tag = crispText(
          this.add
            .text(size * 0.35, y - size * 0.35, 'NEW', {
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: '14px',
              color: '#ffffff',
              backgroundColor: '#E91E63',
              padding: { x: 4, y: 2 },
              fontStyle: 'bold',
            })
            .setOrigin(0.5),
        );
        this.historyCol.add(tag);
      }
    });
  }

  private showToast(msg: string) {
    this.toastText.setText(msg).setAlpha(1);
    if (this.toastTimer) this.toastTimer.remove(false);
    this.toastTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 250 });
    });
  }

  private showBanner(msg: string) {
    this.bannerText.setText(msg).setAlpha(1).setScale(0.85);
    if (this.bannerTimer) this.bannerTimer.remove(false);
    this.tweens.add({
      targets: this.bannerText,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });
    this.bannerTimer = this.time.delayedCall(1600, () => {
      this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 300 });
    });
  }
}
