#!/usr/bin/env node
/**
 * Downscale HTML/CSS game images to the size they are actually shown at
 * (× DPR 3), using a measurement plan from a real render of each game.
 *
 * Big images shown small cost decode memory on every phone (a 1254² RGBA
 * texture is ~6 MB of RAM even if drawn at 46 px) — the main reason low-end
 * phones stutter. Plan input (JSON): { "/path.webp": { game, needW, needH, modes } }
 * where needW/needH are the largest rendered CSS px seen and modes are the
 * sizing modes ("img:", "bg:contain", "bg:cover", "bg:100% 100%", …).
 *
 * Safety rules (an image is skipped unless ALL hold):
 *   - the plan only contains DOM/CSS images (Phaser textures are excluded
 *     upstream: their on-screen size can depend on the texture's native size);
 *   - the file name appears in source only under that game's own folders;
 *   - the result is < 75% of the current width (otherwise not worth it).
 *
 *   node scripts/resize-measured-images.mjs <plan.json>          # dry run
 *   node scripts/resize-measured-images.mjs <plan.json> --write
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [planFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WRITE = process.argv.includes('--write');
const DPR = 3;
const MAX_RATIO = 0.75;

/** Source folders that belong to each game route. */
const GAME_DIRS = {
  lucky77: ['app/lucky77', 'lib/lucky-777-phaser'],
  luck77: ['app/luck77', 'lib/lucky-77-phaser'],
  'euro-roulette': ['app/euro-roulette', 'lib/euro-roulette-phaser'],
  football: ['app/football', 'lib/football-phaser'],
  'greedy-baby': ['app/greedy-baby', 'lib/greedy-baby-phaser'],
  greedylion: ['app/greedylion', 'lib/greedy-king-phaser'],
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(p);
    return /\.(tsx?|jsx?|css)$/.test(d.name) ? [p] : [];
  });
}
const SOURCES = ['app', 'lib', 'components']
  .flatMap(walk)
  .filter((f) => !f.endsWith('manifest.generated.ts'))
  .map((f) => [f, fs.readFileSync(f, 'utf8')]);

function usedOnlyBy(file, game) {
  const stem = path.basename(file).replace(/\.(webp|png|jpe?g)$/, '');
  const dirs = GAME_DIRS[game] ?? [];
  const hits = SOURCES.filter(([, src]) => src.includes(`/${stem}.`)).map(([f]) => f);
  return hits.length > 0 && hits.every((f) => dirs.some((d) => f.startsWith(d + '/')));
}

/** Pixel width needed so every use is sharp at DPR 3. */
function targetWidth(entry, w, h) {
  const ar = w / h;
  let need = 0;
  for (const mode of entry.modes) {
    const [kind, size = ''] = mode.split(':');
    const s = size.trim();
    if (kind === 'bg' && s === 'contain') {
      need = Math.max(need, Math.min(entry.needW, entry.needH * ar)); // fits inside
    } else {
      // img (fill), bg cover, bg 100% 100%, explicit sizes: both axes must be covered
      need = Math.max(need, entry.needW, entry.needH * ar);
    }
  }
  return Math.min(w, Math.ceil(need * DPR));
}

const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
let before = 0;
let after = 0;
let memBefore = 0;
let memAfter = 0;
for (const [url, entry] of Object.entries(plan)) {
  const file = path.join('public', url);
  if (!fs.existsSync(file)) continue;
  if (!usedOnlyBy(url, entry.game)) {
    console.log(`· ${url.padEnd(58)} shared/unknown usage — skipped`);
    continue;
  }
  const input = fs.readFileSync(file);
  const meta = await sharp(input).metadata();
  const tw = targetWidth(entry, meta.width, meta.height);
  if (tw >= meta.width * MAX_RATIO) continue;

  const { data, info } = await sharp(input)
    .resize({ width: tw, kernel: 'lanczos3' })
    .webp({ quality: 88, alphaQuality: 95, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  if (!/\.webp$/i.test(file)) continue; // keep format/URL stable

  before += input.length;
  after += data.length;
  memBefore += meta.width * meta.height * 4;
  memAfter += info.width * info.height * 4;
  console.log(
    `✔ ${url.padEnd(58)} ${`${meta.width}x${meta.height}`.padEnd(10)} → ${`${info.width}x${info.height}`.padEnd(9)} ` +
      `${Math.round(input.length / 1024)}K → ${Math.round(data.length / 1024)}K  (shown ${entry.needW}x${entry.needH} ${entry.modes.join('|')})`,
  );
  if (WRITE) fs.writeFileSync(file, data);
}
console.log(
  `\n${WRITE ? 'wrote' : 'would write'}: files ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB · ` +
    `decoded RAM ${(memBefore / 1048576).toFixed(0)} MB → ${(memAfter / 1048576).toFixed(0)} MB` +
    (WRITE ? '' : '  (dry run — add --write)'),
);
