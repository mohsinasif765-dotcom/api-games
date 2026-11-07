import fs from "fs";
import sharp from "sharp";

const SRC = "public/euro-roulette/Image copy.png";
const OUT_WEBP = "public/euro-roulette/wheel.webp";
const OUT_PNG = "public/euro-roulette/wheel-circle.png";

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: w, height: h, channels: ch } = info;

function isOpaque(i) {
  return data[i + 3] > 40;
}
function isGold(r, g, b) {
  return r > 130 && g > 90 && b < 140 && r > g && g >= b - 20;
}
function isWood(r, g, b) {
  // light/mid brown wood bowl
  return r > 90 && g > 60 && b < 100 && r > b + 20 && Math.abs(r - g) < 50;
}

// 1) Approximate content center from opaque bbox
let minX = w,
  minY = h,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (!isOpaque(i)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}
let cx = (minX + maxX) / 2;
let cy = (minY + maxY) / 2;

// 2) Refine using gold rim outer samples (farthest gold per angle bucket)
const buckets = new Array(72).fill(null);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (!isOpaque(i)) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!isGold(r, g, b)) continue;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < Math.min(w, h) * 0.28) continue; // skip spindle
    let ang = Math.atan2(dy, dx);
    let bi = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 72) % 72;
    if (!buckets[bi] || dist > buckets[bi].dist) {
      buckets[bi] = { x, y, dist };
    }
  }
}
const rim = buckets.filter(Boolean);
if (rim.length >= 24) {
  // Algebraic circle fit (Taubin-ish simplified): average of rim points as center, iterate
  let ncx = rim.reduce((s, p) => s + p.x, 0) / rim.length;
  let ncy = rim.reduce((s, p) => s + p.y, 0) / rim.length;
  for (let iter = 0; iter < 8; iter++) {
    let sx = 0,
      sy = 0,
      sr = 0;
    for (const p of rim) {
      const d = Math.hypot(p.x - ncx, p.y - ncy) || 1;
      sx += (p.x - ncx) / d;
      sy += (p.y - ncy) / d;
      sr += d;
    }
    const meanR = sr / rim.length;
    ncx += (sx / rim.length) * 0.5;
    ncy += (sy / rim.length) * 0.5;
    // pull toward mean radius consistency
    void meanR;
  }
  cx = ncx;
  cy = ncy;
}

// 3) Radius = max opaque distance from refined center, slight inset
let maxR = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (!isOpaque(i)) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (d > maxR) maxR = d;
  }
}
const radius = Math.max(8, maxR - 1);
const size = Math.ceil(radius * 2);
const outSize = Math.max(size, 512); // sharp display size

console.log({
  bbox: [minX, minY, maxX, maxY],
  center: [cx.toFixed(2), cy.toFixed(2)],
  offsetFromImgCenter: [(cx - w / 2).toFixed(2), (cy - h / 2).toFixed(2)],
  radius: radius.toFixed(1),
  outSize,
});

// 4) Render centered: paste source shifted so (cx,cy) → (outSize/2, outSize/2)
const left = Math.round(cx - radius);
const top = Math.round(cy - radius);
const extractW = Math.min(Math.ceil(radius * 2), w - Math.max(0, left));
const extractH = Math.min(Math.ceil(radius * 2), h - Math.max(0, top));

const extracted = await sharp(SRC)
  .ensureAlpha()
  .extract({
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: extractW,
    height: extractH,
  })
  .resize(outSize, outSize, { fit: "fill", kernel: "lanczos3" })
  .raw()
  .toBuffer({ resolveWithObject: true });

const ow = extracted.info.width;
const oh = extracted.info.height;
const och = extracted.info.channels;
const px = Buffer.from(extracted.data);
const mcx = (ow - 1) / 2;
const mcy = (oh - 1) / 2;
const rMask = Math.min(ow, oh) / 2 - 0.5;

for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const i = (y * ow + x) * och;
    const dist = Math.hypot(x - mcx, y - mcy);
    let a = px[i + 3];
    if (dist > rMask) a = 0;
    else if (dist > rMask - 2) a = Math.min(a, Math.round((255 * (rMask - dist)) / 2));
    // kill leftover black near edge
    if (a > 0 && dist > rMask * 0.97) {
      const r = px[i],
        g = px[i + 1],
        b = px[i + 2];
      if (r < 20 && g < 20 && b < 20) a = 0;
    }
    px[i + 3] = a;
  }
}

const pngBuf = await sharp(px, {
  raw: { width: ow, height: oh, channels: 4 },
}).png().toBuffer();

fs.writeFileSync(OUT_PNG, pngBuf);
await sharp(pngBuf).webp({ quality: 95, alphaQuality: 100 }).toFile(OUT_WEBP);

// verify new centroid
{
  const v = await sharp(OUT_WEBP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sx = 0,
    sy = 0,
    sw = 0;
  for (let y = 0; y < v.info.height; y++) {
    for (let x = 0; x < v.info.width; x++) {
      const i = (y * v.info.width + x) * v.info.channels;
      const a = v.data[i + 3];
      if (a < 40) continue;
      const r = v.data[i],
        g = v.data[i + 1],
        b = v.data[i + 2];
      if (!(r > 130 && g > 90 && b < 140 && r > g)) continue;
      const dist = Math.hypot(x - v.info.width / 2, y - v.info.height / 2);
      if (dist < v.info.width * 0.28) continue;
      sx += x;
      sy += y;
      sw++;
    }
  }
  if (sw) {
    console.log("verify rim avg", (sx / sw).toFixed(1), (sy / sw).toFixed(1), "center", v.info.width / 2);
  }
}

console.log("wrote", OUT_WEBP, OUT_PNG);
