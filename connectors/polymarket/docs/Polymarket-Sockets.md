# Polymarket Sockets

Real-time WebSocket feeds, exported from `@tundraconnect/polymarket/sockets`
(and the package root). They are independent of the REST `Polymarket`
client: importing a socket never loads it.

| Socket                     | Feed                                                          | Credentials                               |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `PolymarketMarketSocket`   | CLOB market channel: books, level changes, trades, ticks      | none                                      |
| `PolymarketUserSocket`     | CLOB user channel: your orders and trades                     | CLOB API credentials                      |
| `PolymarketPriceSocket`    | PolyBolt: Chainlink/Pyth crypto, equities, TWAPs, top-of-book | CLOB API credentials for reference prices |
| `PolymarketLiveDataSocket` | Legacy real-time data socket: Chainlink and Binance crypto    | none                                      |

```ts
import { PolymarketMarketSocket } from '@tundraconnect/polymarket/sockets';

const socket = new PolymarketMarketSocket({ assetIds: ['<token id>'] });
for await (const event of socket) {
  switch (event.type) {
    case 'book': // full-depth snapshot
    case 'price_change': // every level change
      console.log(event.type, event.venueTimestamp, event.receivedAt);
      break;
    case 'connected':
      if (event.reconnected) console.warn('stale until the next book');
      break;
  }
}
```

## Events

Every socket is an async iterable. Iterating starts the connection
(or call `await socket.connect()` first); breaking out of the loop closes
it. Only one iterator may read a socket at a time.

Each event has a `type`, `receivedAt` (the local clock, read when the frame
arrived and before it was parsed) and, with `includeRaw: true`, `raw` — the
exact frame text. Venue events also carry `data` (Guardian-validated,
camelCased, every venue field kept) and `venueTimestamp` (the venue's own
time for the message, in milliseconds).

| Type               | Socket    | `data`                                                                 |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| `book`             | market    | `PolymarketBook` — every bid and ask level                             |
| `price_change`     | market    | `PolymarketPriceChange` — the changed levels (`size: 0` removes one)   |
| `tick_size_change` | market    | `PolymarketTickSizeChange`                                             |
| `last_trade_price` | market    | `PolymarketLastTradePrice` — one trade print                           |
| `best_bid_ask`     | market    | `PolymarketBestBidAsk`                                                 |
| `new_market`       | market    | `PolymarketNewMarket` (sent for every new market)                      |
| `market_resolved`  | market    | `PolymarketMarketResolved`                                             |
| `order`            | user      | `PolymarketUserOrder` — placement, update or cancellation              |
| `trade`            | user      | `PolymarketUserTrade` — once per status (MATCHED, MINED, CONFIRMED, …) |
| `price`            | price     | `PolymarketPriceUpdate` — a live point                                 |
| `price_snapshot`   | price     | `PolymarketPriceSnapshot` — the history sent per new subscription      |
| `best_bid_ask`     | price     | `PolymarketPriceBestBidAsk` (`price.polymarket`)                       |
| `price`            | live-data | `PolymarketLiveDataPrice`, with `source: 'chainlink' \| 'binance'`     |

Lifecycle events, on every socket:

| Type           | Meaning                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `connected`    | A connection opened and auth + subscriptions were sent. `reconnected: true` after the first. |
| `disconnected` | A connection ended; `reconnectInMs` says when the next attempt runs (absent: none will).     |
| `gap`          | A sequence jumped (`expected`/`received`) or the venue reported dropped frames (`missed`).   |
| `error`        | A venue error reply or a connection problem. `fatal: true` means the socket has closed.      |
| `invalid`      | A known message type that failed validation — delivered with `data` and the reason.          |
| `unknown`      | Valid JSON of a type the socket doesn't model.                                               |

Nothing is sampled, merged or de-duplicated: ten venue messages are ten
events. A batched frame (a JSON array) becomes one event per element.

## Reconnects, gaps and staleness

The sockets reconnect with jittered exponential backoff (1s doubling to 30s
by default; `reconnect: { initialDelayMs, maxDelayMs, maxAttempts,
healthyAfterMs }`, or `reconnect: false`) and resend auth and every current
subscription on each new connection.

The CLOB channels have no sequence numbers, so a `connected` event with
`reconnected: true` is the staleness signal: treat every book as stale until
its next `book` (the venue sends fresh ones on resubscribe), and reconcile
orders and trades over REST after a user-channel reconnect — the channel
does not replay what was missed. PolyBolt numbers each channel's frames;
a jump is a `gap`, and so is a non-zero `dropped` counter.

## Liveness

| Socket    | Heartbeat                    | Reconnects when                        |
| --------- | ---------------------------- | -------------------------------------- |
| market    | `PING` every 10s             | no frame (incl. `PONG`) for 30s        |
| user      | `PING` every 10s             | no frame for 30s                       |
| price     | `{ op: 'ping' }` every 15s   | no frame for 45s                       |
| live-data | `PING` every 5s (unanswered) | no price data for 30s while subscribed |

Override with `heartbeatIntervalMs`, `idleTimeoutMs` and `dataTimeoutMs`.
Every socket also takes `connectTimeoutMs` (abort a handshake that hasn't
completed, default 15000), `maxBufferedEvents` (unread-event cap; overflow
is a fatal error, never a silent drop), `clock`, `signal`, `reconnect` and
`webSocket`.
`dataTimeoutMs` counts data frames only — set it on a chatty market
subscription to catch a connection that answers heartbeats but has stopped
delivering data.

## Subscriptions

| Socket    | Add / remove                                                                 |
| --------- | ---------------------------------------------------------------------------- |
| market    | `subscribe(assetIds)` / `unsubscribe(assetIds)`                              |
| user      | `subscribe(conditionIds)` / `unsubscribe(conditionIds)` (none: every market) |
| price     | `subscribe(channel, filter)` / `unsubscribe(channel, filter)`                |
| live-data | `subscribe(source, symbols?)` / `unsubscribe(source, symbols?)`              |

All of them work before or while connected; the current set is replayed on
every reconnect. The market socket batches ids 100 per frame; PolyBolt
allows 64 subscriptions per connection.

## Credentials

`PolymarketUserSocket` and `PolymarketPriceSocket` take the same `auth`
object as the REST client and read `auth.apiCredentials` (the CLOB L2 key,
secret and passphrase — derive them once with
`Polymarket.deriveApiCredentials()`). Both venues authenticate by sending the
credentials themselves in a frame, so the secret must be held in memory as
plain text; an injected HMAC signer cannot stand in for it on these
channels.

## Runtimes

The sockets use only the global `WebSocket`, so they run on Deno, Bun,
Node 22+, browsers, Cloudflare Workers and a bare `deno_core` with the web
extensions. Pass a `webSocket: (url, { headers }) => WebSocket` factory to
supply your own implementation (a proxy, a test double).

## The legacy live-data socket

Polymarket has deprecated the legacy price topics in favour of PolyBolt.
PolyBolt serves Chainlink (and Pyth) but not Binance, so
`PolymarketLiveDataSocket` remains the only Polymarket source of its Binance
reference prices until those topics are switched off.

See [Errors](Polymarket-Errors.md) for the `SOCKET_*` codes and
[Schemas](Polymarket-Schemas.md) for the event payload schemas.

---

[← Back to Polymarket](../README.md)
