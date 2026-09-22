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
`auth.privateKey` is required (32 bytes of hex, with or without `0x`); every
other field is optional. The client throws `PolymarketError`
(`CONFIG_INVALID_PRIVATE_KEY` / `CONFIG_INVALID_FUNDER`) at construction if
either is malformed. `baseURL` (inherited from every connect's standard
option) defaults to the Gamma API host and can be overridden for testing;
`clobBaseURL` does the same for the CLOB host — the two are independent
because this connect talks to two different vendor hosts, unlike every
other connect in this repo.

Read `client.signerAddress` (the checksummed wallet EOA, once `auth` is
set) and `client.hasApiCredentials` (`true` once L2 credentials exist,
constructed-with or derived) back via getters. `client.hasRelayerCredentials`
reports whether `auth.relayerApiKey`/`auth.relayerApiKeyAddress` — a
credential separate from the CLOB's L2 `apiCredentials`, required only for
`split()`/`merge()`/`redeem()` — were supplied.

## Endpoints

| Method                   | Endpoint                                                        | Auth                                  | Result                                           |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `getMarkets()`           | `GET /markets` or `GET /markets/keyset`                         | none                                  | `{ markets, nextCursor? }`                       |
| `getMarketBySlug()`      | `GET /markets/slug/{slug}`                                      | none                                  | A `GammaMarket`, or `null` if not found          |
| `getVersion()`           | `GET /version`                                                  | none                                  | The active order-signing protocol (1\|2), cached |
| `getTickSize()`          | `GET /tick-size`                                                | none                                  | Minimum price tick for a token, cached           |
| `getNegRisk()`           | `GET /neg-risk`                                                 | none                                  | Whether a token trades neg-risk, cached          |
| `keepalive()`            | `GET /`                                                         | none                                  | `boolean` — never throws                         |
| `deriveApiCredentials()` | `POST /auth/api-key` (falls back to `GET /auth/derive-api-key`) | L1 (EIP-712)                          | `{ apiKey, secret, passphrase }`                 |
| `getBalance()`           | `GET /balance-allowance`                                        | L2 (HMAC)                             | Available USDC as the venue sees it              |
| `submitOrder()`          | `POST /order`                                                   | L2 (HMAC) + order signature (EIP-712) | Fill/no-match/rejection outcome                  |
| `submitOrders()`         | `POST /orders` (chunked at 15)                                  | L2 (HMAC) + order signature (EIP-712) | One outcome per input order, same order          |
| `cancelOrder()`          | `DELETE /order`                                                 | L2 (HMAC)                             | `{ canceled, notCanceled }`                      |
| `cancelOrders()`         | `DELETE /orders`                                                | L2 (HMAC)                             | `{ canceled, notCanceled }`                      |
| `cancelMarketOrders()`   | `DELETE /cancel-market-orders`                                  | L2 (HMAC)                             | `{ canceled, notCanceled }`                      |
| `split()`                | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                    |
| `merge()`                | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                    |
| `redeem()`               | `GET /relay-payload` + `POST /submit` (Relayer)                 | Relayer API key + EIP-191 signature   | `OrderResult`                                    |
| `order()`                | dispatches to one of the above by `request.action`              | (whichever the dispatched call needs) | `OrderResult`                                    |

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
budget — signs it with `auth.privateKey`, and `POST`s it. If the venue
responds `order_version_mismatch`, this refreshes the cached protocol
version and retries exactly once with a freshly-built, freshly-signed
order; a mismatch that survives the retry throws
`ORDER_VERSION_MISMATCH_PERSISTED`. A genuine rejection (any other non-2xx)
throws `ORDER_REJECTED` with the vendor's detail message. A FAK/FOK
"no match" is never thrown — it's a normal, expected outcome reported via
`result.noMatch`.

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

### `cancelOrder()` / `cancelOrders()` / `cancelMarketOrders()`

```ts
await client.cancelOrder('0xabc...');
const result = await client.cancelOrders(['0xabc...', '0xdef...']);
console.log(result.canceled, result.notCanceled); // notCanceled: { orderId: reason }

// Every resting order across a market, or narrowed to one outcome token.
await client.cancelMarketOrders({ market: conditionId });
await client.cancelMarketOrders({ market: conditionId, assetId: tokenId });
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
