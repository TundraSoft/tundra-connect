# Binance

Typed [Binance.com](https://www.binance.com) spot market-data streams for
Deno, Bun, Node.js, browsers and Cloudflare Workers: every raw trade, best
bid/ask change and full-depth order-book diff over WebSocket, validated and
typed, with automatic reconnects and explicit gap detection. A lightweight
alternative to the official `binance-connector` WebSocket streams.

[![JSR](https://jsr.io/badges/@tundraconnect/binance)](https://jsr.io/@tundraconnect/binance)
[![JSR Score](https://jsr.io/badges/@tundraconnect/binance/score)](https://jsr.io/@tundraconnect/binance)

## Overview

`BinanceMarketSocket` (from `@tundraconnect/binance/sockets`, or the
package root) streams public spot market data — no API key:

- **`trade`** — `<symbol>@trade`, one event per individual trade (never
  aggregated): trade id, price, quantity, trade and event time,
  buyer-is-maker.
- **`bookTicker`** — `<symbol>@bookTicker`, the best bid and ask on every
  change.
- **`depth`** — `<symbol>@depth@100ms`, every order-book change in each
  100ms window at full depth, with the update-id range to keep a local book
  in sync.

```ts
import { BinanceMarketSocket } from '@tundraconnect/binance';

const socket = new BinanceMarketSocket({
  streams: { trade: ['BTCUSDT', 'ETHUSDT'], bookTicker: ['BTCUSDT'] },
});
for await (const event of socket) {
  if (event.type === 'trade') {
    console.log(event.data.symbol, event.data.price, event.data.tradeTime);
  }
}
```

It connects to the market-data-only host `data-stream.binance.vision` by
default (`host: 'stream'` selects `stream.binance.com:9443`), uses
combined streams so symbols can be added and removed while connected, and
paces its own frames under Binance's 5-messages-per-second limit. Binance
closes every connection after 24 hours; the socket reconnects, resubscribes
and reports it. A trade-id or depth update-id jump — including one across a
reconnect — is a `gap` event. A geo-blocked region (HTTP 451) is a fatal,
non-retried error instead of an endless reconnect loop.

The socket uses only the global `WebSocket`, so it runs anywhere one exists:
Deno, Bun, Node 22+, browsers, Cloudflare Workers and a bare `deno_core`
with the web extensions.

### Out of scope (for now)

- REST market data, account and order endpoints, and the user-data stream
  (listen key) — planned, and will be added to this package.
- USDⓈ-M / COIN-M futures streams, `@aggTrade`, the `@ticker`/`@miniTicker`
  1-second streams, and the partial-book `@depth5/10/20` streams.
- Binance.US, which runs on different hosts.

## Testing your code

Your tests don't need a network. Have your code take an
`AsyncIterable` of events and feed it a stand-in that yields shapes from
`@tundraconnect/binance/schemas`, or pass the socket a `webSocket` factory
that returns a test double:

```ts
import { BinanceError } from '@tundraconnect/binance/errors';

const blocked = new BinanceError('SOCKET_GEO_BLOCKED', {
  feed: 'binance-market',
  status: 451,
  url: 'wss://stream.binance.com:9443/stream',
});
console.log(blocked.code);
```

## Documentation

| Topic                                                                        | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [Sockets](https://github.com/TundraSoft/tundra-connect/wiki/Binance-Sockets) | The market-data socket and its events      |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Binance-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Binance-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [WebSocket Streams reference](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [Market-data-only endpoints](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/binance
```

**Bun:**

```sh
bunx jsr add @tundraconnect/binance
```

**Node.js:**

```sh
npx jsr add @tundraconnect/binance
```

## Quick Start

Record every BTC and ETH trade, and know when the record has a hole:

```ts
import { BinanceMarketSocket } from '@tundraconnect/binance/sockets';

const socket = new BinanceMarketSocket({
  streams: { trade: ['BTCUSDT', 'ETHUSDT'], depth: ['BTCUSDT'] },
  includeRaw: true, // keep the exact frame text for storage
  signal: AbortSignal.timeout(60_000),
});

for await (const event of socket) {
  switch (event.type) {
    case 'trade':
      // event.raw is the frame exactly as received; event.data is typed.
      console.log(event.receivedAt, event.data.tradeId, event.data.price);
      break;
    case 'depthUpdate':
      console.log(event.data.firstUpdateId, event.data.finalUpdateId);
      break;
    case 'gap':
      console.warn(
        `${event.stream}: expected ${event.expected}, got ${event.received}`,
      );
      break;
    case 'connected':
      if (event.reconnected) console.warn('reconnected — data may be missing');
      break;
    case 'error':
      if (event.fatal) throw event.error;
  }
}
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
