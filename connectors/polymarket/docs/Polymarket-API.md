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
    funder: '0x...', // proxy/funding wallet holding pUSD — required for submitOrder()
    apiCredentials: undefined, // optional: already-derived { apiKey, secret, passphrase }
    chainId: 137, // optional, defaults to Polygon mainnet
    signatureType: 1, // optional, defaults to PolyProxy (1)
    relayerApiKey: undefined, // optional: required only for the Relayer calls
    relayerApiKeyAddress: undefined, // (split/merge/redeem/getRelayerTransaction)
  },
});
```

`auth` is entirely optional — omit it for Gamma-only usage. When present,
`auth.privateKey` (32 bytes of hex, with or without `0x`) or `auth.signer`
(see below) is required; every other field is optional. The client throws `PolymarketError`
(`CONFIG_INVALID_PRIVATE_KEY` / `CONFIG_INVALID_FUNDER`) at construction if
either is malformed. This connect talks to four vendor hosts, unlike every
other connect in this repo, and each can be overridden independently for
testing: `baseURL` (inherited from every connect's standard option) is the
Gamma API host, `clobBaseURL` the CLOB's, `dataBaseURL` the Data API's and
`relayerBaseURL` the Relayer's.

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
orders (CTF exchange versions 1 and 2, neg-risk, ExchangeV3), L1 headers, an EIP-191 digest and an L2 HMAC —
reproduce them to prove an out-of-process signer.

Read `client.signerAddress` (the checksummed wallet EOA, once `auth` is
set) and `client.hasApiCredentials` (`true` once L2 credentials exist,
constructed-with or derived) back via getters. `client.hasRelayerCredentials`
reports whether `auth.relayerApiKey`/`auth.relayerApiKeyAddress` — a
credential separate from the CLOB's L2 `apiCredentials`, required only for
`split()`/`merge()`/`redeem()`/`getRelayerTransaction()` — were supplied.

## Endpoints

| Method                               | Endpoint                                                        | Auth                                  | Result                                                    |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `getMarkets()`                       | `GET /markets` or `GET /markets/keyset`                         | none                                  | `{ markets, nextCursor? }`                                |
| `getMarketBySlug()`                  | `GET /markets/slug/{slug}`                                      | none                                  | A `GammaMarket`, or `null` if not found                   |
| `getVersion()`                       | `GET /version`                                                  | none                                  | The active CTF exchange version (1\|2), cached            |
| `getTickSize()`                      | `GET /tick-size`                                                | none                                  | Minimum price tick for a token, cached                    |
| `getNegRisk()`                       | `GET /neg-risk`                                                 | none                                  | Whether a token trades neg-risk, cached                   |
| `getOrderbook()`                     | `GET /book`                                                     | none                                  | Aggregated bid/ask levels for one token                   |
| `keepalive()`                        | `GET /`                                                         | none                                  | `boolean` — never throws                                  |
| `deriveApiCredentials()`             | `POST /auth/api-key` (falls back to `GET /auth/derive-api-key`) | L1 (EIP-712)                          | `{ apiKey, secret, passphrase }`                          |
| `getBalance()`                       | `GET /balance-allowance`                                        | L2 (HMAC)                             | Available pUSD (or shares of one token or V2 position)    |
| `refreshBalance()`                   | `GET /balance-allowance/update`, then `GET /balance-allowance`  | L2 (HMAC)                             | The same reading, after the CLOB re-reads the chain       |
| `getOrder()`                         | `GET /data/order/{id}`                                          | L2 (HMAC)                             | One order by id (its hash), in any state                  |
| `getOpenOrders()`                    | `GET /data/orders`                                              | L2 (HMAC)                             | `{ data, nextCursor? }` of the account's orders           |
| `getFills()`                         | `GET /data/trades`                                              | L2 (HMAC)                             | `{ data, nextCursor? }` of the account's fills            |
| `submitOrder()`                      | `POST /order`                                                   | L2 (HMAC) + order signature (EIP-712) | Fill/no-match/rejection outcome                           |
| `submitOrders()`                     | `POST /orders` (chunked at 15)                                  | L2 (HMAC) + order signature (EIP-712) | One outcome per input order, same order                   |
| `prepareOrder()` / `prepareOrders()` | none (`GET /version` and `GET /neg-risk` when not passed)       | order signature (EIP-712)             | Signed `PreparedOrder`(s) with their `orderHash`, unsent  |
| `submitPrepared()`                   | `POST /order`                                                   | L2 (HMAC)                             | Sends a prepared order exactly as signed                  |
| `submitPreparedBatch()`              | `POST /orders` (chunked at 15)                                  | L2 (HMAC)                             | One outcome per prepared order, same order                |
| `cancelOrder()`                      | `DELETE /order`                                                 | L2 (HMAC)                             | `{ canceled, notCanceled }`                               |
| `cancelOrders()`                     | `DELETE /orders`                                                | L2 (HMAC)                             | `{ canceled, notCanceled }`                               |
| `cancelMarketOrders()`               | `DELETE /cancel-market-orders`                                  | L2 (HMAC)                             | `{ canceled, notCanceled }`                               |
| `cancelAllOrders()`                  | `DELETE /cancel-all`                                            | L2 (HMAC)                             | `{ canceled, notCanceled }`                               |
| `getPositions()`                     | `GET /v2/positions` (Data API)                                  | none                                  | `{ data: DataPosition[], pagination }` with basis and PnL |
| `getPortfolioValue()`                | `GET /v2/value` (Data API)                                      | none                                  | Total position value in USDC                              |
| `getActivity()`                      | `GET /v2/activity` (Data API)                                   | none                                  | `{ data: DataActivity[], pagination }`                    |
| `getTrades()`                        | `GET /v2/trades` (Data API)                                     | none                                  | `{ data: DataTrade[], pagination }`                       |
| `getTokens()`                        | `GET /v2/tokens` (Data API)                                     | none                                  | `DataToken[]` — condition, outcome, settlement per token  |
| `getResolutions()`                   | `GET /v2/resolutions` (Data API)                                | none                                  | `DataResolution[]` — lifecycle and settlement estimate    |
| `split()`                            | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                             |
| `merge()`                            | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                             |
| `redeem()`                           | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                             |
| `getRelayerTransaction()`            | `GET /transaction` (Relayer)                                    | Relayer API key                       | `RelayerTransaction` — `state`, `transactionHash`         |
| `order()`                            | dispatches to one of the above by `request.action`              | (whichever the dispatched call needs) | `OrderResult`                                             |

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
    `spent ${result.makingAmount} pUSD for ${result.takingAmount} shares`,
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

Builds the EIP-712 `Order` struct (exchange version 1 or 2, selected via
`getVersion()` unless you pass `version` explicitly; `3` for a Protocol V2
market — see below), quantizes nothing on
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

On a match the response carries `tradeIds` (Polymarket stopped returning
inline `transactionsHashes` for FAK/FOK matches on 2026-07-24; poll the
trades by id if you need the settlement hashes). Crypto markets apply a
**150 ms taker delay** (since 2026-09-04): a marketable order can come back
with `status: 'delayed'` and match after that delay. This client does not
wait, poll or retry for it — `filled` is `false` on a delayed result; the
user socket or `getOrder(orderHash)` reports the outcome.

#### Round trips on the order path

`submitOrder()`/`prepareOrder()`/`submitPrepared()` never fetch or walk the
book, look up a price or wait before sending. The only lookups are the two
values an order must be signed for, each fetched once and cached for the
instance: the protocol version (`GET /version`, once per client) and a
token's neg-risk flag (`GET /neg-risk`, once per token). Pass `version` and
`negRisk` yourself — both are on the Gamma market (`negRisk`) and stable —
to make even the first order a single request. A Protocol V2 order
(`version: 3`) needs neither lookup. Fees are applied by the
venue at match time and are never part of the signed order, so no fee
lookup is needed either; `estimateFees()` computes them locally from the
market's `feeSchedule`.

#### Polymarket Protocol V2 markets (ExchangeV3)

Gamma lists two kinds of market side by side, told apart by
`market.version`: `"v1"` (ConditionalTokens — every older market, and
still the BTC/ETH up/down series as of 2026-11-10) and `"v2"` (Polymarket
Protocol V2, rolled out from October 2026; an unfiltered `getMarkets()`
leaves them out — pass `version: 'v2'`, or look one up by `conditionIds`).

Polymarket's
[migration schedule](https://docs.polymarket.com/migrate/polymarket-v2/overview)
moves **new** markets to Protocol V2 in three phases: the BNB, DOGE, HYPE,
SOL, XRP and ZEC up/down series on 2026-11-23; BTC and ETH up/down, the
other crypto, weather, commodities and finance markets on 2026-11-24;
sports and the rest on 2026-12-01. Markets that already exist stay on
ConditionalTokens for trading, settlement and redemption, and holdings are
not converted — so both routes stay in use, and reading `market.version`
(via `orderAsset()` and `positionMarket()`) is what keeps a caller correct
across the switch.

A Protocol V2 order signs
the same struct as a CTF exchange version 2 order, but for **ExchangeV3**
(`0xe3333700cA9d93003F00f0F71f8515005F6c00Aa`, EIP-712 domain version
`"3"`, one contract for neg-risk and binary markets alike), with the
market's `positionIds` entry as `tokenId`. `orderAsset()` picks the id and
version from the market, as Polymarket's migration guide requires — it
refuses a missing or unknown `version` rather than guess:

```ts
import { orderAsset } from '@tundraconnect/polymarket';

const { markets } = await client.getMarkets({ version: 'v2', closed: false });
const market = markets[0]!;
await client.submitOrder({
  ...orderAsset(market, 'Up'), // { tokenId: positionIds[i], version: 3 }
  side: 'BUY',
  price: 0.5,
  shares: 10,
  orderType: 'GTC',
});
const shares = await client.getBalance(orderAsset(market, 'Up')); // CONDITIONAL-V2
```

`version: 3` is never looked up (`/version` only reports the CTF exchange)
and never retried on `order_version_mismatch` — re-signing it for the CTF
exchange would only send it to the wrong contract. Before the first
Protocol V2 order the funder must approve pUSD for ExchangeV3 (BUY) and
PositionManager `setApprovalForAll` for ExchangeV3 (SELL); existing CTF
approvals do not carry over. After approving, call `refreshBalance()` so
the CLOB re-reads the wallet; its `allowances` then lists ExchangeV3.
Gasless
`split()`/`merge()`/`redeem()` on V2 markets go through the Protocol V2
Router — spread `positionMarket(market)` in; see
[below](#split--merge--redeem--gasless-collateral-actions-relayer).

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
automatically (the vendor's documented per-request cap). Orders the venue
refuses with `order_version_mismatch` are re-signed for the refreshed
version and resent once, together — only those rows, and never a Protocol
V2 (`version: 3`) order. `negRisk` is resolved
once per **unique** `tokenId` in the input, not once per order, so a batch
that reuses the same token (e.g. several resting GTC legs at different
price levels) doesn't fan out redundant `/neg-risk` calls.

Unlike `submitOrder()`, a rejection here never throws and never discards
the other orders' outcomes — every input maps to exactly one result, in
the same order, with `rejected: true` and `detail` set instead of an
exception. That holds when the vendor refuses an entire chunk at once
(e.g. a malformed payload, an owner/signer mismatch): every row of that
chunk is `rejected` with the vendor's message, and the other chunks keep
their own outcomes. A mismatch that survives the one retry is a `rejected`
row with `rejectionCode: 'VERSION_STALE'`, not an
`ORDER_VERSION_MISMATCH_PERSISTED` throw. What still throws is a failure
of the request itself — a `401`, a `429`, a `5xx`, a transport error —
and a response with the wrong number of rows (`RESPONSE_ERROR`).

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

### Portfolio: `getBalance()` / `getOpenOrders()` / `getFills()` / Data API v2

Three sources feed the portfolio view, and they differ in auth and units:

| Method                | Source              | Auth | Notes                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBalance()`        | CLOB                | L2   | pUSD collateral by default; `{ tokenId }` for the share balance of one outcome (`orderAsset(market, outcome)` for a Protocol V2 position). The vendor sends 6-decimal base units — `balance` is already divided (`125.5`), `balanceRaw` is the wire string (`'125500000'`). |
| `refreshBalance()`    | CLOB                | L2   | Same options and result as `getBalance()`, after telling the CLOB to re-read the wallet's on-chain balance and allowances. Use it after a confirmed split/merge/redeem, a deposit or a new approval.                                                                        |
| `getOrder(id)`        | CLOB `/data/order`  | L2   | One order by id (its `orderHash`) in any state — resting, matched or cancelled. Throws `NOT_FOUND` for an id the account never placed.                                                                                                                                      |
| `getOpenOrders()`     | CLOB `/data/orders` | L2   | Cursor-paginated; filter by `market`, `assetId` or `id`. `expiration === 0` means GTC.                                                                                                                                                                                      |
| `getFills()`          | CLOB `/data/trades` | L2   | Cursor-paginated; filter by `market`, `assetId`, `makerAddress`, `before`/`after` (Unix seconds). `traderSide` says whether you took or made.                                                                                                                               |
| `getPositions()`      | Data API v2         | none | Keyed by wallet — defaults to `auth.funder`, pass `user` for any wallet (or `user: null` + one `condition` for a market's holders). `status` selects `OPEN`/`REDEEMABLE`/`REDEEMABLE_LOST`/`MERGEABLE`/`CLOSED`.                                                            |
| `getPortfolioValue()` | Data API v2         | none | Total value in USDC (`0` for an empty wallet): holdings marked to market plus unresolved combos at cost. Equity = this + `getBalance().balance`.                                                                                                                            |
| `getActivity()`       | Data API v2         | none | The wallet's trades, splits, merges, redeems (one row per outcome), rewards and rebates; filter by `type`, `condition`, `side`, `start`/`end`.                                                                                                                              |
| `getTrades()`         | Data API v2         | none | The public fill feed by wallet, market or event (no `auth.funder` default); taker side only unless `takerOnly: false`.                                                                                                                                                      |
| `getTokens()`         | Data API v2         | none | Up to 50 token ids, or every token of up to 10 conditions: condition, module, outcome, opposite token, `resolved`/`finalPrice`.                                                                                                                                             |
| `getResolutions()`    | Data API v2         | none | By `questionId`, `condition` or `eventId`: status, disputes, payouts and `expectedSettlementTime` + `settlementTimeBasis` (an estimate, never a deadline).                                                                                                                  |

Every paginated Data API read returns `{ data, pagination }`: follow
`pagination.nextCursor` until it is `null`, sending it as `cursor` with the
same `user`/`condition` anchor (and re-sending `title` and `start`/`end`,
which the cursor does not carry). There is no `offset` — v2 rejects it.
Rows are camelCased from the vendor's snake_case and keep every unmodelled
field. Sizes are shares, `…Usdc` fields are USD; `entryCostUsdc` is the
fee-exclusive basis and `entryFeesUsdc` the buy fees on top
(`totalCostUsdc` = both).

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
const { data: positions } = await client.getPositions();
const value = await client.getPortfolioValue();
const cash = (await client.getBalance()).balance;
console.log(positions.length, 'positions worth', value, '+', cash, 'pUSD cash');

// Anything to redeem? (Page through with the cursor.) Positions don't say
// which position system they are on, so look the markets up in Gamma and
// let positionMarket() route each one (CTF adapter or V2 Router). A
// redeemable market is resolved, and getMarkets() lists open markets
// unless told otherwise — so `closed: true`.
let next: string | undefined;
do {
  const page = await client.getPositions({
    status: 'REDEEMABLE',
    cursor: next,
  });
  const conditionIds = [...new Set(page.data.map((p) => p.conditionId))];
  if (conditionIds.length > 0) {
    const { markets } = await client.getMarkets({ conditionIds, closed: true });
    for (const market of markets) {
      await client.redeem(positionMarket(market));
    }
  }
  next = page.pagination.nextCursor ?? undefined;
} while (next);

// When will an open market settle?
const [resolution] = await client.getResolutions({ condition: conditionId });
console.log(resolution?.status, resolution?.expectedSettlementTime);
```

#### Reconciling after a restart

| Need                                 | Call                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| An order recorded before it was sent | `getOrder(orderHash)` — its status and `sizeMatched`, whatever happened to it. `NOT_FOUND` means it never reached the venue.          |
| Every open order                     | `getOpenOrders()`, paging with `cursor`. Each `id` is the order hash.                                                                 |
| Fills since a point in time          | `getFills({ after: unixSeconds })`, paging with `cursor`. `takerOrderId` and `makerOrders[].order_id` link each fill to order hashes. |
| Positions                            | `getPositions()`, paging with `pagination.nextCursor`.                                                                                |
| Cash                                 | `getBalance()` (pUSD) and `getBalance({ tokenId })` (shares of one outcome).                                                          |

The Data API is public and reads any wallet — it is the same data the
Polymarket profile pages show. It lags the CLOB by a few seconds after a
fill; for the venue's own view of what a new order can draw on, use
`getBalance()`. That view is the CLOB's cached copy of the chain: after
something changed the wallet outside the CLOB — a confirmed
split/merge/redeem, a deposit, a new approval — `refreshBalance()` has it
re-read first.

### `getOrderbook()`

```ts
const book = await client.getOrderbook(tokenId);
// The vendor sorts bids ascending and asks descending, so the touch is last on both sides.
const bestBid = book.bids.at(-1)?.price;
const bestAsk = book.asks.at(-1)?.price;
```

### `estimateFees()` — fees from the market's own schedule

```ts
import { estimateFees } from '@tundraconnect/polymarket';

const market = await client.getMarketBySlug('btc-updown-5m-1794090000');
if (market) {
  const { takerFee, makerFee, makerRebate } = estimateFees(market, {
    price: 0.5,
    shares: 100,
  });
  // crypto (rate 0.07, takerOnly, rebateRate 0.2): 1.75, 0, 0.35
}
```

Polymarket's fee is `shares × rate × (p × (1 − p))^exponent` (every live
schedule has `exponent: 1`), rounded to 5 decimals, read from
`market.feeSchedule` — rates differ by category and change, so the helper
never assumes one. A market without a schedule, or with
`feesEnabled: false`, costs nothing. With `takerOnly` the maker pays
nothing and earns `rebateRate` of the taker fee (paid daily from a pool, so
per fill it is an estimate). A BUY's fee is extra collateral spent; a
SELL's is deducted from proceeds.

### `OrderResult` — one shape for every action

`submitOrder()`, each entry of `submitOrders()`, `split()`, `merge()`,
`redeem()`, and `order()` all resolve to the same `OrderResult`:

```ts
type OrderResult = {
  action: 'BUY' | 'SELL' | 'SPLIT' | 'MERGE' | 'REDEEM';
  success: boolean;
  filled: boolean; // CLOB only — always false for SPLIT/MERGE/REDEEM
  noMatch: boolean; // CLOB only
  rejected: boolean; // batches only — submitOrder and split/merge/redeem throw instead
  detail?: string;
  rejectionCode?: 'VERSION_STALE' | 'DUPLICATE'; // batches only, when the reason is one of these
  id: string; // CLOB order id, or the Relayer transaction id
  orderHash?: `0x${string}`; // BUY/SELL only — the signed order's EIP-712 hash
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
import { orderAsset, positionMarket } from '@tundraconnect/polymarket';

const market = (await client.getMarketBySlug(slug))!;
const route = positionMarket(market); // v1: { conditionId, negRisk }; v2: { conditionId, version: 'v2' }

// SPLIT: 5 pUSD collateral -> 5 shares of EACH outcome.
const split = await client.split({ ...route, amountUsd: 5 });
console.log(split.id); // the Relayer's transaction id

// Wait for it to land before relying on the new shares.
let tx = await client.getRelayerTransaction(split.id);
while (
  !['STATE_CONFIRMED', 'STATE_FAILED', 'STATE_INVALID'].includes(tx.state)
) {
  await new Promise((r) => setTimeout(r, 2_000));
  tx = await client.getRelayerTransaction(split.id);
}

// Selling the new shares? Have the CLOB re-read the wallet first.
await client.refreshBalance(orderAsset(market, 'Yes'));

// MERGE: the inverse — burns 5 shares of each outcome, returns 5 pUSD.
await client.merge({ ...route, amountUsd: 5 });

// REDEEM: convert a RESOLVED market's held outcome shares back to pUSD.
await client.redeem(route);
```

The market's Gamma `version` decides the route, as Polymarket's V2
migration guide requires — `positionMarket(market)` reads it (and throws
`INVALID_OPTIONS` for a missing or unknown one), or pass it yourself:

| Market `version` | Options                          | Target                                                                                      |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `v1` (default)   | `{ conditionId, negRisk }`       | CTF collateral adapter (`0xAdA1…cE1f`, or the neg-risk one `0xadA2…eAab`)                   |
| `v2`             | `{ conditionId, version: 'v2' }` | Protocol V2 Router `0x12121212006e4CD160D18e3f00711DA5c3372600`, standard or neg-risk alike |

On a V2 market, `conditionId` is Gamma's (the 31-byte Router condition,
padded to 32 bytes with a zero final byte; the bare 31-byte form works
too). The Router's `split(bytes31,uint256)` and `merge(bytes31,uint256)`
take the amount like the adapters do. Its `redeem(bytes31,uint256,uint256)`
redeems ONE outcome and an explicit amount per call, so a V2 `redeem()`
sends one call per outcome holding shares, all in one meta-transaction:
`redeem({ ...route, shares: [yes, no] })`, or without `shares`, the
wallet's whole `CONDITIONAL-V2` balance of each outcome, read first with
two `getBalance()` calls (which need CLOB credentials —
`deriveApiCredentials()` first). Only outcomes `0` and `1` are read; pass
`shares` yourself for anything else. Nothing to redeem throws
`INVALID_OPTIONS` before anything is sent — as does, on either route, a
malformed `conditionId` or a split/merge amount that is not above zero.

The wallet needs its own approvals for the Router — CTF approvals do not
carry over: pUSD `approve(Router)` for split, and PositionManager
(`0x006F54F7f9A22e0000CC2AB60031000000ae9fEF`)
`setApprovalForAll(Router, true)` for merge and redeem. Polymarket's UI
sets both; this client does not send approvals. Protocol V2 also has an
AutoRedeemer: a wallet can approve it as a PositionManager operator so
that an authorized operator redeems a position's full balance back to the
same wallet. That approval alone does not schedule a redemption, and this
client neither sets it nor relies on it — `redeem()` is the route here.

`POST /submit` only acknowledges the relay (`status` `STATE_NEW`).
`getRelayerTransaction(id)` reads its progress —
`STATE_NEW` → `STATE_EXECUTED` → `STATE_MINED` → `STATE_CONFIRMED`, with
`STATE_FAILED`/`STATE_INVALID` terminal — and the on-chain
`transactionHash` once broadcast. This client never polls for you. In the
live tests a $1 split or merge took 4.5–6 s from submit to
`STATE_CONFIRMED`, on both routes.

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
await client.order({ action: 'REDEEM', ...positionMarket(market) });
```

`request.action` selects the underlying call: `'BUY'`/`'SELL'` goes to
`submitOrder()`, `'SPLIT'`/`'MERGE'` to `split()`/`merge()`, `'REDEEM'` to
`redeem()`. Every branch returns the same `OrderResult`. This is purely a
convenience wrapper — calling `submitOrder()`/`split()`/`merge()`/`redeem()`
directly behaves identically and is one fewer level of indirection when you
already know which action you want.

---

[← Back to Polymarket](../README.md)
