import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicRoot = path.resolve('public');

function walk(dir, pred, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, pred, out);
    else if (pred(ent.name, p)) out.push(p);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeRemove(file) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.unlinkSync(file);
      return true;
    } catch {
      await sleep(150 * (i + 1));
    }
  }
  return false;
}

const pngNamed = walk(publicRoot, (name) => /\.png$/i.test(name));
let done = 0;
let pngLeft = 0;
const errors = [];

for (const png of pngNamed) {
  const webpPath = png.replace(/\.png$/i, '.webp');
  try {
    const meta = await sharp(png).metadata();
    if (meta.format === 'webp') {
      // Already webp bytes with .png name — copy out then remove png
      fs.copyFileSync(png, webpPath);
    } else if (meta.format === 'png' || meta.format === 'jpeg') {
      const tmp = webpPath + '.tmp';
      await sharp(png).webp({ lossless: true, effort: 4 }).toFile(tmp);
      fs.renameSync(tmp, webpPath);
    } else {
      // Unknown — still try lossless via sharp decode
      const tmp = webpPath + '.tmp';
      await sharp(png).webp({ lossless: true, effort: 4 }).toFile(tmp);
      fs.renameSync(tmp, webpPath);
    }
    const removed = await safeRemove(png);
    if (!removed) pngLeft += 1;
    done += 1;
    if (done % 25 === 0) console.log('progress', done, '/', pngNamed.length);
  } catch (e) {
    errors.push(`${path.relative(publicRoot, png)}: ${e.message}`);
  }
}

console.log(
  JSON.stringify(
    {
      done,
      pngLeftLocked: pngLeft,
      remainingPng: walk(publicRoot, (n) => /\.png$/i.test(n)).length,
      webpCount: walk(publicRoot, (n) => /\.webp$/i.test(n)).length,
      errors: errors.slice(0, 20),
    },
    null,
    2,
  ),
);

// Regenerate rewrites
const webps = walk(publicRoot, (name) => /\.webp$/i.test(name));
const rewrites = [];
for (const webp of webps) {
  const rel = path.relative(publicRoot, webp).split(path.sep).join('/');
  const base = rel.replace(/\.webp$/i, '');
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    rewrites.push({ source: `/${base}${ext}`, destination: `/${rel}` });
  }
}
rewrites.sort((a, b) => a.source.localeCompare(b.source));
const seen = new Set();
const unique = [];
for (const r of rewrites) {
  if (seen.has(r.source)) continue;
  seen.add(r.source);
  unique.push(r);
}
const lines = unique.map(
  (r) =>
    `  { source: ${JSON.stringify(r.source)}, destination: ${JSON.stringify(r.destination)} },`,
);
fs.writeFileSync(
  'webp-rewrites.generated.ts',
  `/** Auto-generated: PNG/JPG → WebP compatibility rewrites for legacy URLs. */
export const webpRewrites: { source: string; destination: string }[] = [
${lines.join('\n')}
];
`,
);
console.log('rewrites', unique.length);

// Update code refs
const codeRoots = ['app', 'lib', 'components'].filter((d) => fs.existsSync(d));
const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs']);
let replacements = 0;
const filesChanged = [];
for (const root of codeRoots) {
  const files = walk(root, (name) => codeExts.has(path.extname(name)));
  for (const file of files) {
    let text = fs.readFileSync(file, 'utf8');
    const orig = text;
    text = text.replace(
      /(['"`])(\/[^'"`]*?)\.png(\?[^'"`]*)?(['"`])/gi,
      (m, a, mid, q, b) => {
        const rel = mid.replace(/^\/+/, '');
        if (fs.existsSync(path.join(publicRoot, `${rel}.webp`))) {
          replacements += 1;
          return `${a}${mid}.webp${q || ''}${b}`;
        }
        return m;
      },
    );
    // url(/path.png) without quotes
    text = text.replace(
      /(url\(\s*)(\/[^)'"]+?)\.png(\?[^)]*)?(\s*\))/gi,
      (m, a, mid, q, b) => {
        const rel = mid.replace(/^\/+/, '');
        if (fs.existsSync(path.join(publicRoot, `${rel}.webp`))) {
          replacements += 1;
          return `${a}${mid}.webp${q || ''}${b}`;
        }
        return m;
      },
    );
    if (text !== orig) {
      fs.writeFileSync(file, text);
      filesChanged.push(path.relative(process.cwd(), file));
    }
  }
}
console.log('code_files_changed', filesChanged.length, 'replacements', replacements);
console.log(filesChanged.join('\n'));
