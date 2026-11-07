/**
 * Mobile WebView lite mode — Flutter passes ?mobile=1; also detect narrow UA.
 */
export function isMobileLite(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === '1') return true;
  } catch (_) {}
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return true;
  }
  try {
    return window.matchMedia('(max-width: 820px)').matches;
  } catch (_) {
    return false;
  }
}

/** Cap flying coin overlays on weak WebViews. */
export const MAX_FLYING_COINS = 3;

/** Debounce between bet taps (ms). */
export const BET_TAP_DEBOUNCE_MS = 150;
