# Polymarket

Typed [Polymarket](https://polymarket.com) prediction-market client for Deno,
Bun, Node.js and Cloudflare Workers. It covers **Gamma** market discovery (no
auth), **CLOB** trading with secp256k1/EIP-712 order signing (L1/L2 auth),
**Data API v2** positions, portfolio value, activity, trades, token lookup and
resolution state (with settlement-time estimates), fee estimates from each
market's own fee schedule, gasless split, merge and redeem, and real-time
**WebSocket feeds** (order books, trades, your orders and fills, and PolyBolt's
Chainlink/Pyth crypto, equity, forex and TWAP reference prices). An
alternative to the official Polymarket SDKs for the endpoints it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/polymarket)](https://jsr.io/@tundraconnect/polymarket)
[![JSR Score](https://jsr.io/badges/@tundraconnect/polymarket/score)](https://jsr.io/@tundraconnect/polymarket)

## Overview

One `Polymarket` client covers both APIs, matching how a Gamma market's
`clobTokenIds` feed directly into CLOB calls:

- **Gamma** (`gamma-api.polymarket.com`) — `getMarkets()` (legacy offset or
  keyset cursor pagination) and `getMarketBySlug()`. No credentials needed.
- **CLOB** (`clob.polymarket.com`) — `getVersion()`/`getTickSize()`/
  `getNegRisk()`/`getOrderbook()` (public), `deriveApiCredentials()`
  (one-time L1-signed onboarding), and L2 HMAC-authenticated
  `getBalance()` (USDC collateral, or one outcome token's shares),
  `getOpenOrders()`/`getFills()` (cursor-paginated), `getOrder()` (one
  order by hash, in any state), `submitOrder()`/`submitOrders()`
  (single/bulk, up to 15 per request, auto-chunked),
  `prepareOrder()`/`submitPrepared()` (sign first, so the order's hash is
  known before it is sent; never re-signed),
  `cancelOrder()`/`cancelOrders()`/`cancelMarketOrders()`/
  `cancelAllOrders()`.
- **Data API v2** (`data-api.polymarket.com/v2`) — `getPositions()`
  (open/redeemable/mergeable/closed lifecycle, fee-exclusive basis and PnL),
  `getPortfolioValue()`, `getActivity()`, `getTrades()`, `getTokens()` and
  `getResolutions()` (including `expectedSettlementTime`). Public and
  unsigned; cursor-paginated (`pagination.nextCursor`); wallet reads
  default to `auth.funder`. Data API v1 was retired on 2026-11-02 and is no
  longer called anywhere.
- **Fees** — `estimateFees(market, { price, shares })` computes
  `shares × rate × p × (1 − p)` from the market's own `feeSchedule` (makers
  pay nothing on a taker-only schedule and earn its `rebateRate`).
- **WebSocket feeds** (`@tundraconnect/polymarket/sockets`, importable
  without the REST client) — `PolymarketMarketSocket` (full-depth books,
  every level change, trades, tick-size changes), `PolymarketUserSocket`
  (your orders and trades) and `PolymarketPriceSocket` (PolyBolt: crypto,
  equity and forex prices with provider pins, `source` and `marketStatus`,
  and the Chainlink 60-second TWAPs crypto up/down markets settle on).
  Async iterables of Guardian-validated events with automatic reconnects
  and explicit reconnect/gap events — see
  [Sockets](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-Sockets).
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
data (`getOrderbook()` and the Data API reads need no credentials either —
though the Data API reads default to `auth.funder` when no `user` is given).

### Key custody

To keep the wallet key and the API secret out of JavaScript entirely, pass
`auth.signer` (signs the digests this client builds) and `auth.hmac` (signs
L2 requests) instead of `auth.privateKey` and `apiCredentials.secret` — see
[API → Keeping keys out of JavaScript](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-API#keeping-keys-out-of-javascript).
With the raw key:

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

- **Polymarket Protocol V2 markets** (Gamma `version: "v2"`, traded by
  `positionIds` on ExchangeV3 with EIP-712 domain version `"3"`). This
  client signs for CTF Exchange V2 (`version: "v1"` markets — every listed
  crypto up/down market as of 2026-11-06); `GammaMarket.version` says which
  a market is.
- The RTDS **comments** topic, PolyBolt's `esports.series` channel and the
  **sports** feed. (The legacy RTDS price topics were removed — use
  PolyBolt.)
- Other Data API v2 routes (leaderboards, holders, PnL series, price
  history, combos, …).

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `Polymarket`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/polymarket/schemas` or throws a real `PolymarketError`:

```ts
import { PolymarketError } from '@tundraconnect/polymarket/errors';

const outage = new PolymarketError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                           | Description                                |
| ------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-Schemas) | Public Guardian schemas and inferred types |
| [Sockets](https://github.com/TundraSoft/tundra-connect/wiki/Polymarket-Sockets) | Real-time WebSocket feeds                  |

## Upstream

- [Polymarket trading overview](https://docs.polymarket.com/trading/overview)
- [Polymarket market data (Gamma)](https://docs.polymarket.com/market-data/overview)
- [Polymarket Data API v2](https://docs.polymarket.com/api-reference/data-api/overview)
- [PolyBolt WebSocket](https://docs.polymarket.com/api-reference/live-data/overview)
- [Polymarket trading fees](https://docs.polymarket.com/trading/fees)
- [Polymarket changelog](https://docs.polymarket.com/changelog)

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

// Portfolio: open orders and fills (CLOB), positions and value (Data API v2).
const { data: openOrders } = await clob.getOpenOrders();
const { data: positions } = await clob.getPositions();
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

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
