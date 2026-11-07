import fs from "fs";
import path from "path";
import sharp from "sharp";

const SRC =
  process.argv[2] ||
  String.raw`C:\Users\dell\.cursor\projects\d-game\assets\c__Users_dell_AppData_Roaming_Cursor_User_workspaceStorage_154057737849629030959360261a0f4e_images_WhatsApp_Image_2026-11-01_at_10.54.11_PM-ccb62a7b-5bab-412d-9570-a0593f806614.jpg`;

const OUT_DIR = path.resolve("public/euro-roulette");
const OUT_WEBP = path.join(OUT_DIR, "wheel.webp");
const OUT_PNG = path.join(OUT_DIR, "wheel-circle.png");
const BACKUP = path.join(OUT_DIR, "wheel-old.webp");

function isFelt(r, g, b) {
  // Casino green felt + near-black padding
  const greenFelt = g > r + 20 && g > b + 10 && g > 40 && g < 160 && r < 90;
  const darkPad = r < 35 && g < 45 && b < 35;
  return greenFelt || darkPad;
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Source missing: ${SRC}`);
  if (fs.existsSync(OUT_WEBP) && !fs.existsSync(BACKUP)) {
    fs.copyFileSync(OUT_WEBP, BACKUP);
    console.log("backed up old wheel → wheel-old.webp");
  }

  const img = sharp(SRC).ensureAlpha().rotate(); // honor EXIF
  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log("source", width, height, channels);

  // Find non-felt bbox
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isFelt(r, g, b)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < 1000) throw new Error("Could not find wheel content");

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  // Slight inset so gold rim stays inside; keep circular
  const radius = Math.min(bw, bh) / 2 - 2;
  const size = Math.ceil(radius * 2);
  const left = Math.round(cx - radius);
  const top = Math.round(cy - radius);

  console.log({ minX, minY, maxX, maxY, cx, cy, radius: Math.round(radius), size });

  // Crop square around wheel
  const cropped = await sharp(SRC)
    .rotate()
    .extract({
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.min(size, width - Math.max(0, left)),
      height: Math.min(size, height - Math.max(0, top)),
    })
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = cropped.info.width;
  const h = cropped.info.height;
  const ch = cropped.info.channels;
  const px = Buffer.from(cropped.data);
  const rMask = w / 2 - 0.5;
  const mcx = (w - 1) / 2;
  const mcy = (h - 1) / 2;

  // Soft circular alpha + kill residual felt outside rim
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const dx = x - mcx;
      const dy = y - mcy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let a = 255;
      if (dist > rMask) a = 0;
      else if (dist > rMask - 1.5) a = Math.round(255 * (rMask - dist) / 1.5);

      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      // Soften leftover green near edge
      if (a > 0 && dist > rMask * 0.92 && isFelt(r, g, b)) {
        a = Math.min(a, 0);
      }
      px[i + 3] = a;
    }
  }

  const outBuf = await sharp(px, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp(outBuf).png().toFile(OUT_PNG);
  await sharp(outBuf).webp({ quality: 92, alphaQuality: 100 }).toFile(OUT_WEBP);

  console.log("wrote", OUT_PNG);
  console.log("wrote", OUT_WEBP, `(${w}x${h})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
