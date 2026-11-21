#!/usr/bin/env node
/**
 * Resize + recompress Greedy Lion startup images to their real display size.
 *
 * Target widths = CSS display width × 3 (max phone DPR), rounded up, so art
 * stays crisp on every device while dropping multi-MB source files.
 *
 *   node scripts/optimize-greedy-lion-images.mjs          # write files
 *   node scripts/optimize-greedy-lion-images.mjs --dry    # report only
 *
 * Source of truth is git: re-running is safe (skips images already at their
 * target width, never upscales, only overwrites when the result is smaller). Restore originals with
 *   git checkout -- public/greedy-lion
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry');
const DIR = path.resolve('public/greedy-lion');

/** file → max width in px (display CSS px × 3, see greedy-phaser.module.css). */
const TARGETS = {
  // Promo art beside balance / profit panels: min(22%, 5.4rem) ≈ 86px
  'pizza.webp': 300,
  'salad.webp': 300,
  // Stand panel buttons: 40.3% of 430px stage ≈ 173px
  'today-revenue-rank.webp': 600,
  'myhistory.webp': 600,
  // Top-bar icon buttons: 2.85rem ≈ 46px
  'help_button.webp': 192,
  'music_button.webp': 192,
  'back-butten.webp': 192,
  // Footer auto button: 6.4rem ≈ 102px
  'auto-play.webp': 360,
  // Full-width strips (max phone width ≈ 430px)
  'reselat.webp': 1290,
  'footer.webp': 1290,
  // Clouds: min(78vw, 22rem) / min(52vw, 14rem) — also used by greedy-baby
  'cloud1.webp': 1200,
  'cloud2.webp': 720,
  // Footer avatar frame: 2.65rem ≈ 42px
  'avatar-frame.webp': 256,
  // Hub timer lion: min(22%, 5.25rem) ≈ 84px
  'lion.webp': 320,
  // Food art: wheel slots + win popup (≈ 120px max)
  'chicken.webp': 384,
  'beef.webp': 384,
  'strawberry.webp': 384,
  'grapes.webp': 384,
  // Wheel spark — shared by several Phaser games, keep headroom
  'wing-spark.webp': 512,
  // Result popup lion (win / loss): 5.1rem ≈ 82px
  'lain.webp': 300,
  'win-popup-loss.webp': 300,
};

const kb = (n) => `${(n / 1024).toFixed(0)}K`;

let before = 0;
let after = 0;

for (const [file, maxWidth] of Object.entries(TARGETS)) {
  const fp = path.join(DIR, file);
  const input = await fs.readFile(fp);
  const meta = await sharp(input).metadata();
  // Already at (or below) target: re-encoding would only add generation loss.
  if ((meta.width ?? 0) <= maxWidth) {
    before += input.length;
    after += input.length;
    console.log(`· ${file.padEnd(26)} ${meta.width}x${meta.height} already sized — skipped`);
    continue;
  }

  const out = await sharp(input)
    .resize({
      width: Math.min(maxWidth, meta.width ?? maxWidth),
      withoutEnlargement: true,
      kernel: 'lanczos3',
    })
    .webp({
      quality: 88,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer({ resolveWithObject: true });

  const keep = out.data.length < input.length;
  before += input.length;
  after += keep ? out.data.length : input.length;

  console.log(
    `${keep ? '✔' : '·'} ${file.padEnd(26)} ${meta.width}x${meta.height} ${kb(input.length).padStart(6)}` +
      `  →  ${out.info.width}x${out.info.height} ${kb(out.data.length).padStart(6)}${keep ? '' : '  (kept original)'}`,
  );

  if (keep && !DRY) await fs.writeFile(fp, out.data);
}

console.log(
  `\nTotal: ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB` +
    (DRY ? '  (dry run, nothing written)' : ''),
);
