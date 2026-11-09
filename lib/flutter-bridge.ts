/**
 * H5 ↔ native JS bridge (Flutter InAppWebView + Android WebView).
 *
 * Native can expose any of:
 *   - window.flutter_inappwebview.callHandler(name, ...args)
 *   - window.Android.<method>(...)
 *   - window.AndroidBridge.<method>(...)
 *   - window.FunPlayAndroid.<method>(...)
 *   - window.Android.postMessage(JSON.stringify({ action, ... }))
 *
 * H5 helpers: closeGame, openWallet, reportGameWin, haptic, notifyReady
 */

type FlutterBridge = {
  callHandler: (handler: string, ...args: unknown[]) => unknown;
};

type AndroidMethodBridge = {
  postMessage?: (payload: string) => unknown;
  [key: string]: unknown;
};

type BridgeWindow = Window & {
  flutter_inappwebview?: FlutterBridge;
  Android?: AndroidMethodBridge;
  AndroidBridge?: AndroidMethodBridge;
  FunPlayAndroid?: AndroidMethodBridge;
  GameBridge?: {
    closeGame: () => void;
    openWallet: () => void;
    reportGameWin: (payload: GameWinPayload) => void;
    haptic: (style?: HapticStyle) => void;
    notifyReady: (info?: Record<string, unknown>) => void;
  };
};

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'error';

export type GameWinPayload = {
  gameSlug: string;
  gameName: string;
  winCoins: number;
  multiplier?: number;
  betAmount?: number;
};

function getWin(): BridgeWindow | null {
  if (typeof window === 'undefined') return null;
  return window as BridgeWindow;
}

function getFlutter(): FlutterBridge | null {
  return getWin()?.flutter_inappwebview ?? null;
}

function getAndroid(): AndroidMethodBridge | null {
  const w = getWin();
  if (!w) return null;
  return w.Android ?? w.AndroidBridge ?? w.FunPlayAndroid ?? null;
}

/** True when running inside Flutter or Android WebView bridge. */
export function hasNativeBridge(): boolean {
  return !!(getFlutter() || getAndroid());
}

/**
 * Call a native handler with progressive fallbacks:
 * Flutter → Android method → Android postMessage → parent postMessage
 */
export function callNative(handler: string, ...args: unknown[]): boolean {
  const flutter = getFlutter();
  if (flutter?.callHandler) {
    try {
      flutter.callHandler(handler, ...args);
      return true;
    } catch (e) {
      console.warn('[js-bridge] flutter', handler, e);
    }
  }

  const android = getAndroid();
  if (android) {
    const fn = android[handler];
    if (typeof fn === 'function') {
      try {
        fn(...args);
        return true;
      } catch (e) {
        console.warn('[js-bridge] android method', handler, e);
      }
    }
    if (typeof android.postMessage === 'function') {
      try {
        android.postMessage(
          JSON.stringify({
            action: handler,
            args,
            payload: args.length === 1 ? args[0] : args,
          }),
        );
        return true;
      } catch (e) {
        console.warn('[js-bridge] android postMessage', handler, e);
      }
    }
  }

  // iframe / parent shell fallback
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { source: 'funplay-h5', action: handler, args },
        '*',
      );
      return true;
    }
  } catch {
    // ignore cross-origin
  }

  return false;
}

/** @deprecated use callNative — kept for existing imports */
export function callFlutter(handler: string, ...args: unknown[]) {
  callNative(handler, ...args);
}

/** Close the WebView / return to room. */
export function closeGame() {
  if (callNative('closeGame')) return;
  try {
    window.history.back();
  } catch {
    // ignore
  }
}

/** Open wallet / recharge sheet in the host app. */
export function openWallet() {
  callNative('openWallet');
}

/** Notify host to play win SVGA + room chat card. */
export function reportGameWin(params: GameWinPayload) {
  const winCoins = Math.floor(Number(params.winCoins) || 0);
  if (winCoins <= 0) return;

  const multiplier = params.multiplier ?? 1;
  const betAmount = params.betAmount ?? 0;

  // Flutter handlers historically receive positional args
  const viaFlutter = !!getFlutter();
  if (viaFlutter) {
    callNative(
      'reportGameWin',
      params.gameSlug,
      params.gameName,
      winCoins,
      multiplier,
      betAmount,
    );
    return;
  }

  // Android prefers a single JSON-friendly object when using postMessage,
  // but also supports positional methods.
  const android = getAndroid();
  if (android && typeof android.reportGameWin === 'function') {
    try {
      // Try object first, then positional
      android.reportGameWin({
        gameSlug: params.gameSlug,
        gameName: params.gameName,
        winCoins,
        multiplier,
        betAmount,
      });
      return;
    } catch {
      try {
        android.reportGameWin(
          params.gameSlug,
          params.gameName,
          winCoins,
          multiplier,
          betAmount,
        );
        return;
      } catch (e) {
        console.warn('[js-bridge] reportGameWin', e);
      }
    }
  }

  callNative('reportGameWin', {
    gameSlug: params.gameSlug,
    gameName: params.gameName,
    winCoins,
    multiplier,
    betAmount,
  });
}

/** Optional haptic feedback on Android / Flutter. */
export function haptic(style: HapticStyle = 'light') {
  callNative('haptic', style);
}

/** Tell host the H5 game finished boot / is interactive. */
export function notifyReady(info?: Record<string, unknown>) {
  callNative('notifyReady', {
    href: typeof location !== 'undefined' ? location.href : '',
    ...info,
  });
}

/** Install window.GameBridge for native → H5 discovery / debugging. */
export function installGameBridge() {
  const w = getWin();
  if (!w) return;
  w.GameBridge = {
    closeGame,
    openWallet,
    reportGameWin,
    haptic,
    notifyReady,
  };
}

if (typeof window !== 'undefined') {
  installGameBridge();
}
