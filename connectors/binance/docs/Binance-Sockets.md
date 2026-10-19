# Binance Sockets

`BinanceMarketSocket` streams Binance.com spot market data over WebSocket.
It is exported from `@tundraconnect/binance/sockets` and the package root.

```ts
import { BinanceMarketSocket } from '@tundraconnect/binance/sockets';

const socket = new BinanceMarketSocket({
  streams: { trade: ['BTCUSDT'], bookTicker: ['BTCUSDT'], depth: ['BTCUSDT'] },
});
socket.subscribe('trade', ['SOLUSDT', 'XRPUSDT']);
for await (const event of socket) console.log(event.type);
```

## Options

| Option                | Default         | Meaning                                                                                   |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `streams`             | none            | Streams to open from the start: `{ trade?, bookTicker?, depth? }` symbol lists.           |
| `host`                | `'data-stream'` | `'data-stream'` (`data-stream.binance.vision`) or `'stream'` (`stream.binance.com:9443`). |
| `timeUnit`            | `'MILLISECOND'` | `'MICROSECOND'` for microsecond `E`/`T` timestamps.                                       |
| `url`                 | from `host`     | Any combined-stream URL (a proxy, a mock server).                                         |
| `includeRaw`          | `false`         | Attach the exact frame text to every event as `raw`.                                      |
| `clock`               | `Date.now`      | Source of `receivedAt`, read on arrival before parsing.                                   |
| `reconnect`           | 1s → 30s        | `{ initialDelayMs, maxDelayMs, maxAttempts, healthyAfterMs }`, or `false`.                |
| `connectTimeoutMs`    | `15000`         | Abort a handshake that hasn't completed in this long (then retry with backoff).           |
| `heartbeatIntervalMs` | `20000`         | How often `LIST_SUBSCRIPTIONS` is sent as a liveness probe.                               |
| `idleTimeoutMs`       | `60000`         | Reconnect when no frame at all arrives for this long.                                     |
| `dataTimeoutMs`       | off             | Reconnect when no market data arrives for this long while subscribed.                     |
| `maxBufferedEvents`   | unlimited       | Unread-event cap; overflowing it is a fatal error, never a silent drop.                   |
| `signal`              | none            | Aborting it closes the socket.                                                            |
| `webSocket`           | global          | `(url, { headers }) => WebSocket` factory.                                                |

Symbols are accepted as `BTCUSDT`, `btcusdt`, `BTC-USDT` or `btc_usdt`.

## Subscriptions

`subscribe(kind, symbols)` and `unsubscribe(kind, symbols)`, where `kind` is
`'trade'`, `'bookTicker'` or `'depth'`. They work before or while connected;
the current set (`socket.streams`) is resubscribed on every reconnect.
Frames are sent 250ms apart (Binance allows 5 incoming messages per second
per connection) with up to 100 streams per `SUBSCRIBE`. A connection holds
at most 1024 streams.

## Events

| Type          | `data`               | `venueTimestamp`          |
| ------------- | -------------------- | ------------------------- |
| `trade`       | `BinanceTrade`       | trade time (`T`)          |
| `bookTicker`  | `BinanceBookTicker`  | none (spot sends no time) |
| `depthUpdate` | `BinanceDepthUpdate` | event time (`E`)          |

Each also has `stream` (e.g. `btcusdt@depth@100ms`) and `receivedAt`.
Lifecycle events:

| Type           | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `connected`    | A connection opened and subscriptions were sent. `reconnected: true` after the first.                      |
| `disconnected` | A connection ended (including Binance's 24-hour cut-off); `reconnectInMs` says when the next attempt runs. |
| `gap`          | A trade id (per symbol) or depth update id jumped: `expected` vs `received`.                               |
| `error`        | A Binance error reply (`venueCode`) or a connection problem. `fatal: true`: closed.                        |
| `invalid`      | A known message that failed validation — delivered with `data` and the reason.                             |
| `unknown`      | A message the socket doesn't model.                                                                        |

Nothing is aggregated, sampled or de-duplicated.

## Keeping a local order book

The depth stream sends changes only. Fetch a REST snapshot
(`GET /api/v3/depth?symbol=BTCUSDT&limit=5000`), drop buffered
`depthUpdate`s whose `finalUpdateId` is at or below the snapshot's
`lastUpdateId`, then apply the rest in order. A `quantity` of `0` removes a
level. On a `gap` for that stream — or a reconnect — the book is stale:
rebuild it from a fresh snapshot. Trade and depth ids are global, so the
socket keeps tracking them across reconnects and reports the jump.

## Liveness and geo-blocking

Binance pings every 20 seconds at the WebSocket level; the runtime answers
but cannot report it. The socket sends `LIST_SUBSCRIPTIONS` as a probe and
reconnects when nothing comes back. Set `dataTimeoutMs` on chatty pairs to
also catch a connection that answers but has stopped delivering data.

When the handshake fails, the socket asks the same host over `fetch`; an
HTTP 451 or 403 means the region is blocked, which is reported as a fatal
`SOCKET_GEO_BLOCKED` error instead of being retried. Try the other `host`,
or a permitted location.

See [Errors](Binance-Errors.md) for the codes and
[Schemas](Binance-Schemas.md) for the payload schemas.

---

[← Back to Binance](../README.md)
