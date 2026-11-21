#!/usr/bin/env node
/**
 * Generate lib/warmup/manifest.generated.ts — the runtime files (images,
 * sounds, data) each game route loads that are NOT discoverable from its HTML
 * or CSS (Phaser preloads, popups, sounds).
 *
 * For every game route in app/<route>/ it follows imports (static + dynamic,
 * `@/…` and relative) through the project source and collects:
 *   - string literals that are public asset paths ("/foo/bar.webp?v=2")
 *   - bare sound names ('win.mp3') that the controllers play from /sounds/
 * and keeps only paths that exist in public/ (or are served via a WebP rewrite).
 *
 * Runs automatically before `next build` (package.json "prebuild"), so the
 * warm-up list can't drift from the code.
 *
 *   node scripts/gen-warmup-manifest.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'app');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'lib/warmup/manifest.generated.ts');
const NON_GAME_ROUTES = new Set(['api', 'warmup']);
const SRC_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const STYLE_EXT = ['.css'];
const CHECK = process.argv.includes('--check');

const ASSET_RE =
  /['"`](\/[A-Za-z0-9_\-./~]+\.(?:webp|png|jpe?g|gif|svg|mp3|ogg|wav|m4a|json|woff2?))(\?[A-Za-z0-9_=&.-]*)?['"`]/g;
const CSS_URL_RE = /url\(\s*['"]?(\/[^'")?]+\.(?:webp|png|jpe?g|gif|svg))(\?[^'")]*)?['"]?\s*\)/g;
/** `/dir/${name}` template prefixes, combined with bare 'file.ext' literals in the same file. */
const TEMPLATE_PREFIX_RE = /`(\/[A-Za-z0-9_\-./]*\/)\$\{/g;
const BARE_FILE_RE = /['"`]([A-Za-z0-9_\-.]+\.(?:webp|png|jpe?g|gif|svg|mp3|ogg|wav))['"`]/g;
const BARE_SOUND_RE = /['"`]([A-Za-z0-9_-]+\.(?:mp3|ogg|wav))['"`]/g;
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

// Rewrites: legacy .png/.jpg URLs served from a .webp file.
const rewriteSources = new Set(
  [...fs
    .readFileSync(path.join(ROOT, 'webp-rewrites.generated.ts'), 'utf8')
    .matchAll(/source:\s*"([^"]+)"/g)].map((m) => m[1]),
);

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // package
  const candidates = [
    base,
    ...SRC_EXT.map((e) => base + e),
    ...SRC_EXT.map((e) => path.join(base, 'index' + e)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p) : [p];
  });
}

const publicExists = (urlPath) => {
  const p = urlPath.split('?')[0];
  return fs.existsSync(path.join(PUBLIC, p)) || rewriteSources.has(p);
};

function scanRoute(route) {
  const entry = [
    ...listFiles(path.join(APP, route)).filter((f) =>
      [...SRC_EXT, ...STYLE_EXT].includes(path.extname(f)),
    ),
    path.join(APP, 'globals.css'),
  ].filter((f) => fs.existsSync(f));
  const seen = new Set();
  const stack = [...entry];
  const assets = new Set();
  const missing = new Set();

  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');

    if (STYLE_EXT.includes(path.extname(file))) {
      for (const m of src.matchAll(CSS_URL_RE)) {
        const url = m[1] + (m[2] ?? '');
        (publicExists(url) ? assets : missing).add(url);
      }
      continue;
    }

    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      const resolved = resolveImport(spec, file);
      if (resolved && !resolved.includes('node_modules')) stack.push(resolved);
    }
    for (const m of src.matchAll(ASSET_RE)) {
      const url = m[1] + (m[2] ?? '');
      (publicExists(url) ? assets : missing).add(url);
    }
    const prefixes = new Set([...src.matchAll(TEMPLATE_PREFIX_RE)].map((m) => m[1]));
    if (prefixes.size) {
      for (const m of src.matchAll(BARE_FILE_RE)) {
        for (const prefix of prefixes) {
          const url = prefix + m[1];
          if (publicExists(url)) assets.add(url);
        }
      }
    }
    for (const m of src.matchAll(BARE_SOUND_RE)) {
      const url = `/sounds/${m[1]}`;
      if (publicExists(url)) assets.add(url);
    }
  }
  return { assets: [...assets].sort(), missing: [...missing].sort(), files: seen.size };
}

const routes = fs
  .readdirSync(APP, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !NON_GAME_ROUTES.has(d.name))
  .filter((d) => fs.existsSync(path.join(APP, d.name, 'page.tsx')))
  .map((d) => d.name)
  .sort();

const games = {};
for (const route of routes) {
  const { assets, missing, files } = scanRoute(route);
  games[route] = { path: `/${route}`, assets };
  const bytes = assets.reduce((n, a) => {
    const f = path.join(PUBLIC, a.split('?')[0]);
    return n + (fs.existsSync(f) ? fs.statSync(f).size : 0);
  }, 0);
  console.log(
    `${route.padEnd(16)} files=${String(files).padStart(3)} assets=${String(assets.length).padStart(3)} ` +
      `${(bytes / 1048576).toFixed(2)}MB` +
      (missing.length ? `  (ignored ${missing.length} missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})` : ''),
  );
}

const body =
  `// Generated by scripts/gen-warmup-manifest.mjs — do not edit.\n` +
  `// Runtime assets per game route (not discoverable from page HTML/CSS).\n` +
  `export const GENERATED_WARMUP_GAMES: Record<string, { path: string; assets: readonly string[] }> = ${JSON.stringify(games, null, 2)};\n`;

const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (CHECK) {
  if (current !== body) {
    console.error('✖ manifest.generated.ts is stale — run node scripts/gen-warmup-manifest.mjs');
    process.exit(1);
  }
  console.log('✔ manifest up to date');
} else if (current !== body) {
  fs.writeFileSync(OUT, body);
  console.log(`✔ wrote ${path.relative(ROOT, OUT)}`);
} else {
  console.log('✔ manifest unchanged');
}
