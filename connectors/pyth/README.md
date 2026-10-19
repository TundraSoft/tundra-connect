# Pyth

Typed [Pyth Pro](https://docs.pyth.network/price-feeds/pro) (formerly Pyth
Lazer) price stream for Deno, Bun, Node.js, browsers and Cloudflare Workers:
connects to all of Pyth Pro's redundant WebSocket endpoints at once and
merges them into one Guardian-validated stream of real-time prices, with
per-endpoint health and gap detection. An alternative to the official
`@pythnetwork/pyth-lazer-sdk` stream client.

[![JSR](https://jsr.io/badges/@tundraconnect/pyth)](https://jsr.io/@tundraconnect/pyth)
[![JSR Score](https://jsr.io/badges/@tundraconnect/pyth/score)](https://jsr.io/@tundraconnect/pyth)

## Overview

`PythProSocket` (from `@tundraconnect/pyth/sockets`, or the package root):

- **All three endpoints at once** — Pyth says to connect to every one,
  because each restarts briefly during deployments. Each connection has its
  own reconnect, backoff and liveness; every subscription change goes to all
  of them.
- **One merged stream** — a feed's update is identified by `priceFeedId` +
  `timestampUs`, and the first endpoint to deliver it wins. Each `price`
  event says which `endpoint` that was and when it arrived (`receivedAt`,
  read before parsing). `emitDuplicates: true` emits every endpoint's copy
  instead — tagged with the first copy's arrival — for latency research.
- **Lowest grain by default** — the `real_time` channel and every price
  property (`price`, `bestBidPrice`, `bestAskPrice`, `confidence`,
  `exponent`, `publisherCount`, EMA, funding, `marketSession`,
  `feedUpdateTimestamp`). i64 mantissas stay exact strings.
- **Health** — `connected`/`disconnected`/`error` per endpoint, plus
  `health` events and a `health` getter: `up`, `degraded` (some endpoints
  down, still streaming) or `down` (none — the stream is stale).
- **Gaps** — on fixed-rate channels a tick that no endpoint delivered is a
  `gap` event.

```ts
import { PythProSocket } from '@tundraconnect/pyth';

const socket = new PythProSocket({
  auth: { type: 'BEARER', token: '<access token>' },
  subscriptions: [{ symbols: ['Crypto.BTC/USD', 'Crypto.ETH/USD'] }],
});
for await (const event of socket) {
  if (event.type === 'price') {
    const { priceFeedId, price, exponent } = event.data;
    console.log(priceFeedId, price, exponent, event.endpoint);
  }
}
```

The token comes from a Pyth Pro distributor. By default it travels as the
`pyth-lazer-auth` WebSocket subprotocol, which works on every runtime —
browsers and Workers included; `authTransport: 'header'` sends
`Authorization: Bearer` instead. It is never logged or put in an error.

### Out of scope (for now)

- Hermes (Pyth Core) REST and streaming — planned for this package.
- The Pyth Pro HTTP API (latest price, historical price, symbols) and
  on-chain verification of the signed payloads (they are delivered, not
  verified).

## Testing your code

Have your code take an `AsyncIterable` of events and feed it a stand-in that
yields shapes from `@tundraconnect/pyth/schemas`, or pass `webSocket` a
factory that returns a test double:

```ts
import { PythError } from '@tundraconnect/pyth/errors';

const missing = new PythError('SOCKET_MISSING_CREDENTIALS');
console.log(missing.code);
```

## Documentation

| Topic                                                                     | Description                                |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| [Sockets](https://github.com/TundraSoft/tundra-connect/wiki/Pyth-Sockets) | The Pyth Pro socket and its events         |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Pyth-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Pyth-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Pyth Pro WebSocket API](https://docs.pyth.network/price-feeds/pro/api/websocket)
- [Subscribe to prices](https://docs.pyth.network/price-feeds/pro/subscribe-to-prices)
- [Payload reference](https://docs.pyth.network/price-feeds/pro/payload-reference)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/pyth
```

**Bun:**

```sh
bunx jsr add @tundraconnect/pyth
```

**Node.js:**

```sh
npx jsr add @tundraconnect/pyth
```

## Quick Start

Record every BTC/USD print with the endpoint that delivered it first, and
know when the stream was stale:

```ts
import { PythProSocket } from '@tundraconnect/pyth/sockets';

const socket = new PythProSocket({
  auth: { type: 'BEARER', token: '<access token>' },
  subscriptions: [{ symbols: ['Crypto.BTC/USD'] }],
  includeRaw: true, // keep the exact frame text
  signal: AbortSignal.timeout(60_000),
});

for await (const event of socket) {
  switch (event.type) {
    case 'price':
      console.log(
        event.timestampUs,
        event.data.price,
        event.endpoint,
        event.receivedAt,
      );
      break;
    case 'health':
      console.log(
        `health: ${event.state} (${event.endpointsUp}/${event.endpointsTotal})`,
      );
      break;
    case 'error':
      if (event.fatal) console.error(event.endpoint, event.error.message);
      break;
  }
}
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
