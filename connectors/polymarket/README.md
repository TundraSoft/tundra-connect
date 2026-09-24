# Polymarket

Typed, cross-runtime client for [Polymarket](https://polymarket.com)'s two
public REST APIs: **Gamma** (market discovery — no auth) and the **CLOB**
(trading — L1/L2 auth, real secp256k1/EIP-712 order signing).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

One `Polymarket` client covers both APIs, matching how a Gamma market's
`clobTokenIds` feed directly into CLOB calls:

- **Gamma** (`gamma-api.polymarket.com`) — `getMarkets()` (legacy offset or
  keyset cursor pagination) and `getMarketBySlug()`. No credentials needed.
- **CLOB** (`clob.polymarket.com`) — `getVersion()`/`getTickSize()`/
  `getNegRisk()` (public), `deriveApiCredentials()` (one-time L1-signed
  onboarding), `getBalance()`, `submitOrder()`/`submitOrders()` (single/bulk,
  up to 15 per request, auto-chunked), `cancelOrder()`/`cancelOrders()`/
  `cancelMarketOrders()` (L2 HMAC-authenticated).
- **Relayer** (`relayer-v2.polymarket.com`) — `split()`/`merge()`/`redeem()`,
  gasless collateral split/merge/redeem via a signed EIP-191 proxy
  meta-transaction. Requires `auth.relayerApiKey`/`auth.relayerApiKeyAddress`,
  a credential separate from the CLOB's L2 `apiCredentials`.

`submitOrder()`/`submitOrders()`/`split()`/`merge()`/`redeem()` all resolve
to the same `OrderResult` shape (a `slippage` field included — `0` for
SPLIT/MERGE/REDEEM, the requested-vs-actual price gap for a filled
BUY/SELL); `order()` is a single entry point that dispatches to whichever
of them a `request.action` of `'BUY'`/`'SELL'`/`'SPLIT'`/`'MERGE'`/`'REDEEM'`
calls for.

Construct with `auth.privateKey` (and `auth.funder` for order placement) to
use the CLOB; omit `auth` entirely for Gamma-only, credential-free market
data.

### Key custody

`submitOrder()` and `deriveApiCredentials()` sign for real: this client
holds your wallet's raw private key in memory for the lifetime of the
instance and produces genuine secp256k1 ECDSA signatures over EIP-712 typed
data — the same cryptographic operation a browser wallet performs, not a
delegated call to one. The key is consumed once at construction, stored in
a true (non-enumerable) private field, and never logged, returned, or
included in a thrown error. This is the **first connect in this repo with a
non-`@tundralibs` dependency** — [`@noble/curves`](https://github.com/paulmillr/noble-curves)
and [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (audited,
zero-further-dependency, pure JS/TS) — because Web Crypto implements neither
secp256k1 ECDSA nor Keccak-256, both of which EIP-712 signing genuinely
requires.

A wallet private key is an irreversible-loss-capable secret, unlike a
revocable API key. Treat `auth.privateKey` accordingly: never commit it,
prefer a wallet dedicated to this integration over one holding significant
funds, and review `PolymarketSigner.ts`/`PolymarketOrder.ts` yourself before
trusting this client with real money.

`split()`/`merge()`/`redeem()` move real on-chain collateral through a
signed EIP-191 meta-transaction relayed by Polymarket's Relayer — review
`PolymarketRelayer.ts`/`PolymarketAbi.ts` yourself before trusting this
client with these calls, the same way you would for order signing.

### Out of scope (for now)

- **WebSocket market/user feeds** (`wss://ws-subscriptions-clob.polymarket.com`)
  are real-time push channels, a different integration shape than this
  repo's REST-only connects; whether/how to add one is an open decision,
  not yet built.
- Data API **activity/leaderboard/holders** feeds — only the portfolio
  half (`/positions`, `/value`) is wired up, via `getPositions()` /
  `getPortfolioValue()`.

## Documentation

| Topic                                 | Description                                |
| ------------------------------------- | ------------------------------------------ |
| [API](docs/Polymarket-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Polymarket-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Polymarket-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Polymarket CLOB API reference](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polymarket Gamma API reference](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Polymarket trading fees](https://docs.polymarket.com/trading/fees)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/polymarket
```

**Bun:**

```sh
bunx jsr add @tundraconnect/polymarket
```

**Node.js:**

```sh
npx jsr add @tundraconnect/polymarket
```

## Quick Start

```ts
import { Polymarket } from '@tundraconnect/polymarket';

// Gamma only — no wallet needed.
const gamma = new Polymarket({});
const { markets } = await gamma.getMarkets({ closed: false, limit: 20 });
const market = markets[0];
console.log(market?.question, market?.clobTokenIds);

// CLOB trading.
const clob = new Polymarket({
  auth: {
    type: 'CUSTOM',
    privateKey: Deno.env.get('CONNECTOR_POLYMARKET_PRIVATE_KEY')!,
    funder: Deno.env.get('CONNECTOR_POLYMARKET_FUNDER')!,
  },
});
await clob.deriveApiCredentials();
const balance = await clob.getBalance();
console.log('USDC available:', balance.balance);

// Portfolio: open orders and fills (CLOB), positions and value (Data API).
const { data: openOrders } = await clob.getOpenOrders();
const positions = await clob.getPositions();
console.log(
  openOrders.length,
  'resting orders,',
  positions.length,
  'positions',
);

const tokenId = market!.clobTokenIds[0]!;
const result = await clob.submitOrder({
  tokenId,
  side: 'BUY',
  price: 0.55,
  shares: 9.0,
  orderType: 'FAK',
});
if (result.filled) {
  console.log(
    `filled: spent ${result.makingAmount} for ${result.takingAmount} shares`,
  );
  console.log('slippage vs. the requested price:', result.slippage);
} else if (result.noMatch) {
  console.log('no resting liquidity matched — nothing was spent');
}

// Kill switch: every resting order, all markets, one request.
await clob.cancelAllOrders();

// order() dispatches BUY/SELL/SPLIT/MERGE/REDEEM to the right call above and
// always returns the same OrderResult shape.
await clob.order({
  action: 'BUY',
  tokenId,
  price: 0.55,
  shares: 9.0,
  orderType: 'FAK',
});
```

## License

MIT
