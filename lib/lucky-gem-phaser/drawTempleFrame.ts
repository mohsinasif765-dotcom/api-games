import * as Phaser from 'phaser';

export type TempleFrameLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  board: { x: number; y: number; w: number; h: number };
  archCx: number;
  archCy: number;
  archRadius: number;
  frameCx: number;
  frameCy: number;
  frameW: number;
  frameH: number;
};

const STONE_TOP = 0x6b4226;
const STONE_BOT = 0x2a1508;
const GOLD_HI = 0xffe9a0;
const GOLD_MID = 0xd4af37;
const GOLD_LO = 0x8a6a12;
const WELL_TOP = 0x3a2410;
const WELL_BOT = 0x1a0c06;
const ROPE = 0x5c3a1a;
const ROPE_HI = 0xc9a227;
const GEM = 0xc62828;

/**
 * Code-drawn main temple frame (main-structure.webp look):
 * golden arch + chevron bar + 3×3 rope grid + stone border.
 */
export function drawTempleFrame(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  targetW: number,
  targetH: number,
): TempleFrameLayout {
  g.clear();

  const bodyW = targetW;
  const bodyH = targetH * 0.78;
  const archR = bodyW * 0.36;
  const border = Math.max(14, bodyW * 0.055);
  const topBar = Math.max(22, bodyH * 0.07);

  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2 + archR * 0.22;
  const archCx = cx;
  const archCy = bodyY + border * 0.35;

  // ——— ARCH ———
  g.lineStyle(Math.max(10, bodyW * 0.028), GOLD_LO, 1);
  g.beginPath();
  g.arc(archCx, archCy, archR, Math.PI, 0, false);
  g.strokePath();

  g.lineStyle(Math.max(6, bodyW * 0.018), GOLD_MID, 1);
  g.beginPath();
  g.arc(archCx, archCy, archR - 4, Math.PI, 0, false);
  g.strokePath();

  g.lineStyle(Math.max(3, bodyW * 0.01), GOLD_HI, 0.85);
  g.beginPath();
  g.arc(archCx, archCy, archR - 9, Math.PI, 0, false);
  g.strokePath();

  // Greek-key style ticks
  const ticks = 22;
  for (let i = 0; i <= ticks; i++) {
    const a = Math.PI + (i / ticks) * Math.PI;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    g.lineStyle(2, i % 2 === 0 ? GOLD_HI : GOLD_LO, 0.75);
    g.lineBetween(
      archCx + cos * (archR - 14),
      archCy + sin * (archR - 14),
      archCx + cos * (archR - 4),
      archCy + sin * (archR - 4),
    );
  }

  // Side spokes only (no center spoke — it cut through the prize-wheel slice)
  g.lineStyle(Math.max(3, bodyW * 0.008), GOLD_MID, 0.9);
  for (const a of [-Math.PI * 0.68, -Math.PI * 0.32]) {
    const inner = archR * 0.55;
    const outer = archR - 10;
    g.lineBetween(
      archCx + Math.cos(a) * inner,
      archCy + Math.sin(a) * inner,
      archCx + Math.cos(a) * outer,
      archCy + Math.sin(a) * outer,
    );
  }

  // Red gem crest
  const gemY = archCy - archR + 4;
  g.fillStyle(GOLD_MID, 1);
  g.fillCircle(archCx, gemY, 16);
  g.fillStyle(GOLD_HI, 1);
  g.fillCircle(archCx, gemY - 2, 10);
  g.fillStyle(GEM, 1);
  g.fillTriangle(archCx, gemY - 12, archCx - 10, gemY + 8, archCx + 10, gemY + 8);
  g.fillStyle(0xff8a80, 0.7);
  g.fillCircle(archCx - 2, gemY - 2, 3);

  // ——— BODY ———
  g.fillStyle(0x000000, 0.4);
  g.fillRoundedRect(bodyX + 6, bodyY + 10, bodyW, bodyH, 12);

  g.fillGradientStyle(STONE_TOP, STONE_TOP, STONE_BOT, STONE_BOT, 1);
  g.fillRoundedRect(bodyX, bodyY, bodyW, bodyH, 12);

  g.lineStyle(3, GOLD_MID, 0.95);
  g.strokeRoundedRect(bodyX + 2, bodyY + 2, bodyW - 4, bodyH - 4, 10);
  g.lineStyle(1.5, GOLD_HI, 0.5);
  g.strokeRoundedRect(bodyX + 5, bodyY + 5, bodyW - 10, bodyH - 10, 8);

  const innerX = bodyX + border;
  const innerY = bodyY + border + topBar * 0.15;
  const innerW = bodyW - border * 2;
  const innerH = bodyH - border * 2 - topBar * 0.15;
  g.fillGradientStyle(0x2a1508, 0x2a1508, 0x120805, 0x120805, 1);
  g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);

  // Chevron bar
  const barY = bodyY + border * 0.35;
  const barH = topBar;
  g.fillGradientStyle(GOLD_MID, GOLD_MID, GOLD_LO, GOLD_LO, 1);
  g.fillRoundedRect(innerX, barY, innerW, barH, 4);
  g.fillGradientStyle(0x5c3a1a, 0x5c3a1a, 0x3a2410, 0x3a2410, 1);
  g.fillRoundedRect(innerX + 3, barY + 3, innerW - 6, barH - 6, 3);

  const zigs = 14;
  const zigW = (innerW - 12) / zigs;
  g.lineStyle(2, GOLD_HI, 0.65);
  g.beginPath();
  for (let i = 0; i <= zigs; i++) {
    const zx = innerX + 6 + i * zigW;
    const zy = barY + barH / 2 + (i % 2 === 0 ? -5 : 5);
    if (i === 0) g.moveTo(zx, zy);
    else g.lineTo(zx, zy);
  }
  g.strokePath();

  // Board
  const boardPad = Math.max(6, border * 0.25);
  const board = {
    x: innerX + boardPad,
    y: barY + barH + boardPad,
    w: innerW - boardPad * 2,
    h: innerY + innerH - (barY + barH + boardPad) - boardPad,
  };

  const gap = Math.max(5, board.w * 0.014);
  const cellW = (board.w - gap * 2) / 3;
  const cellH = (board.h - gap * 2) / 3;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const bx = board.x + col * (cellW + gap);
      const by = board.y + row * (cellH + gap);
      g.fillGradientStyle(WELL_TOP, WELL_TOP, WELL_BOT, WELL_BOT, 1);
      g.fillRoundedRect(bx, by, cellW, cellH, 4);
      g.lineStyle(1.5, 0x000000, 0.45);
      g.strokeRoundedRect(bx + 1, by + 1, cellW - 2, cellH - 2, 3);
      g.lineStyle(1, GOLD_LO, 0.35);
      g.strokeRoundedRect(bx + 3, by + 3, cellW - 6, cellH - 6, 2);
    }
  }

  // Rope dividers
  const ropeV = (x: number) => {
    g.lineStyle(5, ROPE, 1);
    g.lineBetween(x, board.y + 2, x, board.y + board.h - 2);
    g.lineStyle(2, ROPE_HI, 0.75);
    g.lineBetween(x - 1.5, board.y + 2, x - 1.5, board.y + board.h - 2);
    g.lineStyle(1.5, GOLD_LO, 0.55);
    g.lineBetween(x + 1.5, board.y + 2, x + 1.5, board.y + board.h - 2);
  };
  const ropeH = (y: number) => {
    g.lineStyle(5, ROPE, 1);
    g.lineBetween(board.x + 2, y, board.x + board.w - 2, y);
    g.lineStyle(2, ROPE_HI, 0.75);
    g.lineBetween(board.x + 2, y - 1.5, board.x + board.w - 2, y - 1.5);
    g.lineStyle(1.5, GOLD_LO, 0.55);
    g.lineBetween(board.x + 2, y + 1.5, board.x + board.w - 2, y + 1.5);
  };
  ropeV(board.x + cellW + gap * 0.5);
  ropeV(board.x + 2 * cellW + gap * 1.5);
  ropeH(board.y + cellH + gap * 0.5);
  ropeH(board.y + 2 * cellH + gap * 1.5);

  // Corner rivets
  const rivet = (rx: number, ry: number) => {
    g.fillStyle(GOLD_LO, 1);
    g.fillRoundedRect(rx - 8, ry - 8, 16, 16, 3);
    g.fillStyle(GOLD_HI, 1);
    g.fillCircle(rx, ry, 4);
    g.fillStyle(STONE_BOT, 1);
    g.fillCircle(rx, ry, 2);
  };
  rivet(bodyX + 18, bodyY + 18);
  rivet(bodyX + bodyW - 18, bodyY + 18);
  rivet(bodyX + 18, bodyY + bodyH - 18);
  rivet(bodyX + bodyW - 18, bodyY + bodyH - 18);

  // Bottom shell
  const shellR = 22;
  g.fillStyle(GOLD_MID, 1);
  g.slice(cx, bodyY + bodyH - 2, shellR, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
  g.fillPath();
  g.lineStyle(2, GOLD_HI, 0.85);
  g.slice(cx, bodyY + bodyH - 2, shellR, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
  g.strokePath();

  const frameH = bodyH + archR * 0.85;
  const frameY = archCy - archR;

  return {
    x: bodyX,
    y: bodyY,
    w: bodyW,
    h: bodyH,
    board,
    archCx,
    archCy,
    archRadius: archR * 0.92,
    frameCx: cx,
    frameCy: frameY + frameH / 2,
    frameW: bodyW,
    frameH,
  };
}
