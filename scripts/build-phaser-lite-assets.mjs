#!/usr/bin/env node
/**
 * Right-sized textures for the Phaser wheels (low-end phone RAM).
 *
 * Phaser canvases here are small (Scale.NONE, 360–400 px), so a 1000–1700 px
 * texture only costs decode RAM (4–7 MB each) and minification shimmer while
 * the wheel rotates. Every target below is ≥ 2× its on-canvas size AND ≥ 3×
 * its largest HTML (HUD) size. All scenes size these via setDisplaySize, so
 * on-screen layout is unchanged.
 *
 *   node scripts/build-phaser-lite-assets.mjs
 *
 * Sources are read from git-tracked originals; outputs get new names or a
 * bumped ?v= in config so phones don't keep the old cached file.
 */
import sharp from 'sharp';

const JOBS = [
  // lucky77 — wheel disc drawn at 360 canvas px (GAME_WIDTH).
  { src: 'public/lucky77/wheel-full.webp', out: 'public/lucky77/wheel-full-720.webp', width: 720 },
  // lucky77 — option art: HUD bet boxes ~53 css px, history dots smaller.
  { src: 'public/lucky77/watermelon.webp', out: 'public/lucky77/opt-watermelon.webp', width: 256 },
  { src: 'public/lucky77/77-emage.webp', out: 'public/lucky77/opt-77.webp', width: 256 },
  { src: 'public/lucky77/apple.webp', out: 'public/lucky77/opt-apple.webp', width: 256 },
  // luck77 — wheel logos 44 canvas px; HUD bet boxes ~37 css px.
  // (fruit-party/*.webp originals stay untouched for the Fruit Party game.)
  { src: 'public/fruit-party/watermelon.webp', out: 'public/77/opt-watermelon.webp', width: 256 },
  { src: 'public/77/symbol-77.webp', out: 'public/77/opt-77.webp', width: 256 },
  { src: 'public/fruit-party/mango.webp', out: 'public/77/opt-mango.webp', width: 256 },
];

for (const job of JOBS) {
  const meta = await sharp(job.src).metadata();
  const out = await sharp(job.src)
    .resize({ width: Math.min(job.width, meta.width), kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(job.out);
  const ramBefore = (meta.width * meta.height * 4) / 1048576;
  const ramAfter = (out.width * out.height * 4) / 1048576;
  console.log(
    `✔ ${job.out.padEnd(38)} ${meta.width}x${meta.height} → ${out.width}x${out.height}` +
      `  ${(out.size / 1024).toFixed(0)}KB  RAM ${ramBefore.toFixed(1)} → ${ramAfter.toFixed(1)} MB`,
  );
}
