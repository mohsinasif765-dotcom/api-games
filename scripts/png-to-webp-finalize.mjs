import fs from 'fs';
import path from 'path';

const publicRoot = path.resolve('public');

function walk(dir, pred, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, pred, out);
    else if (pred(ent.name, p)) out.push(p);
  }
  return out;
}

const webps = walk(publicRoot, (name) => /\.webp$/i.test(name));
const rewrites = [];
for (const webp of webps) {
  const rel = path.relative(publicRoot, webp).split(path.sep).join('/');
  const base = rel.replace(/\.webp$/i, '');
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    rewrites.push({
      source: `/${base}${ext}`,
      destination: `/${rel}`,
    });
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
const ts = `/** Auto-generated: PNG/JPG → WebP compatibility rewrites for legacy URLs. */
export const webpRewrites: { source: string; destination: string }[] = [
${lines.join('\n')}
];
`;
fs.writeFileSync('webp-rewrites.generated.ts', ts);
console.log('rewrites', unique.length);

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
      /(['"`(/])([^'"`)\s]*?)\.png(\?[^'"`)]*)?(['"`)])/gi,
      (m, a, mid, q, b) => {
        const rel = mid.replace(/^\/+/, '');
        const webpPath = path.join(publicRoot, `${rel}.webp`);
        if (fs.existsSync(webpPath)) {
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

let deleted = 0;
const pngs = walk(publicRoot, (name) => /\.png$/i.test(name));
for (const png of pngs) {
  const webp = png.replace(/\.png$/i, '.webp');
  if (fs.existsSync(webp)) {
    fs.unlinkSync(png);
    deleted += 1;
  }
}
const remaining = walk(publicRoot, (name) => /\.png$/i.test(name)).length;
console.log('deleted_png', deleted, 'remaining_png', remaining);
console.log('changed_files_sample', filesChanged.slice(0, 40));
