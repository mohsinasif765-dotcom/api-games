/**
 * Use Image copy.png as-is (same number style), only:
 * - straighten so 0 is at top
 * - perfect circular center + transparent trim
 * - light sharpen so baked numbers read clearer
 * NO redrawn / overlay numbers.
 */
import fs from "fs";
import sharp from "sharp";

const SRC = "public/euro-roulette/Image copy.png";
const OUT_WEBP = "public/euro-roulette/wheel.webp";
const OUT_PNG = "public/euro-roulette/wheel-circle.png";
const SIZE = 1200;

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

function at(x, y) {
  const i = (Math.round(y) * w + Math.round(x)) * ch;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}
function isGreen(r, g, b, a) {
  return a > 40 && g > r + 25 && g > b + 15 && g > 70 && r < 120;
}
function isGold(r, g, b, a) {
  return a > 40 && r > 130 && g > 90 && b < 140 && r > g;
}

let minX = w,
  minY = h,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < 40 || (r < 18 && g < 18 && b < 18)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}
let cx = (minX + maxX) / 2;
let cy = (minY + maxY) / 2;
const roughR = Math.min(maxX - minX, maxY - minY) / 2;

let gX = 0,
  gY = 0,
  gN = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const [r, g, b, a] = at(x, y);
    if (!isGreen(r, g, b, a)) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (d < roughR * 0.62 || d > roughR * 0.98) continue;
    gX += x;
    gY += y;
    gN++;
  }
}
const greenAngle = Math.atan2(gY / gN - cy, gX / gN - cx);
const rotateDeg = ((-Math.PI / 2 - greenAngle) * 180) / Math.PI;

const diag = Math.ceil(Math.hypot(w, h));
const rotated = await sharp(SRC)
  .ensureAlpha()
  .extend({
    top: Math.ceil((diag - h) / 2),
    bottom: Math.floor((diag - h) / 2),
    left: Math.ceil((diag - w) / 2),
    right: Math.floor((diag - w) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .rotate(rotateDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .raw()
  .toBuffer({ resolveWithObject: true });

const rw = rotated.info.width;
const rh = rotated.info.height;
const rch = rotated.info.channels;
const rd = rotated.data;
function rat(x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= rw || y >= rh) return [0, 0, 0, 0];
  const i = (y * rw + x) * rch;
  return [rd[i], rd[i + 1], rd[i + 2], rd[i + 3]];
}

const buckets = new Array(96).fill(null);
const rcx0 = rw / 2;
const rcy0 = rh / 2;
for (let y = 0; y < rh; y++) {
  for (let x = 0; x < rw; x++) {
    const [r, g, b, a] = rat(x, y);
    if (!isGold(r, g, b, a)) continue;
    const dx = x - rcx0;
    const dy = y - rcy0;
    const dist = Math.hypot(dx, dy);
    if (dist < Math.min(rw, rh) * 0.2) continue;
    const bi =
      Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 96) % 96;
    if (!buckets[bi] || dist > buckets[bi].dist) buckets[bi] = { x, y, dist };
  }
}
const rim = buckets.filter(Boolean);
let ncx = rim.reduce((s, p) => s + p.x, 0) / rim.length;
let ncy = rim.reduce((s, p) => s + p.y, 0) / rim.length;
for (let iter = 0; iter < 10; iter++) {
  let sx = 0,
    sy = 0;
  for (const p of rim) {
    const d = Math.hypot(p.x - ncx, p.y - ncy) || 1;
    sx += (p.x - ncx) / d;
    sy += (p.y - ncy) / d;
  }
  ncx += (sx / rim.length) * 0.45;
  ncy += (sy / rim.length) * 0.45;
}
let maxR = 0;
for (const p of rim) maxR = Math.max(maxR, Math.hypot(p.x - ncx, p.y - ncy));
maxR += 2;

const left = Math.round(ncx - maxR);
const top = Math.round(ncy - maxR);
const side = Math.ceil(maxR * 2);

let out = await sharp(rd, {
  raw: { width: rw, height: rh, channels: rch },
})
  .extract({
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.min(side, rw - Math.max(0, left)),
    height: Math.min(side, rh - Math.max(0, top)),
  })
  .resize(SIZE, SIZE, { fit: "fill", kernel: "lanczos3" })
  // mild clarity only — keep original number look
  .sharpen({ sigma: 1.35, m1: 1.1, m2: 0.55 })
  .modulate({ brightness: 1.03, saturation: 1.05 })
  .png()
  .toBuffer();

{
  const m = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = m.data;
  const mcx = (SIZE - 1) / 2;
  const mcy = (SIZE - 1) / 2;
  const rMask = SIZE / 2 - 1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const dist = Math.hypot(x - mcx, y - mcy);
      let a = px[i + 3];
      if (dist > rMask) a = 0;
      else if (dist > rMask - 2)
        a = Math.min(a, Math.round((255 * (rMask - dist)) / 2));
      px[i + 3] = a;
    }
  }
  out = await sharp(px, {
    raw: { width: SIZE, height: SIZE, channels: 4 },
  })
    .png()
    .toBuffer();
}

fs.writeFileSync(OUT_PNG, out);
await sharp(out).webp({ quality: 96, alphaQuality: 100 }).toFile(OUT_WEBP);
console.log("ok original-style numbers, sharpened only", {
  rotateDeg: rotateDeg.toFixed(3),
});
