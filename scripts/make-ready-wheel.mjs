/**
 * Only builds a transparent circular trimmed image.
 * Does not change game code.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const candidates = [
  path.resolve(
    "C:/Users/dell/.cursor/projects/d-game/assets/c__Users_dell_AppData_Roaming_Cursor_User_workspaceStorage_154057737849629030959360261a0f4e_images_image-5892c575-be70-4855-935d-37b2a5ddacc7.png",
  ),
  path.resolve("public/euro-roulette/Image copy.png"),
  path.resolve("public/euro-roulette/image.png"),
];

const SRC = candidates.find((p) => fs.existsSync(p));
if (!SRC) throw new Error("No source image found");

const OUT_PNG = path.resolve("public/euro-roulette/wheel-ready.png");
const OUT_WEBP = path.resolve("public/euro-roulette/wheel-ready.webp");

console.log("source:", SRC);

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

function isBg(r, g, b, a) {
  if (a < 20) return true;
  if (r < 22 && g < 22 && b < 22) return true;
  return false;
}

let minX = w,
  minY = h,
  maxX = 0,
  maxY = 0,
  count = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (isBg(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    count++;
  }
}

const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const radius = Math.min(maxX - minX, maxY - minY) / 2 - 1;
const size = Math.ceil(radius * 2);
const left = Math.round(cx - radius);
const top = Math.round(cy - radius);

console.log({
  count,
  cx: cx.toFixed(1),
  cy: cy.toFixed(1),
  radius: Math.round(radius),
  size,
});

const cropped = await sharp(SRC)
  .ensureAlpha()
  .extract({
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.min(size, w - Math.max(0, left)),
    height: Math.min(size, h - Math.max(0, top)),
  })
  .resize(size, size, { fit: "fill" })
  .raw()
  .toBuffer({ resolveWithObject: true });

const ow = cropped.info.width;
const oh = cropped.info.height;
const och = cropped.info.channels;
const px = Buffer.from(cropped.data);
const mcx = (ow - 1) / 2;
const mcy = (oh - 1) / 2;
const rMask = ow / 2 - 0.5;

for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const i = (y * ow + x) * och;
    const dist = Math.hypot(x - mcx, y - mcy);
    let a = px[i + 3];
    if (dist > rMask) a = 0;
    else if (dist > rMask - 1.5)
      a = Math.min(a, Math.round((255 * (rMask - dist)) / 1.5));
    if (
      a > 0 &&
      dist > rMask * 0.96 &&
      px[i] < 20 &&
      px[i + 1] < 20 &&
      px[i + 2] < 20
    ) {
      a = 0;
    }
    px[i + 3] = a;
  }
}

const outSize = Math.max(size, 1024);
const pngBuf = await sharp(px, {
  raw: { width: ow, height: oh, channels: 4 },
})
  .resize(outSize, outSize, { kernel: "lanczos3" })
  .png()
  .toBuffer();

fs.writeFileSync(OUT_PNG, pngBuf);
await sharp(pngBuf).webp({ quality: 96, alphaQuality: 100 }).toFile(OUT_WEBP);

const m = await sharp(OUT_PNG).metadata();
console.log(
  "wrote",
  OUT_PNG,
  "and",
  OUT_WEBP,
  `${m.width}x${m.height}`,
  "alpha=",
  m.hasAlpha,
);
