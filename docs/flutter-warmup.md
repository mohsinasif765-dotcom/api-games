# Game warm-up (Flutter)

Pre-cache H5 game files at app start so the player's **first** game open is as
fast as a repeat open.

Measured on slow 4G + 4× slow CPU (low-end Android profile), splash close time:

| Game (`games=` key) | Cold | After warm-up | Warm-up data (first time) |
|---|---|---|---|
| `greedylion` | 5.3 s | **1.0 s** | ~0.9 MB |
| `greedy-baby` | 7.4 s | **2.0 s** | ~1.1 MB |
| `lucky77` | 11.5 s | **1.7 s** | ~1.4 MB |
| `luck77` | 13.4 s | **1.9 s** | ~1.6 MB |
| `football` (Bounty Football) | 12.9 s | **1.8 s** | ~1.7 MB |
| `euro-roulette` | 8.6 s | **1.8 s** | ~0.9 MB |

After a warm-up the game downloads ~10 KB when opened (just its HTML).

## How it works

`/warmup` is a tiny page you load in a **hidden** WebView. It reads the game
page to find the current deployment's JS/CSS/fonts, adds the game's images and
sounds, and downloads them into the WebView HTTP cache (low priority, 4 at a
time). It does **not** start the game: no API key, no `/boot`, no socket.

It is built to be invisible on low-end phones:

- one game at a time, **2 downloads at once**, low network priority;
- files are streamed straight to the cache (nothing decoded or kept in RAM);
- **skipped automatically on 2G or when the OS data saver is on**;
- already-cached files cost nothing — a repeat run transfers ~0 bytes.

Android WebView and WKWebView keep one HTTP cache per app, so the real game
WebView then loads almost everything from disk.

```
https://<GAMES_HOST>/warmup?games=greedylion
```

- `games` — comma-separated keys in **priority order** (default `greedylion`),
  or `all`. Keys are the game routes: `greedylion`, `greedy-baby`, `lucky77`,
  `luck77`, `football`, `euro-roulette`, … (see `lib/warmup/manifest.generated.ts`).
- `force=1` — warm even on 2G / data saver (skipped by default).

Recommended: warm the 2–3 games the player is most likely to open (e.g. last
played first), not `all`, on mobile data.

When finished it calls the JS handler **`warmupDone`** with:

```json
{ "ok": true, "games": ["greedylion"], "total": 54, "loaded": 54, "failed": 0,
  "fromCache": 10, "bytes": 1274551, "ms": 3200 }
```

(also `window.__gameWarmup` and `document.title === "warmup:done"`).

## Flutter (flutter_inappwebview 6.x)

```dart
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Pre-caches H5 game files so the first game open is fast.
class GameWarmup {
  GameWarmup._();

  /// MUST be the same host the game WebView opens (cache is per URL).
  static const String gamesHost = 'https://api-games-red.vercel.app';

  static bool _running = false;

  /// [games] in priority order, e.g. ['greedylion', 'lucky77'].
  static Future<void> run({List<String> games = const ['greedylion']}) async {
    if (_running) return;
    _running = true;

    final done = Completer<Map<String, dynamic>?>();
    final view = HeadlessInAppWebView(
      initialUrlRequest: URLRequest(
        url: WebUri('$gamesHost/warmup?games=${games.join(',')}'),
      ),
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        cacheEnabled: true,
        incognito: false,
        cacheMode: CacheMode.LOAD_DEFAULT,
      ),
      onWebViewCreated: (controller) {
        controller.addJavaScriptHandler(
          handlerName: 'warmupDone',
          callback: (args) {
            if (!done.isCompleted) {
              final first = args.isNotEmpty ? args.first : null;
              done.complete(
                first is Map ? Map<String, dynamic>.from(first) : null,
              );
            }
            return null;
          },
        );
      },
      onReceivedError: (controller, request, error) {
        if (request.isForMainFrame == true && !done.isCompleted) {
          done.complete(null); // offline etc. — try again next launch
        }
      },
    );

    try {
      await view.run();
      final result = await done.future.timeout(
        const Duration(seconds: 120),
        onTimeout: () => null,
      );
      debugPrint('[GameWarmup] $result');
    } catch (e) {
      debugPrint('[GameWarmup] failed: $e');
    } finally {
      await view.dispose();
      _running = false;
    }
  }
}
```

Start it once the home screen is up (not during the app's own startup work):

```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addPostFrameCallback((_) {
    Future.delayed(const Duration(seconds: 3), GameWarmup.run);
  });
}
```

Run it on **every launch**. When files are already cached it costs only the
small game HTML; after a new deployment it fetches just the changed files.

## Checklist for the game WebView

The warm cache is only used if the game WebView shares it:

1. Same host as `gamesHost` (e.g. `https://api-games-red.vercel.app/greedylion?apiKey=…`).
2. `cacheEnabled: true` (default), **not** `incognito`, and never call
   `clearCache()` / `InAppWebViewController.clearAllCache()` before opening a game.
3. Same Android process (default). Don't give the game WebView a separate
   data directory suffix.

## How the file list stays correct

Nothing is hand-maintained:

- JS/CSS/fonts are read from the live game page, including lazily loaded
  chunks such as Phaser (with the same `?dpl=` suffix the runtime uses).
- Images/sounds the game loads at runtime come from
  `lib/warmup/manifest.generated.ts`, generated from source by
  `scripts/gen-warmup-manifest.mjs` **before every build** (`prebuild`).
  Every route under `app/` is included automatically.
