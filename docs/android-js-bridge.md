# Android / Flutter JS Bridge

H5 games talk to the host app through `lib/flutter-bridge.ts`.  
**Bridge is UX only** — never trust it for coin debit/credit. Money goes through `/api/v1` (+ merchant callbacks when enabled). See `docs/merchant-callbacks.md`.

## From H5 → Native

| Helper | Action |
| --- | --- |
| `closeGame()` | Close WebView / back to room |
| `openWallet()` | Open wallet / recharge |
| `reportGameWin({...})` | Win SVGA + room chat card |
| `haptic('light'\|'medium'\|'heavy'\|'success'\|'error')` | Vibration |
| `notifyReady({...})` | Game finished loading |

Also available on `window.GameBridge`.

### Host checklist

1. Inject JS interface as `Android` / `AndroidBridge` / `FunPlayAndroid`, or Flutter `callHandler`.
2. Implement all five helpers above.
3. Launch WebView with gateway session query (preferred):

```
https://YOUR_GAMES_HOST/greedylion?apiKey=pk_live_…&tenant=demo
https://YOUR_GAMES_HOST/greedylion?apiKey=pk_live_…&sstoken=…&tenant=demo
```

Mint session with admin `POST /api/v1/session` (`x-admin-secret`).

4. On `openWallet`, show your recharge sheet; when user returns, H5 will refresh via `/me`.
5. On `notifyReady`, hide native splash/loader.
6. On HTTP 402 from bets, H5 already calls `openWallet()`.

## Android WebView setup (Kotlin)

```kotlin
class FunPlayBridge(private val activity: Activity) {
  @JavascriptInterface
  fun closeGame() { activity.finish() }

  @JavascriptInterface
  fun openWallet() { /* open wallet sheet */ }

  @JavascriptInterface
  fun reportGameWin(
    gameSlug: String,
    gameName: String,
    winCoins: Int,
    multiplier: Double,
    betAmount: Int,
  ) { /* play win effect */ }

  @JavascriptInterface
  fun haptic(style: String) { /* vibrate */ }

  @JavascriptInterface
  fun notifyReady(json: String) { /* hide native loader */ }

  /** Optional single-channel JSON API */
  @JavascriptInterface
  fun postMessage(raw: String) {
    val msg = JSONObject(raw)
    when (msg.optString("action")) {
      "closeGame" -> closeGame()
      "openWallet" -> openWallet()
      // ...
    }
  }
}

webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(FunPlayBridge(this), "Android")
// Also accepted names: AndroidBridge, FunPlayAndroid
```

## Flutter InAppWebView

Existing handlers still work:

- `closeGame`
- `openWallet`
- `reportGameWin` (positional: slug, name, winCoins, multiplier, betAmount)
- `haptic`
- `notifyReady`

## Legacy Supabase token

Still supported for older shells:

```
/football?token=<access_token>
```

Prefer `apiKey` + `tenant` for the B2B gateway.
