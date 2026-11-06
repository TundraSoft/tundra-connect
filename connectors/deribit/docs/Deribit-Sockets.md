# Deribit Sockets

`DeribitSocket` (from `@tundraconnect/deribit/sockets`, which doesn't load
the REST client) streams Deribit's JSON-RPC subscriptions as one async
iterator.

```ts
import { DeribitSocket } from '@tundraconnect/deribit/sockets';

const socket = new DeribitSocket({
  subscriptions: [
    { kind: 'book', instrument: 'BTC-PERPETUAL' },
    { kind: 'trades', instrumentKind: 'option', currency: 'BTC' },
    { kind: 'markPrice', index: 'btc_usd' },
  ],
  includeRaw: true,
});
for await (const event of socket) {
  if (event.type === 'book') console.log(event.data.type, event.data.changeId);
  if (event.type === 'trade') {
    console.log(event.data.instrumentName, event.data.iv);
  }
  if (event.type === 'gap') {
    console.warn(event.stream, event.expected, event.received);
  }
}
```

## Options

Every `FeedSocketOptions` field (`url`, `signal`, `includeRaw`, `clock`,
`webSocket`, `reconnect`, `connectTimeoutMs`, `idleTimeoutMs`,
`dataTimeoutMs`, `maxBufferedEvents`), plus:

| Option             | Type                                         | Default        | Description                                                                        |
| ------------------ | -------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `environment`      | `'production' \| 'testnet'`                  | `'production'` | `wss://www.deribit.com/ws/api/v2` or the testnet host.                             |
| `auth`             | `{ type: 'CUSTOM', clientId, clientSecret }` | —              | `client_credentials`; needed for `raw`. Never readable back.                       |
| `interval`         | `'finest' \| 'raw' \| '100ms' \| 'agg2'`     | `'finest'`     | `finest` = `raw` with auth, `100ms` without. `raw` without auth is a config error. |
| `subscriptions`    | `DeribitSubscription[]`                      | `[]`           | Opened on every connection.                                                        |
| `heartbeatSeconds` | `number` (10–3600)                           | `10`           | `public/set_heartbeat` interval.                                                   |
| `authTimeoutMs`    | `number`                                     | `10000`        | Reconnect when `public/auth` goes unanswered.                                      |

`idleTimeoutMs` defaults to three heartbeat intervals. `subscribe()` and
`unsubscribe()` change the set on an open connection; `channels` lists it.

## Events

| Event                         | Data                              | Notes                                                               |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `book`                        | `DeribitBookUpdateSchema`         | `type: 'snapshot'` first, then `'change'` with `prevChangeId`.      |
| `trade`                       | `DeribitTradeSchema`              | One per trade; `tradeSeq` is per-instrument and consecutive.        |
| `ticker`                      | `DeribitTickerSchema`             | Mark/bid/ask IV (%), `greeks`, underlying, funding for perpetuals.  |
| `volatilityIndex`             | `DeribitVolatilityIndexSchema`    | DVOL.                                                               |
| `priceIndex`                  | `DeribitPriceIndexSchema`         |                                                                     |
| `markPrice`                   | `DeribitMarkPriceSchema`          | One per option; `iv` is a fraction (0.3965), unlike the ticker's %. |
| `subscribed` / `unsubscribed` | `channels`                        | Deribit's confirmation.                                             |
| `authenticated`               | `scope`, `expiresIn`, `refreshed` | After every (re)connect and token refresh.                          |

Data events carry `channel`, `receivedAt` (taken before parsing),
`venueTimestamp` (Deribit's `timestamp`) and, with `includeRaw`, `raw`.
Lifecycle events are the shared ones: `connected` (`reconnected`),
`disconnected`, `gap`, `error`, `invalid` (a modelled message that failed
validation, with the reason) and `unknown` (anything unmodelled).

## Gaps

- **Books:** a `change` whose `prevChangeId` isn't the last `changeId`
  seen on that channel is a `gap` with `stream` = the channel, `expected`
  = the last `changeId`, `received` = the `prevChangeId`. A reconnect
  resubscribes and Deribit sends a fresh snapshot, which restarts the
  chain (the `connected` event's `reconnected: true` marks the outage).
- **Trades:** a jump in `tradeSeq` is a `gap` with `stream` =
  `<channel>|<instrument>`; it is also reported across a reconnect.
  Backfill with `Deribit.getLastTradesByInstrument({ startSeq, endSeq })`.

The socket never resyncs on its own.

## Auth and liveness

With `auth`, the socket sends `public/auth` first and subscribes (with
`private/subscribe`) only once it's answered. A refused key is a fatal
`SOCKET_AUTH_FAILED` — no reconnect loop. The token is refreshed at 80% of
`expires_in` with the refresh token; if that is refused, the socket
reconnects and authenticates with the key again. Deribit's heartbeat
`test_request` is answered with `public/test`; a connection silent past
`idleTimeoutMs` is reconnected.

A refused subscription (e.g. `13778` for `raw` without auth) is a
non-fatal `SOCKET_SUBSCRIBE_FAILED` error carrying `vendorCode` and
`channels`.
