# Polymarket API

## Configuration

```ts
import { Polymarket } from '@tundraconnect/polymarket';

// Gamma-only — no credentials.
const gamma = new Polymarket({});

// CLOB trading.
const clob = new Polymarket({
  auth: {
    type: 'CUSTOM',
    privateKey: '0x...', // wallet EOA private key
    funder: '0x...', // proxy/funding wallet holding USDC — required for submitOrder()
    apiCredentials: undefined, // optional: already-derived { apiKey, secret, passphrase }
    chainId: 137, // optional, defaults to Polygon mainnet
    signatureType: 1, // optional, defaults to PolyProxy (1)
    relayerApiKey: undefined, // optional: required only for split()/merge()/redeem()
    relayerApiKeyAddress: undefined, // optional: required only for split()/merge()/redeem()
  },
});
```

`auth` is entirely optional — omit it for Gamma-only usage. When present,
`auth.privateKey` (32 bytes of hex, with or without `0x`) or `auth.signer`
(see below) is required; every other field is optional. The client throws `PolymarketError`
(`CONFIG_INVALID_PRIVATE_KEY` / `CONFIG_INVALID_FUNDER`) at construction if
either is malformed. `baseURL` (inherited from every connect's standard
option) defaults to the Gamma API host and can be overridden for testing;
`clobBaseURL` does the same for the CLOB host — the two are independent
because this connect talks to two different vendor hosts, unlike every
other connect in this repo.

### Keeping keys out of JavaScript

Two alternatives keep the secrets in your own process (a native module, an
HSM, a remote signer) while this client still builds every digest and
request:

- **`auth.signer`** instead of `auth.privateKey` — `{ address,
  signDigest(digest) }`. It receives each final 32-byte EIP-712 (orders,
  L1 credential derivation) or EIP-191 (Relayer) digest — already hashed,
  sign it as-is — and returns the secp256k1 signature as `{ r, s, v }`
  (`r`/`s` as bytes, `0x` hex or bigint; `v` 0/1 or 27/28) or 65 bytes
  `r ‖ s ‖ v`. The client normalizes it to low-`s`, checks that it
  recovers to `address`, and throws `SIGNER_FAILED` otherwise (or when the
  signer rejects). A malformed `address` throws `CONFIG_INVALID_SIGNER`.
- **`auth.hmac`** instead of `apiCredentials.secret` — `(message) =>
  Promise<string>` returning URL-safe base64 (with padding) of
  `HMAC-SHA256(base64url-decode(secret), message)`. Pass `apiCredentials`
  with just `apiKey` and `passphrase`. Every REST request signs through it.
  The WebSocket user channel and PolyBolt authenticate by sending the raw
  secret, so they still need `secret`.

```ts ignore
const client = new Polymarket({
  auth: {
    type: 'CUSTOM',
    signer: { address: '0xYourEoa', signDigest: (d) => native.sign(d) },
    funder: '0xYourProxyWallet',
    apiCredentials: { apiKey: '...', passphrase: '...' },
    hmac: (message) => native.hmac(message),
  },
});
```

Signatures from an injected signer are byte-identical to the built-in
key's (secp256k1 signing here is RFC 6979 deterministic). The shared test
vectors in
[fixtures/signing-vectors.json](../fixtures/signing-vectors.json) pin
orders (V1, V2, neg-risk), L1 headers, an EIP-191 digest and an L2 HMAC —
reproduce them to prove an out-of-process signer.

Read `client.signerAddress` (the checksummed wallet EOA, once `auth` is
set) and `client.hasApiCredentials` (`true` once L2 credentials exist,
constructed-with or derived) back via getters. `client.hasRelayerCredentials`
reports whether `auth.relayerApiKey`/`auth.relayerApiKeyAddress` — a
credential separate from the CLOB's L2 `apiCredentials`, required only for
`split()`/`merge()`/`redeem()` — were supplied.

## Endpoints

| Method                   | Endpoint                                                        | Auth                                  | Result                                                       |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `getMarkets()`           | `GET /markets` or `GET /markets/keyset`                         | none                                  | `{ markets, nextCursor? }`                                   |
| `getMarketBySlug()`      | `GET /markets/slug/{slug}`                                      | none                                  | A `GammaMarket`, or `null` if not found                      |
| `getVersion()`           | `GET /version`                                                  | none                                  | The active order-signing protocol (1\|2), cached             |
| `getTickSize()`          | `GET /tick-size`                                                | none                                  | Minimum price tick for a token, cached                       |
| `getNegRisk()`           | `GET /neg-risk`                                                 | none                                  | Whether a token trades neg-risk, cached                      |
| `getOrderbook()`         | `GET /book`                                                     | none                                  | Aggregated bid/ask levels for one token                      |
| `keepalive()`            | `GET /`                                                         | none                                  | `boolean` — never throws                                     |
| `deriveApiCredentials()` | `POST /auth/api-key` (falls back to `GET /auth/derive-api-key`) | L1 (EIP-712)                          | `{ apiKey, secret, passphrase }`                             |
| `getBalance()`           | `GET /balance-allowance`                                        | L2 (HMAC)                             | Available USDC (or shares of one token) as the venue sees it |
| `getOpenOrders()`        | `GET /data/orders`                                              | L2 (HMAC)                             | `{ data, nextCursor? }` of the account's orders              |
| `getFills()`             | `GET /data/trades`                                              | L2 (HMAC)                             | `{ data, nextCursor? }` of the account's fills               |
| `submitOrder()`          | `POST /order`                                                   | L2 (HMAC) + order signature (EIP-712) | Fill/no-match/rejection outcome                              |
| `submitOrders()`         | `POST /orders` (chunked at 15)                                  | L2 (HMAC) + order signature (EIP-712) | One outcome per input order, same order                      |
| `cancelOrder()`          | `DELETE /order`                                                 | L2 (HMAC)                             | `{ canceled, notCanceled }`                                  |
| `cancelOrders()`         | `DELETE /orders`                                                | L2 (HMAC)                             | `{ canceled, notCanceled }`                                  |
| `cancelMarketOrders()`   | `DELETE /cancel-market-orders`                                  | L2 (HMAC)                             | `{ canceled, notCanceled }`                                  |
| `cancelAllOrders()`      | `DELETE /cancel-all`                                            | L2 (HMAC)                             | `{ canceled, notCanceled }`                                  |
| `getPositions()`         | `GET /positions` (Data API)                                     | none                                  | `DataPosition[]` with mark-to-market and PnL                 |
| `getPortfolioValue()`    | `GET /value` (Data API)                                         | none                                  | Total position value in USDC                                 |
| `split()`                | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                                |
| `merge()`                | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                                |
| `redeem()`               | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                                |
| `order()`                | dispatches to one of the above by `request.action`              | (whichever the dispatched call needs) | `OrderResult`                                                |

`submitOrder()`/`submitOrders()`/`split()`/`merge()`/`redeem()`/`order()` all
resolve to the same `OrderResult` shape — see
["OrderResult — one shape for every action"](#orderresult--one-shape-for-every-action)
below.

See [Errors](Polymarket-Errors.md) for failure handling and
[Schemas](Polymarket-Schemas.md) for request/response validation.

### `getMarkets()` — pagination

Gamma has two paginated endpoints with genuinely different response shapes
and filter support:

```ts
// keyset: cursor-paginated, supports startDateMin/Max, no documented cap.
let cursor: string | undefined;
do {
  const page = await client.getMarkets({
    endpoint: 'keyset',
    cursor,
    closed: false,
  });
  for (const m of page.markets) console.log(m.slug);
  cursor = page.nextCursor;
} while (cursor);

// legacy (default): offset-paginated, capped around 8000 results, but the
// only one that honours endDateMin correctly.
const page = await client.getMarkets({
  closed: false,
  endDateMin: new Date().toISOString(),
  offset: 100,
});
```

`GammaMarket.outcomes`/`outcomePrices`/`clobTokenIds` are always normalized
to plain `string[]` regardless of whether Gamma happened to serialize them
as a JSON-encoded string or a native array on that particular call — the
schema absorbs the difference. The three arrays are index-aligned (e.g.
`outcomes[0]` corresponds to `clobTokenIds[0]`); Gamma's own convention for
a binary market is `outcomes: ["Up", "Down"]` at indices `[0, 1]`, but
nothing in this connect assumes that ordering — read `outcomes` alongside
`clobTokenIds` yourself.

### `deriveApiCredentials()` — one-time L1 onboarding

```ts
const creds = await client.deriveApiCredentials();
console.log(creds.apiKey); // persist this + secret + passphrase yourself
```

Signs a `ClobAuth` EIP-712 message attesting wallet control, `POST`s it to
create a fresh API key, and falls back to `GET /auth/derive-api-key` if the
key already exists for this wallet+nonce. A no-op that returns the existing
credentials if `auth.apiCredentials` was already supplied at construction,
or this was already called once on this instance. Every other CLOB
authenticated method (`getBalance`, `submitOrder`, `cancelOrder(s)`) throws
`NO_API_CREDENTIALS` until this has run (or credentials were supplied
directly).

### `submitOrder()` — build, sign, submit, one retry

```ts
const result = await client.submitOrder({
  tokenId: '7132...', // from a GammaMarket's clobTokenIds
  side: 'BUY',
  price: 0.55, // on-tick, [0.01, 0.99]
  shares: 9.0, // cent-aligned — the venue rejects shares×price off a whole cent
  orderType: 'FAK', // GTC | GTD | FOK | FAK
});

if (result.filled) {
  console.log(
    `spent ${result.makingAmount} USDC for ${result.takingAmount} shares`,
  );
  console.log('slippage vs. the requested price:', result.slippage);
} else if (result.noMatch) {
  console.log(
    'FAK/FOK found no matching liquidity — nothing was spent, not an error',
  );
} else {
  console.log('partial fill', result.makingAmount, '/', result.takingAmount);
}
```

Builds the EIP-712 `Order` struct (protocol version 1 or 2, selected via
`getVersion()` unless you pass `version` explicitly), quantizes nothing on
your behalf — `price`/`shares` are sent exactly as given, so pre-quantize
with the venue's cent rule yourself if you're computing a size from a USD
budget — signs it with `auth.privateKey` (or `auth.signer`), and `POST`s
it: `prepareOrder()` then `submitPrepared()`. If the venue responds
`order_version_mismatch`, this refreshes the cached protocol version and
retries exactly once with a freshly-built, freshly-signed order — a NEW
order with a new hash; a mismatch that survives the retry throws
`ORDER_VERSION_MISMATCH_PERSISTED`. A genuine rejection (any other non-2xx)
throws `ORDER_REJECTED` with the vendor's detail message. A FAK/FOK
"no match" is never thrown — it's a normal, expected outcome reported via
`result.noMatch`.

### `prepareOrder()` / `submitPrepared()` — identity before sending

Polymarket has no client order id: an order's identity is the EIP-712 hash
of the signed order, and that depends on a salt chosen when it is built.
To record an order before sending it (and reconcile it after a crash),
split building from sending:

```ts
const prepared = await client.prepareOrder({
  tokenId: '7132...',
  side: 'BUY',
  price: 0.55,
  shares: 9,
  orderType: 'GTC',
  // salt: 123456789, nowMs: 1784600000000 — fix both for a reproducible hash
});
await journal.record(prepared.orderHash, prepared); // identity, before sending
const result = await client.submitPrepared(prepared); // result.id === prepared.orderHash
```

- `prepareOrder()` builds and signs only. With the same options, `salt`
  and `nowMs` it always returns the same `orderHash`, `signature` and
  `order` (the shared vectors in
  [fixtures/signing-vectors.json](../fixtures/signing-vectors.json) pin
  this).
- `submitPrepared()` sends the order exactly as signed and never rebuilds
  it. If the venue moved to another protocol version since the order was
  signed it throws `ORDER_VERSION_STALE` (`preparedVersion`,
  `currentVersion`, `orderHash` in the context): prepare a new order on
  purpose — it will have a new hash.
- Sending the same prepared order twice does not place it twice. The CLOB
  rejects the second one as `INVALID_ORDER_DUPLICATED` (HTTP 400,
  `order <hash> is invalid. Duplicated.`), surfaced as `ORDER_DUPLICATE`;
  read the original's state with `getOrder(orderHash)`. That retry after an
  unknown outcome (a timeout, a crash between send and response) is
  therefore safe. This follows Polymarket's documented error; the gated
  live test (`LIVE_TEST_ALLOW_ORDERS`) confirms it against the venue.
- `prepareOrders()` / `submitPreparedBatch()` do the same for many orders
  (one version and one neg-risk lookup per distinct token; 15 per request,
  chunks concurrent). A batch never throws for a vendor-side outcome: each
  row is an `OrderResult` with `rejectionCode: 'VERSION_STALE'` or
  `'DUPLICATE'` where those apply, and every row carries `orderHash`.

### `submitOrders()` — bulk, up to 15 per request, auto-chunked

```ts
const results = await client.submitOrders([
  { tokenId, side: 'BUY', price: 0.55, shares: 9, orderType: 'GTC' },
  {
    tokenId: otherTokenId,
    side: 'SELL',
    price: 0.4,
    shares: 5,
    orderType: 'GTC',
  },
]);
for (const r of results) {
  if (r.rejected) console.log('rejected:', r.detail);
  else if (r.noMatch) console.log('no match — nothing spent');
  else console.log(r.status, r.makingAmount, r.takingAmount);
}
```

More than 15 orders are split into multiple `POST /orders` calls
automatically (the vendor's documented per-request cap); a version mismatch
is retried once per chunk, same as `submitOrder()`. `negRisk` is resolved
once per **unique** `tokenId` in the input, not once per order, so a batch
that reuses the same token (e.g. several resting GTC legs at different
price levels) doesn't fan out redundant `/neg-risk` calls.

Unlike `submitOrder()`, a single order's rejection here never throws and
never discards the other orders' outcomes — every input maps to exactly one
result, in the same order, with `rejected: true` and `detail` set instead
of an exception. The only case `submitOrders()` throws is when the vendor
rejects an entire chunk at once (e.g. malformed payload, an owner/signer
mismatch) rather than one order within it — there is no per-order outcome
to report in that case, so it surfaces as `ORDER_REJECTED` /
`ORDER_VERSION_MISMATCH_PERSISTED` like a single-order failure would.

### `cancelOrder()` / `cancelOrders()` / `cancelMarketOrders()` / `cancelAllOrders()`

```ts
await client.cancelOrder('0xabc...');
const result = await client.cancelOrders(['0xabc...', '0xdef...']);
console.log(result.canceled, result.notCanceled); // notCanceled: { orderId: reason }

// Every resting order across a market, or narrowed to one outcome token.
await client.cancelMarketOrders({ market: conditionId });
await client.cancelMarketOrders({ market: conditionId, assetId: tokenId });

// The kill switch: every resting order on the account, all markets, one request.
await client.cancelAllOrders();
```

### Portfolio: `getBalance()` / `getOpenOrders()` / `getFills()` / `getPositions()` / `getPortfolioValue()`

Three sources feed the portfolio view, and they differ in auth and units:

| Method                | Source              | Auth | Notes                                                                                                                                                                                                            |
| --------------------- | ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBalance()`        | CLOB                | L2   | USDC collateral by default; `{ tokenId }` for the share balance of one outcome. The vendor sends 6-decimal base units — `balance` is already divided (`125.5`), `balanceRaw` is the wire string (`'125500000'`). |
| `getOrder(id)`        | CLOB `/data/order`  | L2   | One order by id (its `orderHash`) in any state — resting, matched or cancelled. Throws `NOT_FOUND` for an id the account never placed.                                                                           |
| `getOpenOrders()`     | CLOB `/data/orders` | L2   | Cursor-paginated; filter by `market`, `assetId` or `id`. `expiration === 0` means GTC.                                                                                                                           |
| `getFills()`          | CLOB `/data/trades` | L2   | Cursor-paginated; filter by `market`, `assetId`, `makerAddress`, `before`/`after` (Unix seconds). `traderSide` says whether you took or made.                                                                    |
| `getPositions()`      | Data API            | none | Keyed by wallet — defaults to `auth.funder`, pass `user` for any wallet. Offset-paginated (`limit`/`offset`); `redeemable`/`mergeable` filters.                                                                  |
| `getPortfolioValue()` | Data API            | none | Total mark-to-market value in USDC (`0` for an empty wallet). Equity = this + `getBalance().balance`.                                                                                                            |

```ts
// Reconcile on restart.
let cursor: string | undefined;
do {
  const page = await client.getOpenOrders({ cursor });
  for (const o of page.data) {
    console.log(
      o.id,
      o.status,
      o.side,
      o.price,
      o.originalSize - o.sizeMatched,
    );
  }
  cursor = page.nextCursor;
} while (cursor);

// What's held, and what it's worth.
const positions = await client.getPositions();
const value = await client.getPortfolioValue();
const cash = (await client.getBalance()).balance;
console.log(positions.length, 'positions worth', value, '+', cash, 'USDC cash');

// Anything to redeem?
for (const p of await client.getPositions({ redeemable: true })) {
  await client.redeem({
    conditionId: p.conditionId,
    negRisk: p.negativeRisk ?? false,
  });
}
```

#### Reconciling after a restart

| Need                                 | Call                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| An order recorded before it was sent | `getOrder(orderHash)` — its status and `sizeMatched`, whatever happened to it. `NOT_FOUND` means it never reached the venue.          |
| Every open order                     | `getOpenOrders()`, paging with `cursor`. Each `id` is the order hash.                                                                 |
| Fills since a point in time          | `getFills({ after: unixSeconds })`, paging with `cursor`. `takerOrderId` and `makerOrders[].order_id` link each fill to order hashes. |
| Positions                            | `getPositions()`, paging with `limit`/`offset`.                                                                                       |
| Cash                                 | `getBalance()` (USDC) and `getBalance({ tokenId })` (shares of one outcome).                                                          |

The Data API is public and reads any wallet — it is the same data the
Polymarket profile pages show. It lags the CLOB by a few seconds after a
fill; for the venue's own view of what a new order can draw on, use
`getBalance()`.

### `getOrderbook()`

```ts
const book = await client.getOrderbook(tokenId);
// The vendor sorts bids ascending and asks descending, so the touch is last on both sides.
const bestBid = book.bids.at(-1)?.price;
const bestAsk = book.asks.at(-1)?.price;
```

### `OrderResult` — one shape for every action

`submitOrder()`, each entry of `submitOrders()`, `split()`, `merge()`,
`redeem()`, and `order()` all resolve to the same `OrderResult`:

```ts
type OrderResult = {
  action: 'BUY' | 'SELL' | 'SPLIT' | 'MERGE' | 'REDEEM';
  success: boolean;
  filled: boolean; // CLOB only — always false for SPLIT/MERGE/REDEEM
  noMatch: boolean; // CLOB only
  rejected: boolean; // CLOB only — split/merge/redeem throw on rejection instead
  detail?: string;
  id: string; // CLOB order id, or the Relayer transaction id
  status: string;
  requestedPrice?: number; // BUY/SELL only
  actualPrice?: number; // BUY/SELL only, once filled
  slippage: number; // requestedPrice - actualPrice; 0 for SPLIT/MERGE/REDEEM or an unfilled order
  makingAmount: number;
  takingAmount: number;
  httpStatus: number;
  raw: ClobPostOrderResponse | RelayerSubmitResponse;
};
```

`slippage` is only ever non-zero for a filled BUY/SELL — a limit order can
fill better than requested (a resting order at a tighter price), so this can
land on either side of `0`. SPLIT/MERGE/REDEEM are a 1:1 collateral
conversion with no price to slip on, so `slippage` is always `0` there.

### `split()` / `merge()` / `redeem()` — gasless collateral actions (Relayer)

```ts
// SPLIT: 5 pUSD collateral -> 5 shares of EACH outcome.
const split = await client.split({ conditionId, amountUsd: 5, negRisk: false });
console.log(split.id); // the Relayer's transaction id

// MERGE: the inverse — burns 5 shares of each outcome, returns 5 pUSD.
await client.merge({ conditionId, amountUsd: 5, negRisk: false });

// REDEEM: convert a RESOLVED market's held outcome shares back to pUSD.
await client.redeem({ conditionId, negRisk: false });
```

Each call signs one EIP-191 proxy meta-transaction with `auth.privateKey`,
fetches a fresh relay nonce (`GET /relay-payload`), and submits it
(`POST /submit`) — the relayer pays gas, funded from `auth.funder`'s own
on-chain collateral. Requires `auth.relayerApiKey`/
`auth.relayerApiKeyAddress` in addition to `auth.privateKey`/`auth.funder`.
These move real, on-chain funds and cannot be undone by this connect — see
the README's "Key custody" section before using them with real money.

### `order()` — single entry point for every action

```ts
// Generic dispatch — useful when building requests from a common shape
// (e.g. a strategy/portfolio layer that doesn't want a branch per action).
const result = await client.order({
  action: 'BUY',
  tokenId,
  price: 0.55,
  shares: 9.0,
  orderType: 'FAK',
});

await client.order({
  action: 'SPLIT',
  conditionId,
  amountUsd: 5,
  negRisk: false,
});
await client.order({ action: 'REDEEM', conditionId, negRisk: false });
```

`request.action` selects the underlying call: `'BUY'`/`'SELL'` goes to
`submitOrder()`, `'SPLIT'`/`'MERGE'` to `split()`/`merge()`, `'REDEEM'` to
`redeem()`. Every branch returns the same `OrderResult`. This is purely a
convenience wrapper — calling `submitOrder()`/`split()`/`merge()`/`redeem()`
directly behaves identically and is one fewer level of indirection when you
already know which action you want.

---

[← Back to Polymarket](../README.md)
