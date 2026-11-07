# Android / Flutter JS Bridge

H5 games talk to the host app through `lib/flutter-bridge.ts`.

## From H5 → Native

| Helper | Action |
| --- | --- |
| `closeGame()` | Close WebView / back to room |
| `openWallet()` | Open wallet / recharge |
| `reportGameWin({...})` | Win SVGA + room chat card |
| `haptic('light'\|'medium'\|'heavy'\|'success'\|'error')` | Vibration |
| `notifyReady({...})` | Game finished loading |

Also available on `window.GameBridge`.

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

## Auth token

Pass Supabase access token only (never refresh token):

```
/football?token=<access_token>
```

Applied via `applyWebViewAccessToken` in each game page.
