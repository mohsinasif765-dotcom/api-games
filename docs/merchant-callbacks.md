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

## JS bridge (UX only — not money)

See `docs/android-js-bridge.md`. Money never moves through the bridge.

| Helper | When |
| --- | --- |
| `notifyReady` | Game boot |
| `closeGame` | Back |
| `openWallet` | Insufficient / HTTP 402 |
| `reportGameWin` | Real win |

## Apply migrations

```bash
node scripts/apply-tenant-usdt.mjs
node scripts/setup-round-cron.mjs
```
