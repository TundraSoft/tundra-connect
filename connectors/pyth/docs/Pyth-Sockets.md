# Pyth Sockets

`PythProSocket` streams Pyth Pro (formerly Pyth Lazer) prices from every
redundant endpoint at once. It is exported from `@tundraconnect/pyth/sockets`
and the package root.

## Options

| Option              | Default              | Meaning                                                                                                |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `auth`              | required             | `{ type: 'BEARER', token }` — the access token from your Pyth Pro distributor.                         |
| `endpoints`         | `PYTH_PRO_ENDPOINTS` | The three documented `wss://pyth-lazer-{0,1,2}.dourolabs.app/v1/stream` endpoints.                     |
| `authTransport`     | `'subprotocol'`      | `'subprotocol'` (`pyth-lazer-auth, <token>`, every runtime) or `'header'` (`Authorization: Bearer`).   |
| `channel`           | `'real_time'`        | Default channel: `real_time`, `fixed_rate@50ms`, `fixed_rate@200ms`, `fixed_rate@1000ms`.              |
| `subscriptions`     | none                 | Subscriptions to open from the start.                                                                  |
| `emitDuplicates`    | `false`              | Emit every endpoint's copy of an update, not just the first.                                           |
| `dedupeWindowMs`    | `60000`              | How long an update's identity is remembered for merging.                                               |
| `includeRaw`        | `false`              | Attach the exact frame text as `raw`.                                                                  |
| `clock`             | `Date.now`           | Source of `receivedAt`, read on arrival before parsing.                                                |
| `reconnect`         | 1s → 30s             | Per-endpoint `{ initialDelayMs, maxDelayMs, maxAttempts, healthyAfterMs }`, or `false`.                |
| `dataTimeoutMs`     | `5000`               | Reconnect an endpoint whose subscribed stream sends nothing for this long.                             |
| `connectTimeoutMs`  | `15000`              | Abort an endpoint's handshake that hasn't completed in this long (then retry with backoff).            |
| `idleTimeoutMs`     | off                  | Also reconnect an endpoint when no frame at all arrives for this long.                                 |
| `maxBufferedEvents` | unlimited            | Per-endpoint unread-event cap; overflowing it is a fatal error for that endpoint, never a silent drop. |
| `signal`            | none                 | Aborting it closes every endpoint.                                                                     |
| `webSocket`         | global               | A `(url, { headers })` factory; it receives `Authorization: Bearer <token>` to apply itself.           |

## Subscriptions

`subscribe({ priceFeedIds?, symbols?, properties?, channel?, formats?,
jsonBinaryEncoding?, ignoreInvalidFeedIds? })` returns the subscription id;
`unsubscribe(id)` removes it. Both reach every endpoint, and the current set
is replayed on every reconnect. Defaults: every property in
`PYTH_PRO_PROPERTIES`, the socket's channel, `formats: []` (parsed JSON
only), and `ignoreInvalidFeedIds: true` — unknown or unsupported feeds are
listed on the `subscribed` event instead of failing the subscription. Each
feed supports its own minimum channel and anything slower.

## Events

| Type                                                       | Meaning                                                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price`                                                    | One feed's update: `data` (`PythPriceFeedUpdate`), `timestampUs`, `subscriptionId`, `endpoint`, `receivedAt`, `duplicate`, `firstSeen` (on a copy). |
| `signed_update`                                            | The signed payloads (`evm`, `solana`, …) of one update, when the subscription asks for `formats`.                                                   |
| `subscribed`                                               | One endpoint acknowledged a subscription (`data.ignoredInvalidFeedIds` lists skipped feeds).                                                        |
| `unsubscribed`                                             | One endpoint confirmed an unsubscribe.                                                                                                              |
| `health`                                                   | The overall state changed: `up`, `degraded`, or `down` (stale), with `endpointsUp` / `endpointsTotal`.                                              |
| `gap`                                                      | A fixed-rate tick no endpoint delivered: `expected`, `received`, `missed` (Unix µs).                                                                |
| `connected`, `disconnected`, `error`, `invalid`, `unknown` | One endpoint's lifecycle, tagged with `endpoint`. A `subscriptionError` or `error` reply is an `error` event with `SOCKET_VENUE_ERROR`.             |

Prices are mantissas: the real price is `price × 10^exponent`, and
`price`, `bestBidPrice`, `bestAskPrice` and `emaPrice` stay exact strings
because they are i64. `feedUpdateTimestamp` earlier than `timestampUs` means
the price was carried forward rather than generated in this update.

## Merging and duplicates

Every endpoint delivers the same updates. The socket keys each feed's update
by `priceFeedId:timestampUs` and emits the first arrival only; later copies
are dropped — or, with `emitDuplicates: true`, emitted with `duplicate:
true` and `firstSeen: { endpoint, receivedAt }`, which shows how far behind
each endpoint ran. Nothing else is merged, sampled or dropped.

## Health and staleness

Each endpoint reconnects on its own. While at least one is up the stream
keeps flowing and `health` is `degraded`; only when every endpoint is down
is it `down`, and the market data stale until one returns.

The server pings at the WebSocket level, which the runtime answers but
cannot report, so liveness is judged by data: a subscribed endpoint that
sends nothing for `dataTimeoutMs` is reconnected.

---

[← Back to Pyth](../README.md)
