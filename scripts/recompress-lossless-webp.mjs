#!/usr/bin/env node
/**
 * Re-encode LOSSLESS WebP files in public/ as high-quality lossy WebP,
 * keeping exact pixel dimensions.
 *
 * Why dimensions never change: Phaser scenes often size art via setScale(),
 * which depends on the texture's native size — resizing would move/resize
 * things on screen. Same width×height ⇒ zero layout risk; only bytes drop.
 *
 * Already-lossy files are skipped (re-encoding would only add generation loss),
 * as are animated WebPs and anything that wouldn't shrink by ≥15%.
 *
 *   node scripts/recompress-lossless-webp.mjs          # dry run (default)
 *   node scripts/recompress-lossless-webp.mjs --write
 *   node scripts/recompress-lossless-webp.mjs --write --games=lucky77,football
 *     (only files the given routes use — from lib/warmup/manifest.generated.ts)
 *
 * Originals stay in git: `git checkout -- public/<file>` restores one.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const WRITE = process.argv.includes('--write');
const GAMES = process.argv
  .find((a) => a.startsWith('--games='))
  ?.slice('--games='.length)
  .split(',')
  .map((g) => g.trim())
  .filter(Boolean);

/** Files used by the selected game routes (generated manifest). */
function gameFiles(games) {
  const src = fs.readFileSync('lib/warmup/manifest.generated.ts', 'utf8');
  const all = JSON.parse(src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1));
  const set = new Set();
  for (const g of games) {
    if (!all[g]) throw new Error(`unknown game route: ${g}`);
    for (const a of all[g].assets) {
      const p = path.join(PUBLIC, a.split('?')[0]);
      set.add(p);
      // Legacy .png/.jpg URLs are served from the .webp via next.config rewrites.
      set.add(p.replace(/\.(png|jpe?g)$/i, '.webp'));
    }
  }
  return set;
}
const PUBLIC = path.resolve('public');
const MIN_SAVING = 0.15;
const ENCODE = { quality: 88, alphaQuality: 95, effort: 6, smartSubsample: true };

/** RIFF/WEBP container: true if the image bitstream is VP8L (lossless). */
function isLosslessWebp(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return false;
  }
  let off = 12;
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (fourcc === 'VP8L') return true;
    if (fourcc === 'VP8 ') return false;
    if (fourcc === 'ANIM') return false; // animated — leave alone
    off += 8 + size + (size & 1);
  }
  return false;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.webp') ? [p] : [];
  });
}

let scanned = 0;
let lossless = 0;
let changed = 0;
let before = 0;
let after = 0;
const rows = [];

const only = GAMES ? gameFiles(GAMES) : null;
for (const file of walk(PUBLIC)) {
  if (only && !only.has(file)) continue;
  scanned++;
  const input = fs.readFileSync(file);
  if (!isLosslessWebp(input)) continue;
  lossless++;

  const meta = await sharp(input).metadata();
  if ((meta.pages ?? 1) > 1) continue;

  const { data, info } = await sharp(input)
    .webp(ENCODE)
    .toBuffer({ resolveWithObject: true });
  if (info.width !== meta.width || info.height !== meta.height) {
    throw new Error(`dimension change on ${file}`); // must never happen
  }
  if (data.length > input.length * (1 - MIN_SAVING)) continue;

  changed++;
  before += input.length;
  after += data.length;
  rows.push([path.relative(PUBLIC, file), meta.width, meta.height, input.length, data.length]);
  if (WRITE) fs.writeFileSync(file, data);
}

rows.sort((a, b) => b[3] - b[4] - (a[3] - a[4]));
for (const [f, w, h, a, b] of rows.slice(0, 25)) {
  console.log(
    `${f.padEnd(48)} ${`${w}x${h}`.padEnd(10)} ${String(Math.round(a / 1024)).padStart(6)}K → ${String(Math.round(b / 1024)).padStart(5)}K`,
  );
}
if (rows.length > 25) console.log(`… and ${rows.length - 25} more`);
console.log(
  `\nscanned ${scanned} webp · lossless ${lossless} · ${WRITE ? 'rewrote' : 'would rewrite'} ${changed}` +
    ` · ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB` +
    (WRITE ? '' : '  (dry run — add --write)'),
);
