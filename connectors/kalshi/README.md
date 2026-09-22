# Kalshi

Typed, cross-runtime client for [Kalshi](https://kalshi.com)'s CFTC-regulated
event-contract REST API (`/trade-api/v2`) — public market discovery plus
RSA-PSS-authenticated trading, on one shared host.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

One `Kalshi` client covers both halves of the API:

- **Market data** (public, no auth) — `getMarkets()`/`getMarket()`,
  `getOrderbook()`, `getTrades()`, `getEvents()`/`getEvent()`,
  `getSeriesList()`/`getSeries()`, `getExchangeStatus()`.
- **Portfolio/orders** (RSA-PSS-signed) — `getBalance()`,
  `getPositions()`, `getFills()`, `getOrders()`/`getOrder()`,
  `submitOrder()`/`submitOrders()` (single/bulk — no fixed per-request
  cap, unlike Polymarket's 15), `amendOrder()`, `cancelOrder()`/
  `cancelOrders()`.

Construct with `auth.accessKey` + `auth.privateKeyPem` to trade; omit
`auth` entirely for market-data-only, credential-free usage.

### Compared to this repo's Polymarket connect

Kalshi and Polymarket are both event-contract exchanges this repo covers
with a deliberately similar shape — same method names
(`getMarkets()`/`submitOrder()`/`submitOrders()`/`cancelOrder()`/
`cancelOrders()`), same `price`/`OrderSide`/`OrderResult` conventions —
but the vendors differ enough that full parity isn't honest to force:

- **Auth**: Polymarket signs with a wallet's secp256k1 key (needs
  `@noble/curves`, since Web Crypto doesn't implement that curve). Kalshi
  signs with an RSA-PSS-SHA256 keypair issued from its own dashboard — a
  **standard** Web Crypto algorithm, so this connect stays
  `@tundralibs`-only with no extra dependency.
  There's also no Polymarket-style one-time L1→L2 credential-derivation
  step: `accessKey` + `privateKeyPem` ARE the ready-to-use credential.
- **No on-chain component**: Kalshi settles positions directly on its own
  ledger — there is no CTF/outcome-token model, so `split()`/`merge()`/
  `redeem()` (and the Relayer they depend on) have no Kalshi equivalent.
- **No `order()` dispatcher**: Polymarket's `order()` unifies five
  distinct actions (BUY/SELL/SPLIT/MERGE/REDEEM) behind one entry point.
  Kalshi only ever has one order-placing action (`side: 'BUY'|'SELL'` on
  `submitOrder()`), so a dispatcher would just be `submitOrder()` under a
  different name — not implemented.
- **`OrderResult.filledCount`/`remainingCount`** replace Polymarket's
  `makingAmount`/`takingAmount` — those describe a maker/taker ASSET-LEG
  split (USDC vs. shares) that doesn't exist here; a Kalshi order only
  ever moves one thing, contracts.

### Key custody

`submitOrder()`/`submitOrders()`/`amendOrder()`/`cancelOrder()`/
`cancelOrders()`, and every `/portfolio/*` read, all sign for real: this client
holds the account's RSA private key in memory for the lifetime of the
instance and produces genuine RSA-PSS-SHA256 signatures — the same
credential Kalshi's own dashboard issues, not a delegated call to one. The
key is consumed once at construction (as DER bytes), imported into a
non-extractable Web Crypto `CryptoKey` on first use, and never logged,
returned, or included in a thrown error. Review `KalshiSigner.ts`/
`KalshiAuth.ts` yourself before trusting this client with real money.

### Out of scope (for now)

- **The authenticated WebSocket feed** (`/trade-api/ws/v2` — fills, order
  updates, position changes) is a different integration shape than this
  repo's REST-only connects; whether/how to add one is an open decision,
  not yet built.
- **Order Groups**, **Multivariate Event Collections**, **Structured
  Targets**, and the **FIX** protocol are advanced/institutional surfaces
  outside this connect's REST-trading scope.
- **`decreaseOrder()`** (a legacy size-only-decrease endpoint) isn't wired
  up — `amendOrder()` already covers a size decrease (and a price
  change), which is this connect's one order-modification method.
- Historical candlesticks (`GET .../candlesticks`) and the separate
  historical-markets surface aren't covered.

## Documentation

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/Kalshi-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Kalshi-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Kalshi-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Kalshi API reference](https://docs.kalshi.com/api-reference)
- [API environments (production/demo hosts)](https://docs.kalshi.com/getting_started/api_environments)
- [Create a Kalshi account](https://kalshi.com/sign-up)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/kalshi
```

**Bun:**

```sh
bunx jsr add @tundraconnect/kalshi
```

**Node.js:**

```sh
npx jsr add @tundraconnect/kalshi
```

## Quick Start

```ts
import { Kalshi } from '@tundraconnect/kalshi';

// Market data only — no credentials needed.
const markets = new Kalshi({});
const { markets: page } = await markets.getMarkets({
  status: 'open',
  limit: 20,
});
const market = page[0];
console.log(market?.ticker, market?.yesBid, market?.yesAsk);

// Trading — auth.privateKeyPem is the PKCS#8 PEM from Kalshi's API-key settings.
const client = new Kalshi({
  auth: {
    type: 'CUSTOM',
    accessKey: Deno.env.get('CONNECTOR_KALSHI_ACCESS_KEY')!,
    privateKeyPem: Deno.env.get('CONNECTOR_KALSHI_PRIVATE_KEY_PEM')!,
  },
});
const balance = await client.getBalance();
console.log('available cents:', balance.balance);

const result = await client.submitOrder({
  ticker: market!.ticker,
  side: 'BUY',
  price: 0.42,
  count: 3,
  orderType: 'GTC',
});
if (result.filled) {
  console.log(`filled ${result.filledCount} at ${result.actualPrice}`);
}
```

## License

MIT
