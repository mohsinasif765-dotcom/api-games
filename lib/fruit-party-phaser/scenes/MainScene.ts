import * as Phaser from 'phaser';
import {
  CHIPS,
  GRID_LAYOUT,
  SLOTS,
  SPIN_ORDER,
  fruitById,
  chipTextureForAmount,
} from '../config';
import type { FruitPartyController } from '../FruitPartyController';

type Rect = { x: number; y: number; w: number; h: number };

type CellView = {
  id: string;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Image;
  highlight: Phaser.GameObjects.Image;
  winSpark: Phaser.GameObjects.Image;
  fruit: Phaser.GameObjects.Image;
  multText: Phaser.GameObjects.Text;
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
    x: frame.x + (s.left / 100) * frame.w,
    y: frame.y + (s.top / 100) * frame.h,
    w: (s.w / 100) * frame.w,
    h: (s.h / 100) * frame.h,
  };
}

export class MainScene extends Phaser.Scene {
  private ctrl!: FruitPartyController;
  private unsubs: Array<() => void> = [];

  private frameRect!: Rect;
  private balanceText!: Phaser.GameObjects.Text;
  private mineText!: Phaser.GameObjects.Text;
  private profitText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private timerLight!: Phaser.GameObjects.Image;
  private pingText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private resultOverlay!: Phaser.GameObjects.Container;
  private resultFrame!: Phaser.GameObjects.Image;
  private resultFruit!: Phaser.GameObjects.Image;
  private resultSpark!: Phaser.GameObjects.Image;
  private resultWinLine!: Phaser.GameObjects.Text;
  private resultDetail!: Phaser.GameObjects.Text;
  private resultFruitSize = 80;
  private historyRow!: Phaser.GameObjects.Container;
  private muteBtn!: Phaser.GameObjects.Image;
  private autoLabel!: Phaser.GameObjects.Text;
  private autoState!: Phaser.GameObjects.Text;
  private autoBtnBg!: Phaser.GameObjects.Image;
  private reelSlots: Array<{
    cx: number;
    cy: number;
    size: number;
    img: Phaser.GameObjects.Image;
  }> = [];
  private recentWins: string[] = [];

  private cells = new Map<string, CellView>();
  private chipViews: Array<{
    amount: number;
    container: Phaser.GameObjects.Container;
    pill: Phaser.GameObjects.Image;
    pedestal: Phaser.GameObjects.Image;
    coin: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
  }> = [];
  private chipBarCenter = { x: 0, y: 0 };
  private chipRowY = 0;
  private selectedChip = 1000;
  private winningId: string | null = null;
  private highlightedIndex: number | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('MainScene');
  }

  init(data: { controller?: FruitPartyController }) {
    this.ctrl =
      data?.controller ||
      (this.game.registry.get('controller') as FruitPartyController);
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d0518');

    // Full-bleed arcade room background
    const bg = this.add.image(width / 2, height / 2, 'bg_mage').setDepth(0);
    const bgScale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(bgScale);

    // Frame fills the canvas (canvas aspect matches asset)
    const frameImg = this.add.image(width / 2, height / 2, 'frame').setOrigin(0.5);
    const scale = Math.min(width / frameImg.width, height / frameImg.height);
    frameImg.setScale(scale).setDepth(1);
    this.frameRect = {
      x: frameImg.x - frameImg.displayWidth / 2,
      y: frameImg.y - frameImg.displayHeight / 2,
      w: frameImg.displayWidth,
      h: frameImg.displayHeight,
    };

    this.buildJackpot();
    this.buildReels();
    this.buildBoard();
    this.buildHistoryStrip();
    this.buildChipBar();
    this.buildBtnRow();
    this.buildChromeHud(width, height);
    this.buildResultOverlay(width, height);

    this.selectedChip = this.ctrl.selectedChip;
    this.bindController();
    this.refreshHudFromController();

    // Unlock WebView audio on first tap anywhere
    this.input.once('pointerdown', () => this.ctrl.unlockAudio());

    const round = this.ctrl.currentRound;
    if (round?.status === 'spinning' && round.winner_result) {
      const winIdx = SPIN_ORDER.indexOf(round.winner_result);
      if (winIdx >= 0) this.setHighlightIndex(winIdx);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  shutdown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private buildJackpot() {
    const r = pctSlot(this.frameRect, SLOTS.jackpot);
    const coinSize = Math.min(r.h * 0.72, 28);
    this.add
      .image(r.x + r.w * 0.2, r.y + r.h / 2, 'chip_gold')
      .setDisplaySize(coinSize, coinSize)
      .setDepth(5);

    this.balanceText = this.add
      .text(r.x + r.w * 0.56, r.y + r.h / 2, '0', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${Math.max(18, Math.floor(r.h * 0.58))}px`,
        color: '#FFD54F',
        stroke: '#5d2c00',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  private buildReels() {
    const r = pctSlot(this.frameRect, SLOTS.reels);
    const cellW = r.w / 3;
    const size = Math.min(cellW * 0.78, r.h * 0.92);
    this.reelSlots = [];

    for (let i = 0; i < 3; i++) {
      // Nudge rightmost fruit slightly inward toward center
      const inward = i === 2 ? cellW * 0.18 : 0;
      const cx = r.x + cellW * (i + 0.5) - inward;
      const cy = r.y + r.h / 2;
      const fruit = fruitById(SPIN_ORDER[i % SPIN_ORDER.length])!;
      const img = this.add
        .image(cx, cy, fruit.textureKey)
        .setDisplaySize(size, size)
        .setDepth(6);
      this.reelSlots.push({ cx, cy, size, img });
    }
  }

  /** Top 3 windows: static last-3 winners only (no spin animation). */
  private setReelWins(history: string[]) {
    const wins = history.filter(Boolean).slice(-3);
    this.recentWins = wins;
    this.reelSlots.forEach((slot, i) => {
      const id = wins[i] ?? SPIN_ORDER[i % SPIN_ORDER.length];
      const fruit = fruitById(id);
      if (!fruit) return;
      slot.img
        .setTexture(fruit.textureKey)
        .setDisplaySize(slot.size, slot.size)
        .setPosition(slot.cx, slot.cy)
        .setAlpha(1);
    });
  }

  private buildBoard() {
    const board = pctSlot(this.frameRect, SLOTS.board);
    const gapX = board.w * 0.014;
    const gapY = board.h * 0.014;
    const cellW = (board.w - gapX * 2) / 3;
    const cellH = (board.h - gapY * 2) / 3;
    const boxSize = Math.min(cellW, cellH) * 0.98;

    GRID_LAYOUT.forEach((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = board.x + col * (cellW + gapX) + cellW / 2;
      const y = board.y + row * (cellH + gapY) + cellH / 2;
      // Checkerboard: half cells box1, half box2
      const boxKey = (col + row) % 2 === 0 ? 'cell_box1' : 'cell_box2';

      if (!id) {
        this.add
          .image(x, y, 'timer_box')
          .setDisplaySize(boxSize, boxSize)
          .setDepth(9);
        this.timerLight = this.add
          .image(x, y, 'timer_box_light')
          .setDisplaySize(boxSize * 1.08, boxSize * 1.08)
          .setDepth(11)
          .setAlpha(1);
        // Marquee lights blink on/off
        this.tweens.add({
          targets: this.timerLight,
          alpha: { from: 1, to: 0.15 },
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.countdownText = this.add
          .text(x, y, '--', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: `${Math.floor(Math.min(cellW, cellH) * 0.42)}px`,
            color: '#FFEB3B',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(12);
        return;
      }

      const fruitMeta = fruitById(id)!;
      const container = this.add.container(x, y).setDepth(10);
      const box = this.add.image(0, 0, boxKey).setDisplaySize(boxSize, boxSize);
      // Spin highlight replaces box look (neon frame)
      const highlight = this.add
        .image(0, 0, 'cell_highlight')
        .setDisplaySize(boxSize * 1.06, boxSize * 1.06)
        .setVisible(false);
      // Win spark behind fruit, inside the box
      const winSpark = this.add
        .image(0, 0, 'win_spark')
        .setDisplaySize(boxSize * 0.92, boxSize * 0.92)
        .setVisible(false)
        .setAlpha(0.95);
      const fruitSize = Math.min(cellW, cellH) * 0.58;
      const fruit = this.add
        .image(0, 2, fruitMeta.textureKey)
        .setDisplaySize(fruitSize, fruitSize);
      const multText = this.add
        .text(cellW * 0.36, -cellH * 0.36, `${fruitMeta.multiplier}×`, {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(8, Math.floor(cellW * 0.12))}px`,
          color: '#ffffff',
          fontStyle: 'bold',
          backgroundColor: fruitMeta.accent,
          padding: { x: 3, y: 1 },
        })
        .setOrigin(1, 0);
      const roomBetText = this.add
        .text(0, cellH * 0.22, '', {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(7, Math.floor(cellW * 0.09))}px`,
          color: '#1565C0',
          fontStyle: 'bold',
          backgroundColor: '#fffffff0',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setVisible(false);
      const myBetText = this.add
        .text(0, cellH * 0.36, '', {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(7, Math.floor(cellW * 0.1))}px`,
          color: '#FFD54F',
          fontStyle: 'bold',
          backgroundColor: '#000000b3',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setVisible(false);
      const chipStack = this.add.container(0, cellH * 0.08);

      const hit = this.add
        .rectangle(0, 0, cellW * 0.94, cellH * 0.94, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.ctrl.unlockAudio();
        this.ctrl.placeBetOnOption(id);
      });

      // Order: box → highlight → spark → fruit → chips → UI
      container.add([
        box,
        highlight,
        winSpark,
        fruit,
        chipStack,
        multText,
        roomBetText,
        myBetText,
        hit,
      ]);
      this.cells.set(id, {
        id,
        x,
        y,
        container,
        box,
        highlight,
        winSpark,
        fruit,
        multText,
        myBetText,
        roomBetText,
        chipStack,
        hit,
      });
    });
  }

  private buildHistoryStrip() {
    const r = pctSlot(this.frameRect, SLOTS.strip);
    this.add
      .text(r.x + 4, r.y + r.h / 2, 'Result', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${Math.max(7, Math.floor(r.h * 0.28))}px`,
        color: '#ffffff8c',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(5);

    this.historyRow = this.add
      .container(r.x + r.w * 0.18, r.y + r.h / 2)
      .setDepth(5);
  }

  private buildChipBar() {
    const r = pctSlot(this.frameRect, SLOTS.chips);
    this.chipBarCenter = { x: r.x + r.w / 2, y: r.y + r.h * 0.55 };
    this.chipRowY = r.y + r.h * 0.52;
    const colW = r.w / CHIPS.length;
    const pillW = colW * 0.88;
    const pillH = r.h * 0.32;
    const pedW = colW * 0.62;
    const pedH = r.h * 0.55;

    this.chipViews = [];
    CHIPS.forEach((chip, i) => {
      const cx = r.x + colW * (i + 0.5);
      const cy = r.y + r.h * 0.52;
      const container = this.add.container(cx, cy).setDepth(6);

      const pedestal = this.add
        .image(0, r.h * 0.12, 'chip_pedestal_off')
        .setDisplaySize(pedW, pedH);
      const pill = this.add
        .image(0, -r.h * 0.28, 'chip_pill_off')
        .setDisplaySize(pillW, pillH);
      const coinSize = Math.min(pillH * 0.85, pillW * 0.28);
      const coin = this.add
        .image(-pillW * 0.28, -r.h * 0.28, chip.textureKey)
        .setDisplaySize(coinSize, coinSize);
      const label = this.add
        .text(pillW * 0.12, -r.h * 0.28, chip.label, {
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: `${Math.max(9, Math.floor(pillH * 0.55))}px`,
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);

      const hit = this.add
        .rectangle(0, 0, colW * 0.92, r.h * 0.95, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.ctrl.unlockAudio();
        this.ctrl.setSelectedChip(chip.amount);
        this.updateChipSelection(chip.amount);
      });

      container.add([pedestal, pill, coin, label, hit]);
      this.chipViews.push({ amount: chip.amount, container, pill, pedestal, coin, label });
    });
    this.updateChipSelection(this.selectedChip);
  }

  private buildBtnRow() {
    const r = pctSlot(this.frameRect, SLOTS.btnRow);
    const gap = r.w * 0.025;
    const btnW = (r.w - gap * 2) / 3;
    const fontSm = Math.max(7, Math.floor(r.h * 0.2));
    const fontLg = Math.max(11, Math.floor(r.h * 0.3));

    const centers = [
      r.x + btnW / 2,
      r.x + btnW + gap + btnW / 2,
      r.x + 2 * (btnW + gap) + btnW / 2,
    ];

    // Mine — purple capsule container
    this.add
      .image(centers[0], r.y + r.h / 2, 'auto_btn')
      .setDisplaySize(btnW, r.h)
      .setDepth(6);
    this.add
      .text(centers[0], r.y + r.h * 0.32, 'MINE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${fontSm}px`,
        color: '#FFE082',
        fontStyle: 'bold',
        stroke: '#3a1060',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.mineText = this.add
      .text(centers[0], r.y + r.h * 0.66, '0', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontLg}px`,
        color: '#ffffff',
        stroke: '#3a1060',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(7);

    // Today Win — purple capsule container
    this.add
      .image(centers[1], r.y + r.h / 2, 'auto_btn')
      .setDisplaySize(btnW, r.h)
      .setDepth(6);
    this.add
      .text(centers[1], r.y + r.h * 0.32, 'TODAY WIN', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${fontSm}px`,
        color: '#FFE082',
        fontStyle: 'bold',
        stroke: '#3a1060',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.profitText = this.add
      .text(centers[1], r.y + r.h * 0.66, '+0', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontLg}px`,
        color: '#B9F6CA',
        stroke: '#3a1060',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(7);

    // Auto button (asset + labels)
    const autoBg = this.add
      .image(centers[2], r.y + r.h / 2, 'auto_btn')
      .setDisplaySize(btnW, r.h)
      .setInteractive({ useHandCursor: true })
      .setDepth(6);
    autoBg.on('pointerdown', () => this.ctrl.toggleAutoBet());
    this.autoBtnBg = autoBg;

    this.autoLabel = this.add
      .text(centers[2], r.y + r.h * 0.35, 'AUTO', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${Math.max(11, Math.floor(r.h * 0.32))}px`,
        color: '#ffffff',
        stroke: '#3a1060',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.autoState = this.add
      .text(centers[2], r.y + r.h * 0.7, 'OFF', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${fontSm}px`,
        color: '#ffffffcc',
        fontStyle: 'bold',
        stroke: '#3a1060',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(7);
  }

  private buildChromeHud(width: number, height: number) {
    const home = this.add
      .image(10 + 16, 8 + 16, 'home_btn')
      .setDisplaySize(32, 32)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    home.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.history.back();
    });

    this.roundText = this.add
      .text(48, 12, 'round:0000', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        color: '#ffffffd9',
        backgroundColor: '#00000073',
        padding: { x: 5, y: 3 },
      })
      .setDepth(50);

    this.muteBtn = this.add
      .image(10 + 16, 44 + 16, 'speaker_btn')
      .setDisplaySize(28, 28)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.muteBtn.on('pointerdown', () => {
      this.ctrl.unlockAudio();
      this.ctrl.toggleMute();
    });
    this.updateMuteBtn(this.ctrl.isMuted);

    this.pingText = this.add
      .text(width - 10, 8, '12ms', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '9px',
        color: '#76FF03',
        backgroundColor: '#00000080',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(1, 0)
      .setDepth(50);

    this.toastText = this.add
      .text(width / 2, height * 0.12, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        color: '#FFD54F',
        backgroundColor: '#000000d9',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0);

    this.bannerText = this.add
      .text(width / 2, this.frameRect.y + this.frameRect.h * 0.48, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#FFD54F',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setAlpha(0);
  }

  private buildResultOverlay(width: number, height: number) {
    this.resultOverlay = this.add
      .container(width / 2, height / 2)
      .setDepth(90)
      .setAlpha(0)
      .setVisible(false);

    const dim = this.add
      .rectangle(0, 0, width * 1.2, height * 1.2, 0x000000, 0.62)
      .setInteractive(); // block clicks behind

    const frameW = Math.min(width * 0.86, 320);
    const frameH = frameW * (762 / 691);
    this.resultFrame = this.add
      .image(0, 0, 'result_popup')
      .setDisplaySize(frameW, frameH);

    // Navy content panel sits below JACKPOT ribbon (~42%–92% of frame)
    const panelCenterY = frameH * 0.18;
    this.resultFruitSize = frameW * 0.32;

    this.resultSpark = this.add
      .image(0, panelCenterY - frameH * 0.06, 'win_spark')
      .setDisplaySize(this.resultFruitSize * 1.55, this.resultFruitSize * 1.55)
      .setAlpha(0);

    this.resultFruit = this.add
      .image(0, panelCenterY - frameH * 0.06, 'fruit_strawberry')
      .setDisplaySize(this.resultFruitSize, this.resultFruitSize)
      .setVisible(false);

    this.resultWinLine = this.add
      .text(0, panelCenterY + frameH * 0.12, '', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${Math.max(18, Math.floor(frameW * 0.085))}px`,
        color: '#76FF03',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5);

    this.resultDetail = this.add
      .text(0, panelCenterY + frameH * 0.2, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${Math.max(12, Math.floor(frameW * 0.045))}px`,
        color: '#FFE082',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.resultOverlay.add([
      dim,
      this.resultFrame,
      this.resultSpark,
      this.resultFruit,
      this.resultWinLine,
      this.resultDetail,
    ]);
  }

  private showResult(payload: {
    winnerId: string;
    winCoins: number;
    userBetOnWinner: number;
  }) {
    const fruit = fruitById(payload.winnerId);
    const size = this.resultFruitSize;

    if (fruit) {
      this.resultFruit
        .setTexture(fruit.textureKey)
        .setVisible(true)
        .setDisplaySize(size * 0.55, size * 0.55)
        .setAlpha(1);
    } else {
      this.resultFruit.setVisible(false);
    }

    if (payload.winCoins > 0) {
      this.resultWinLine.setText('YOU WIN!').setColor('#76FF03');
      this.resultDetail.setText(`+${payload.winCoins.toLocaleString()} coins`);
      this.resultSpark.setAlpha(0.95);
      this.tweens.killTweensOf(this.resultSpark);
      this.resultSpark.setAngle(0);
      this.tweens.add({
        targets: this.resultSpark,
        angle: 360,
        duration: 3500,
        repeat: -1,
        ease: 'Linear',
      });
    } else if (payload.userBetOnWinner > 0) {
      this.resultWinLine.setText('NICE TRY').setColor('#FFAB40');
      this.resultDetail.setText(
        fruit ? `${fruit.name}  ×${fruit.multiplier}` : 'No win this round',
      );
      this.resultSpark.setAlpha(0);
    } else {
      this.resultWinLine.setText('RESULT').setColor('#FFD54F');
      this.resultDetail.setText(
        fruit
          ? `${fruit.name}  ×${fruit.multiplier}`
          : 'Better luck next time',
      );
      this.resultSpark.setAlpha(0);
    }

    this.resultOverlay.setVisible(true).setAlpha(0).setScale(0.88);
    this.tweens.killTweensOf(this.resultOverlay);
    this.tweens.add({
      targets: this.resultOverlay,
      alpha: 1,
      scale: 1,
      duration: 380,
      ease: 'Back.easeOut',
    });

    if (this.resultFruit.visible) {
      this.tweens.killTweensOf(this.resultFruit);
      this.tweens.add({
        targets: this.resultFruit,
        displayWidth: size,
        displayHeight: size,
        duration: 420,
        ease: 'Back.easeOut',
        delay: 60,
      });
    }

    this.time.delayedCall(4500, () => this.hideResult());
  }

  private hideResult() {
    if (!this.resultOverlay?.visible) return;
    this.tweens.killTweensOf(this.resultSpark);
    this.tweens.killTweensOf(this.resultFruit);
    this.tweens.add({
      targets: this.resultOverlay,
      alpha: 0,
      scale: 0.94,
      duration: 220,
      onComplete: () => {
        this.resultOverlay?.setVisible(false);
        this.resultFruit?.setVisible(false);
        this.resultSpark?.setAlpha(0);
      },
    });
  }

  private bindController() {
    const c = this.ctrl;
    this.unsubs.push(
      c.on('ready', () => this.refreshHudFromController()),
      c.on('balance', (v) => {
        this.balanceText.setText(v.toLocaleString());
        this.mineText.setText(v.toLocaleString());
      }),
      c.on('profit', (v) => {
        const sign = v >= 0 ? '+' : '';
        this.profitText.setText(`${sign}${v.toLocaleString()}`);
        this.profitText.setColor(v >= 0 ? '#B9F6CA' : '#FF8A80');
      }),
      c.on('round', (round) => {
        const n = String(round?.round_number || 0).padStart(4, '0');
        this.roundText.setText(`round:${n}`);
      }),
      c.on('countdown', (sec) => {
        if (!this.countdownText) return;
        // Hide timer while board is spinning — no spin-phase countdown
        if (this.ctrl.isSpinning) {
          this.countdownText.setText('··');
          return;
        }
        this.countdownText.setText(sec > 0 ? String(sec) : '--');
      }),
      c.on('ping', (ms) => this.pingText.setText(`${ms}ms`)),
      c.on('toast', (msg) => this.showToast(msg)),
      c.on('muted', (muted) => this.updateMuteBtn(muted)),
      c.on('autoBet', (on) => this.updateAutoBtn(on)),
      c.on('selectedChip', (amt) => this.updateChipSelection(amt)),
      c.on('bets', ({ current, all }) => this.updateBetLabels(current, all)),
      c.on('chipFly', (fly) => this.animateChipFly(fly)),
      c.on('history', (h) => {
        this.renderHistory(h);
        this.setReelWins(h);
      }),
      c.on('startBetting', () => {
        this.showBanner('START BETTING');
        if (this.countdownText) this.countdownText.setText('GO');
      }),
      c.on('bettingCleared', () => {
        this.winningId = null;
        this.highlightedIndex = null;
        this.clearHighlights();
        this.updateBetLabels({}, {});
        this.hideResult();
      }),
      c.on('spinStart', () => {
        this.winningId = null;
        this.hideResult();
        if (this.countdownText) this.countdownText.setText('··');
      }),
      c.on('spinIndex', (idx) => {
        this.setHighlightIndex(idx);
      }),
      c.on('spinComplete', (payload) => {
        this.winningId = payload.winnerId;
        const winIdx = SPIN_ORDER.indexOf(payload.winnerId);
        if (winIdx >= 0) this.setHighlightIndex(winIdx);
        this.setReelWins([...this.recentWins, payload.winnerId]);
        this.showResult(payload);
      }),
    );
  }

  private refreshHudFromController() {
    const c = this.ctrl;
    this.balanceText.setText(c.balance.toLocaleString());
    this.mineText.setText(c.balance.toLocaleString());
    const sign = c.todayProfit >= 0 ? '+' : '';
    this.profitText.setText(`${sign}${c.todayProfit.toLocaleString()}`);
    this.profitText.setColor(c.todayProfit >= 0 ? '#B9F6CA' : '#FF8A80');
    const n = String(c.currentRound?.round_number || 0).padStart(4, '0');
    this.roundText.setText(`round:${n}`);
    this.updateMuteBtn(c.isMuted);
    this.updateAutoBtn(c.autoBet);
    this.renderHistory(c.history);
    this.setReelWins(c.history);
    this.updateBetLabels(c.currentBets, c.allBets);
    this.updateChipSelection(c.selectedChip);
  }

  private updateMuteBtn(muted: boolean) {
    if (!this.muteBtn) return;
    // Asset is speaker icon; dim + cool tint when muted
    this.muteBtn.setAlpha(muted ? 0.55 : 1);
    this.muteBtn.setTint(muted ? 0x90a4ae : 0xffffff);
  }

  private updateAutoBtn(on: boolean) {
    this.autoLabel.setColor(on ? '#76FF03' : '#ffffff');
    this.autoState.setText(on ? 'ON' : 'OFF');
    this.autoState.setColor(on ? '#B9F6CA' : '#ffffffcc');
    if (this.autoBtnBg) {
      this.autoBtnBg.setTint(on ? 0xe8ffe8 : 0xffffff);
    }
  }

  private updateChipSelection(amount: number) {
    this.selectedChip = amount;
    this.chipViews.forEach((view) => {
      const selected = view.amount === amount;
      view.pill.setTexture(selected ? 'chip_pill_on' : 'chip_pill_off');
      view.pedestal.setTexture(
        selected ? 'chip_pedestal_on' : 'chip_pedestal_off',
      );
      view.container.setScale(selected ? 1.06 : 1);
      // Selected sits slightly up; unselected nudged down a bit
      view.container.setY(this.chipRowY + (selected ? -3 : 6));
      view.label.setColor('#ffffff');
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
    const count = Math.min(4, Math.max(1, Math.ceil(total / 5000)));
    const key = chipTextureForAmount(
      total >= 50000 ? 50000 : total >= 10000 ? 10000 : total >= 5000 ? 5000 : 1000,
    );
    for (let i = 0; i < count; i++) {
      const img = this.add
        .image((i - (count - 1) / 2) * 10, -i * 3, key)
        .setDisplaySize(18, 18);
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
    let sx = this.chipBarCenter.x;
    let sy = this.chipBarCenter.y;

    if (fly.from === 'self') {
      const view = this.chipViews.find((v) => v.amount === this.selectedChip);
      if (view) {
        sx = view.container.x;
        sy = view.container.y;
      }
    } else {
      // Other players: fly in from top/side toward the cell
      const { width } = this.scale;
      sx = Phaser.Math.Between(20, width - 20);
      sy = this.frameRect.y + 40;
    }

    const chip = this.add
      .image(sx, sy, key)
      .setDisplaySize(22, 22)
      .setDepth(120)
      .setAlpha(1);

    // Straight slide into the fruit cell (no pop-up / grow)
    this.tweens.add({
      targets: chip,
      x: cell.x,
      y: cell.y,
      displayWidth: 16,
      displayHeight: 16,
      alpha: 0.4,
      duration: 380,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        chip.destroy();
        this.tweens.add({
          targets: cell.container,
          scale: 1.05,
          duration: 70,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      },
    });
  }

  private formatBetShort(n: number) {
    return n >= 1000
      ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
      : String(n);
  }

  private clearHighlights() {
    for (const cell of this.cells.values()) {
      cell.highlight.setVisible(false);
      cell.winSpark.setVisible(false);
      cell.box.setVisible(true);
      cell.fruit.clearTint();
      cell.container.setScale(1);
      this.tweens.killTweensOf(cell.winSpark);
      cell.winSpark.setAngle(0).setAlpha(0.95);
    }
  }

  private setHighlightIndex(idx: number) {
    this.highlightedIndex = idx;
    const id = SPIN_ORDER[idx];
    this.clearHighlights();
    const cell = this.cells.get(id);
    if (!cell) return;
    // Highlight image takes the place of the normal box during spin
    cell.box.setVisible(false);
    cell.highlight.setVisible(true);
    cell.container.setScale(1.04);

    // Winner: golden spark behind fruit inside the box
    if (this.winningId === id) {
      cell.winSpark.setVisible(true).setAlpha(0.95);
      this.tweens.add({
        targets: cell.winSpark,
        angle: 360,
        duration: 4000,
        repeat: -1,
        ease: 'Linear',
      });
    }
  }

  private renderHistory(history: string[]) {
    this.historyRow.removeAll(true);
    const items = history.slice(-6);
    const size = Math.max(18, this.frameRect.w * 0.055);
    const spacing = size + 6;
    items.forEach((id, i) => {
      const fruit = fruitById(id);
      if (!fruit) return;
      const img = this.add
        .image(i * spacing, 0, fruit.textureKey)
        .setDisplaySize(size, size);
      this.historyRow.add(img);
    });
  }

  private showToast(msg: string) {
    this.toastText.setText(msg).setAlpha(1);
    if (this.toastTimer) this.toastTimer.remove(false);
    this.toastTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 200 });
    });
  }

  private showBanner(msg: string) {
    this.bannerText.setText(msg).setAlpha(1).setScale(0.85);
    this.tweens.add({
      targets: this.bannerText,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });
    if (this.bannerTimer) this.bannerTimer.remove(false);
    this.bannerTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 300 });
    });
  }
}
