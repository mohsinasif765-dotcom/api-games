# Merchant callbacks + USDT fee (Baishun-professional)

api-games acts as the **game provider**. Merchants (e.g. Rave gateway) expose wallet callbacks. Tenants also hold prepaid **USDT**; on each settled **losing** bet the SaaS deducts `loss_coins × coin_to_usdt_rate`.

## Launch URLs

```
/greedylion?apiKey=pk_live_…&tenant=demo
/greedylion?apiKey=pk_live_…&sstoken=…&tenant=demo
```

Host apps should mint a session via admin API (see below), then open the game WebView.

## Wallet modes (`tenants.wallet_mode`)

| Mode | Player coins | Merchant HTTP |
| --- | --- | --- |
| `local` (default) | `players.coins` only | none |
| `merchant_callback` | mirrored cache; source of truth = merchant | user_info + change_balance (+ sstoken) |

### Tenants

| Slug | Wallet | Use |
| --- | --- | --- |
| `rave-star` | `merchant_callback` → real `gateway.rave-star.com` | production-style merchant |
| `local-test` | `local` (`players.coins`) | local play / HUD testing |

```bash
node scripts/setup-local-test-tenant.mjs   # restores rave-star gateway + issues local-test key
```

Optional mock routes under `/api/v1/merchant-mock/*` exist if you temporarily point a tenant's `cb_*` URLs at localhost while keeping `wallet_mode=merchant_callback`.

## Callbacks (provider → merchant)

Configured per tenant (`cb_*` columns). Every POST is JSON with headers:

- `X-App-Id`
- `X-Timestamp` (unix seconds)
- `X-Sign` = `HMAC-SHA256(app_key, app_id + timestamp + bodyJson)` hex
- `X-Sign-Md5` = `MD5(app_key + timestamp + bodyJson)` hex (compat)

Merchant should accept either sign scheme.

### 1) User information — `cb_user_info_url`

Body: `{ "uid", "user_id", "sstoken?" }`  
Expect: `{ "ok": true, "data": { "uid", "nickname?", "avatar?", "coins" } }`  
(also accepts `code: 0` and top-level fields)

### 2) Change balance — `cb_change_balance_url`

Body:

```json
{
  "uid": "…",
  "user_id": "…",
  "amount": -1000,
  "request_id": "debit:uuid-or-payout:betId",
  "reason": "bet:greedylion",
  "sstoken": "…"
}
```

- Negative `amount` = debit (bet)
- Positive = credit (win)
- **Idempotent** on `request_id`

Expect balance in `data.coins` or `data.balance`.

### 3) get_sstoken — `cb_get_sstoken_url`

Body: `{ "uid", "user_id" }` → `{ "sstoken", "expires_at?" | "expires_in?" }`

### 4) update_sstoken — `cb_update_sstoken_url`

Body: `{ "uid", "user_id", "sstoken" }` → rotated token

## Admin APIs (`x-admin-secret: GATEWAY_ADMIN_SECRET`)

### Issue play key (existing)

`POST /api/v1/keys` — local coins bootstrap.

### Session (merchant-aware)

`POST /api/v1/session`

```json
{
  "tenant_slug": "demo",
  "external_id": "rave_user_1",
  "issue_sstoken": true
}
```

Returns `api_key`, optional `sstoken`, and `launch_query`.

### Settle merchant win credits

`POST /api/v1/internal/settle-merchant`  
Schedule every 1–2s when any tenant uses `merchant_callback`. Credits pending `game_bets.merchant_credit_status = 'pending'`.

## USDT SaaS fee

On round settle (`tick_game_rounds`), each **losing** bet:

```
fee_usdt = bet.amount × tenants.coin_to_usdt_rate
```

Deducted from `tenants.usdt_balance`, logged in `tenant_ledger` (`kind = loss_fee`).  
If balance cannot cover the fee → tenant `status = 'suspended'`.  
`placeBet` rejects when `usdt_balance <= 0` (and rate > 0).

Tune rate / top up with SQL: see `db/tenant-usdt-ops.sql`.

## API error shape

All `/api/v1` failures return:

```json
{ "ok": false, "error": "human message", "code": "STABLE_CODE" }
```

Use **`code`** (not the English `error` string) in host apps. HTTP status is still set for caching/proxies.

### Auth / admin

| code | HTTP | Meaning |
| --- | ---: | --- |
| `INVALID_API_KEY` | 401 | Missing/bad `X-Api-Key` (or player key) |
| `UNAUTHORIZED_ADMIN` | 401 | Bad `x-admin-secret` |
| `ADMIN_SECRET_MISSING` | 500 | Server missing `GATEWAY_ADMIN_SECRET` |

### Tenant / session

| code | HTTP | Meaning |
| --- | ---: | --- |
| `TENANT_NOT_FOUND` | 404 | Unknown `tenant_slug` |
| `TENANT_SUSPENDED` | 403 | Tenant not `active` (often USDT shortfall) |
| `TENANT_USDT_EXHAUSTED` | 402 | Prepaid USDT ≤ 0 while fee rate > 0 — bets blocked |
| `SESSION_FAILED` | 500 | Session bootstrap crashed |

### Bets / wallet

| code | HTTP | Meaning / host action |
| --- | ---: | --- |
| `INVALID_BET_AMOUNT` | 400 | amount ≤ 0 / not a number |
| `BET_OPTION_REQUIRED` | 400 | missing bet option |
| `EXTERNAL_ID_REQUIRED` | 400 | `merchant_callback` needs player `external_id` |
| `MERCHANT_DEBIT_FAILED` | 402 | Merchant `change_balance` debit failed — open wallet / retry |
| `INSUFFICIENT_BALANCE` | 402 | Player coins too low — H5 calls `openWallet()` |
| `GAME_NOT_FOUND` | 404 | No active `game_configs` for slug |
| `ROUND_NOT_FOUND` | 404 | Bad `round_id` |
| `BETTING_CLOSED` | 409 | Round left betting phase |
| `INVALID_AMOUNT` | 400 | Wallet debit/credit amount invalid |
| `PLAYER_NOT_FOUND` | 404 | Player row missing on credit |
| `BET_FAILED` | 500 | Unclassified bet failure |
| `ROUND_ID_REQUIRED` | 400 | round-rank missing `roundId` |
| `SETTLE_FAILED` | 500 | Merchant win-settle job failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

**402 rule:** treat as “needs money / wallet” — recharge UI, not a hard crash.

## JS bridge (UX only — not money)

See `docs/android-js-bridge.md`. Money never moves through the bridge.

| Helper | When |
| --- | --- |
| `notifyReady` | Game boot |
| `closeGame` | Back |
| `openWallet` | Insufficient / HTTP 402 (`INSUFFICIENT_BALANCE`, `MERCHANT_DEBIT_FAILED`, `TENANT_USDT_EXHAUSTED`) |
| `reportGameWin` | Real win |

## Apply migrations

```bash
node scripts/apply-tenant-usdt.mjs
node scripts/setup-round-cron.mjs
```
