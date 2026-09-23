# Kalshi API

## Configuration

```ts
import { Kalshi } from '@tundraconnect/kalshi';

// Market data only — no credentials.
const markets = new Kalshi({});

// Trading.
const client = new Kalshi({
  auth: {
    type: 'CUSTOM',
    accessKey: 'YOUR_KEY_ID', // KALSHI-ACCESS-KEY — a UUID from account settings
    privateKeyPem: 'YOUR_PEM', // PKCS#8 "-----BEGIN PRIVATE KEY-----" from the same settings page
  },
  baseURL: 'https://external-api.kalshi.com', // optional; default shown — pass DEMO_API for the sandbox
});
```

`auth` is entirely optional — omit it for market-data-only usage. When
present, both `auth.accessKey` and `auth.privateKeyPem` are required.
`privateKeyPem`'s STRUCTURE (BEGIN/END markers, valid base64) is validated
at construction — a malformed PEM throws `CONFIG_INVALID_PRIVATE_KEY`
immediately. The full cryptographic validity of the key can only be
proven asynchronously (`crypto.subtle.importKey` is inherently async), so
a structurally-valid-but-not-actually-RSA key instead fails on the first
authenticated call.

`baseURL` (inherited from every connect's standard option) defaults to
`PROD_API` (`https://external-api.kalshi.com` — the host docs.kalshi.com
currently recommends over the legacy `api.elections.kalshi.com`, which
still works but is no longer the documented default). Pass `DEMO_API`
(`https://external-api.demo.kalshi.co`) for the fake-money sandbox —
demo and production credentials are NOT interchangeable. Unlike
Polymarket, market data and portfolio/orders share this ONE host, so
there is no separate `clobBaseURL`-style option.

Read `client.hasCredentials` (`true` once `auth.accessKey`/
`auth.privateKeyPem` are configured) back via a getter.

## Endpoints

| Method                | Endpoint                                   | Auth    | Result                                         |
| --------------------- | ------------------------------------------ | ------- | ---------------------------------------------- |
| `getMarkets()`        | `GET /markets`                             | none    | `{ markets, cursor? }`                         |
| `getMarket()`         | `GET /markets/{ticker}`                    | none    | A `Market`, or `null` if not found             |
| `getOrderbook()`      | `GET /markets/{ticker}/orderbook`          | none    | `{ yes, no }` bid levels                       |
| `getTrades()`         | `GET /markets/trades`                      | none    | `{ trades, cursor? }`                          |
| `getEvents()`         | `GET /events`                              | none    | `{ events, cursor? }`                          |
| `getEvent()`          | `GET /events/{event_ticker}`               | none    | An `Event`, or `null` if not found             |
| `getSeriesList()`     | `GET /series`                              | none    | `{ series }`                                   |
| `getSeries()`         | `GET /series/{series_ticker}`              | none    | A `Series`, or `null` if not found             |
| `getExchangeStatus()` | `GET /exchange/status`                     | none    | `{ exchangeActive, tradingActive, ... }`       |
| `getBalance()`        | `GET /portfolio/balance`                   | RSA-PSS | Available balance/portfolio value              |
| `getPositions()`      | `GET /portfolio/positions`                 | RSA-PSS | `{ marketPositions, eventPositions, cursor? }` |
| `getFills()`          | `GET /portfolio/fills`                     | RSA-PSS | `{ fills, cursor? }`                           |
| `getOrders()`         | `GET /portfolio/orders`                    | RSA-PSS | `{ orders, cursor? }`                          |
| `getOrder()`          | `GET /portfolio/orders/{id}`               | RSA-PSS | An `Order`                                     |
| `submitOrder()`       | `POST /portfolio/events/orders`            | RSA-PSS | `OrderResult`                                  |
| `submitOrders()`      | `POST /portfolio/events/orders/batched`    | RSA-PSS | `OrderResult[]`, one per input order           |
| `amendOrder()`        | `POST /portfolio/events/orders/{id}/amend` | RSA-PSS | `OrderResult`                                  |
| `cancelOrder()`       | `DELETE /portfolio/events/orders/{id}`     | RSA-PSS | `CancelAck` (`orderId`, `reducedBy`, ...)      |
| `cancelOrders()`      | `DELETE /portfolio/events/orders/batched`  | RSA-PSS | `BatchOrderRow[]`                              |

See [Errors](Kalshi-Errors.md) for failure handling and
[Schemas](Kalshi-Schemas.md) for request/response validation.

### `getMarkets()` — pagination and status filter vocabulary

```ts
let cursor: string | undefined;
do {
  const page = await client.getMarkets({ status: 'open', cursor, limit: 200 });
  for (const m of page.markets) console.log(m.ticker, m.yesBid, m.yesAsk);
  cursor = page.cursor;
} while (cursor);
```

`GetMarketsQuery.status` (the QUERY filter) takes
`unopened`/`open`/`paused`/`closed`/`settled` — a DIFFERENT vocabulary
than the response's own `Market.status` field, which reports the raw
lifecycle state directly (`initialized`/`inactive`/`active`/`closed`/
`determined`/`disputed`/`amended`/`finalized`). This mismatch is a
genuine Kalshi API quirk, not a bug in this connect — read `Market.status`
against its own doc comment, not against the query vocabulary above.
`isSettledStatus()` (exported from `@tundraconnect/kalshi/schemas`)
checks for the terminal `settled`/`finalized` values.

### `getOrderbook()` — bids only, both legs

```ts
const book = await client.getOrderbook(ticker, 25); // depth: 1-100, or 0/negative for every level
console.log('best YES bid:', book.yes[0]);
```

Kalshi's single-book model returns BIDS ONLY on both the YES and NO legs
— a YES bid at price `p` is economically a NO ask at `1 - p`, so the two
bid-only arrays fully describe the book without a separate ask side.

### `submitOrder()` — build, sign, submit; local pre-flight validation

```ts
const result = await client.submitOrder({
  ticker: 'KXBTCD-26JUL1515-T71799.99',
  side: 'BUY', // buys YES exposure (wire: 'bid'); SELL sells it / buys NO (wire: 'ask')
  price: 0.42, // dollars, on-cent, [0.01, 0.99]
  count: 3, // whole contracts
  orderType: 'GTC', // GTC | FOK | FAK — V2 has no "market" type; FAK/FOK is an IOC/FOK at your price
});

if (result.filled) {
  console.log(`filled ${result.filledCount} at ${result.actualPrice}`);
  console.log('slippage vs. the requested price:', result.slippage);
}
```

Validates `price`/`count` locally BEFORE signing or sending anything —
`price` must be on-cent and in `[0.01, 0.99]`, `count` a positive whole
number — refusing a doomed order with `ORDER_REJECTED` rather than
letting the venue reject it. `clientOrderId` is auto-generated via
`crypto.randomUUID()` when omitted, so every order gets a real
account-wide dedupe key without forcing you to invent one. A genuine
venue rejection (any non-2xx) also throws `ORDER_REJECTED`, with the
vendor's detail message.

### `submitOrders()` — bulk, no fixed per-request cap

```ts
const results = await client.submitOrders([
  { ticker, side: 'BUY', price: 0.42, count: 1, orderType: 'GTC' },
  { ticker: otherTicker, side: 'SELL', price: 0.6, count: 2, orderType: 'GTC' },
]);
for (const r of results) {
  if (r.rejected) console.log('rejected:', r.detail);
  else console.log(r.filledCount, '/', r.filledCount + r.remainingCount);
}
```

Unlike Polymarket's `submitOrders()` (hard-capped at 15/request, so it
auto-chunks), Kalshi documents no fixed batch-size cap — "the maximum
batch size scales with your tier's write budget" — so this connect sends
the WHOLE input array in one request; exceeding your tier's limit is
refused as a whole-batch `ORDER_REJECTED`, not a per-row result. Every
order is validated locally (same pre-flight rail as `submitOrder()`)
before any request is sent — one bad entry refuses the whole call, since
there's no per-order outcome to report for a request that never went out.
Once sent, a single row's rejection never throws and never discards the
other rows' outcomes — every input maps to exactly one result, in the
same order, with `rejected: true` and `detail` set instead of an
exception.

### `amendOrder()` / `cancelOrder()` / `cancelOrders()`

```ts
// Amend: queue position survives only a pure size DECREASE.
const amended = await client.amendOrder(orderId, {
  ticker,
  side: 'BUY',
  price: 0.4,
  count: 2,
});

await client.cancelOrder(orderId); // -> CancelAck: { orderId, reducedBy, ... }
const rows = await client.cancelOrders([orderId1, orderId2]); // -> BatchOrderRow[]
```

`cancelOrder()`/`cancelOrders()` return the raw vendor shape rather than
`OrderResult` — a cancel has no price/fill concept, just
`reducedBy` (contracts canceled) and an optional per-row `error`.

---

[← Back to Kalshi](../README.md)

## Signing

Request signatures are produced by `@tundralibs/crypt`'s `signRSA` (RSA-PSS, SHA-256, salt 32 — exactly Kalshi's contract) from the PKCS#8 PEM; no hand-rolled Web Crypto remains in the signer. `client_order_id` uses `crypto.randomUUID()` — Kalshi mandates UUID4, and the platform primitive is the sanctioned choice for it.
