import { WARMUP_GAMES } from './manifest';

/**
 * Fill the WebView HTTP cache with everything a game needs, without running
 * the game (no auth, no /boot, no socket). Android WebView / WKWebView share
 * one HTTP cache per app, so a hidden warm-up WebView makes the player's first
 * real open behave like a repeat visit.
 *
 * Built to be invisible on low-end phones: games are warmed one at a time,
 * 2 downloads at once, low fetch priority, bodies are streamed and dropped
 * (nothing is decoded or kept in memory), and it does nothing on 2G or when
 * the OS data saver is on.
 */

export type WarmupResult = {
  ok: boolean;
  /** Set when warm-up deliberately did nothing (data saver, 2G…). */
  skipped?: string;
  games: string[];
  total: number;
  loaded: number;
  failed: number;
  /** Already cached before this run (no bytes on the wire). */
  fromCache: number;
  /** Bytes actually transferred. */
  bytes: number;
  ms: number;
};

type Options = {
  concurrency?: number;
  timeoutMs?: number;
  /** Ignore the data-saver / slow-network checks. */
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
};

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
/** Turbopack/webpack lazy chunk references inside JS. */
const CHUNK_RE = /["'](static\/chunks\/[A-Za-z0-9_~.\-/]+\.(?:js|css))["']/g;
const MAX_CHUNK_DEPTH = 3;

function sameOrigin(raw: string, base: string): string | null {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  try {
    const u = new URL(raw, base);
    return u.origin === location.origin ? u.href : null;
  } catch {
    return null;
  }
}

async function request(url: string, timeoutMs: number, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return {
      res: await fetch(url, {
        credentials: 'same-origin',
        signal: ctrl.signal,
        // Don't compete with anything the user is actually doing.
        ...({ priority: 'low' } as RequestInit),
        ...init,
      }),
      done: () => clearTimeout(timer),
    };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Download fully (so it is stored in the HTTP cache) without buffering it. */
async function warmOne(url: string, timeoutMs: number): Promise<boolean> {
  const { res, done } = await request(url, timeoutMs);
  try {
    const reader = res.body?.getReader();
    if (reader) while (!(await reader.read()).done) { /* drop chunk */ }
    return res.ok;
  } finally {
    done();
  }
}

async function fetchText(url: string, timeoutMs: number, init?: RequestInit) {
  const { res, done } = await request(url, timeoutMs, init);
  try {
    return await res.text();
  } finally {
    done();
  }
}

/**
 * Everything a game page needs that the browser would fetch: HTML scripts,
 * styles, preloads, images; url(...) inside its CSS; and lazily imported JS
 * chunks referenced from its scripts (e.g. Phaser), with the same ?dpl=
 * suffix the runtime uses so cache keys match exactly.
 */
async function discoverFromPage(path: string, timeoutMs: number): Promise<string[]> {
  const pageUrl = new URL(path, location.origin).href;
  // Always fresh: chunk names change with every deployment.
  const html = await fetchText(pageUrl, timeoutMs, { cache: 'no-cache' });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const found = new Set<string>();
  const add = (raw: string | null, base = pageUrl) => {
    const u = raw ? sameOrigin(raw, base) : null;
    if (u) found.add(u);
  };

  doc.querySelectorAll('script[src]').forEach((el) => add(el.getAttribute('src')));
  doc
    .querySelectorAll('link[rel~="stylesheet"][href], link[rel="preload"][href], link[rel="modulepreload"][href]')
    .forEach((el) => add(el.getAttribute('href')));
  doc.querySelectorAll('img[src]').forEach((el) => add(el.getAttribute('src')));

  // The runtime loads lazy chunks with its own script's query (?dpl=…).
  const firstChunk = [...found].find((u) => u.includes('/_next/static/chunks/'));
  const suffix = firstChunk ? new URL(firstChunk).search : '';
  const nextBase = firstChunk ? firstChunk.slice(0, firstChunk.indexOf('static/chunks/')) : null;

  // CSS → images; JS → lazy chunks (breadth-first, bounded).
  let frontier = [...found];
  for (let depth = 0; depth <= MAX_CHUNK_DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    await Promise.all(
      frontier.map(async (u) => {
        const isCss = /\.css(\?|$)/.test(u);
        const isJs = /\.js(\?|$)/.test(u) && u.includes('/_next/static/chunks/');
        if (!isCss && !isJs) return;
        try {
          const text = await fetchText(u, timeoutMs);
          if (isCss) {
            for (const m of text.matchAll(CSS_URL_RE)) add(m[2], u);
          } else if (nextBase) {
            for (const m of text.matchAll(CHUNK_RE)) {
              const chunk = `${nextBase}${m[1]}${suffix}`;
              if (!found.has(chunk)) {
                found.add(chunk);
                next.push(chunk);
              }
            }
          }
        } catch {
          /* retried in the main pass */
        }
      }),
    );
    frontier = next;
  }
  return [...found];
}

function shouldSkip(): string | null {
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return 'save-data';
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
    return `slow-network (${conn.effectiveType})`;
  }
  return null;
}

export async function runWarmup(
  gameKeys: readonly string[],
  opts: Options = {},
): Promise<WarmupResult> {
  const started = performance.now();
  const concurrency = opts.concurrency ?? 2;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const games = (gameKeys.includes('all') ? Object.keys(WARMUP_GAMES) : gameKeys).filter(
    (k) => k in WARMUP_GAMES,
  );
  const result: WarmupResult = {
    ok: true,
    games,
    total: 0,
    loaded: 0,
    failed: 0,
    fromCache: 0,
    bytes: 0,
    ms: 0,
  };

  const skip = opts.force ? null : shouldSkip();
  if (skip) {
    result.skipped = skip;
    result.ms = Math.round(performance.now() - started);
    return result;
  }

  const all = new Set<string>();
  // One game at a time, in the order given (put the most likely game first).
  for (const key of games) {
    const game = WARMUP_GAMES[key];
    const urls = new Set<string>();
    try {
      (await discoverFromPage(game.path, timeoutMs)).forEach((u) => urls.add(u));
    } catch (e) {
      console.warn('[warmup] page discovery failed', game.path, e);
      result.ok = false;
    }
    for (const a of game.assets) {
      const u = sameOrigin(a, location.origin);
      if (u) urls.add(u);
    }

    // Scripts/styles first (they gate the splash), then art, then sounds.
    const rank = (u: string) =>
      /\.(js|css)(\?|$)/.test(u) ? 0 : /\.(woff2?|webp|png|jpe?g|svg|gif)(\?|$)/.test(u) ? 1 : 2;
    const queue = [...urls].filter((u) => !all.has(u)).sort((a, b) => rank(a) - rank(b));
    queue.forEach((u) => all.add(u));
    result.total += queue.length;

    const worker = async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        try {
          if (await warmOne(url, timeoutMs)) result.loaded++;
          else result.failed++;
        } catch {
          result.failed++;
        }
        opts.onProgress?.(result.loaded + result.failed, result.total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }

  // Bytes on the wire vs. served from cache (Resource Timing). HTML/CSS/JS are
  // fetched twice (discovery + main pass): count each URL once, sum all bytes.
  const lastEntry = new Map<string, PerformanceResourceTiming>();
  for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (!all.has(e.name)) continue;
    result.bytes += e.transferSize;
    lastEntry.set(e.name, e);
  }
  for (const e of lastEntry.values()) {
    if (e.transferSize === 0 && e.decodedBodySize > 0) result.fromCache++;
  }

  result.ok = result.ok && result.failed === 0;
  result.ms = Math.round(performance.now() - started);
  return result;
}
