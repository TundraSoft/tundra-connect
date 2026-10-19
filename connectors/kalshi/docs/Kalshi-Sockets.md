# Kalshi Sockets

Kalshi's real-time WebSocket feed, exported from
`@tundraconnect/kalshi/sockets` (and the package root). `KalshiSocket` is
independent of the REST `Kalshi` client: importing it never loads it.

```ts
import { KalshiSocket } from '@tundraconnect/kalshi/sockets';

const socket = new KalshiSocket({
  auth: { accessKey: '<key id>', privateKeyPem: '<PKCS#8 PEM>' },
  subscriptions: [
    { channel: 'orderbook_delta', marketTickers: ['KXBTCD-25DEC31-T100000'] },
    { channel: 'trade' },
    { channel: 'fill' },
    { channel: 'user_orders' },
  ],
});
for await (const event of socket) {
  if (event.type === 'orderbook_delta') {
    console.log(event.seq, event.data.delta);
  }
  if (event.type === 'gap') socket.requestSnapshot(['KXBTCD-25DEC31-T100000']);
}
```

## Connection and credentials

Every Kalshi WebSocket connection is signed, even for public channels. The
handshake carries `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP` and
`KALSHI-ACCESS-SIGNATURE` — RSA-PSS-SHA256 over
`{timestampMs}GET/trade-api/ws/v2`, rebuilt for every reconnect.

`auth` takes the same object as the REST client (`accessKey` +
`privateKeyPem`), or `accessKey` + `signer`, where
`signer.sign(message: string): Promise<string>` returns the base64
signature — so the private key can stay outside JavaScript (a native
signer, an HSM).

| URL constant         | Host                                                         |
| -------------------- | ------------------------------------------------------------ |
| `KALSHI_WS_URL`      | `wss://external-api-ws.kalshi.com/trade-api/ws/v2` (default) |
| `KALSHI_DEMO_WS_URL` | `wss://external-api-ws.demo.kalshi.co/trade-api/ws/v2`       |

Pass `url` to choose. Signing the handshake needs a WebSocket that can send
headers: Deno, Bun and Node do (`new WebSocket(url, { headers })`); in a
browser or Cloudflare Worker pass a `webSocket: (url, { headers }) =>
WebSocket` factory that can.

## Subscriptions

`subscribe(channel, marketTickers?)` — omit the tickers for every market.
Each channel is one Kalshi subscription (one `sid`); calling `subscribe`
again with more tickers adds them to it (`update_subscription` /
`add_markets`), and `unsubscribe(channel, marketTickers?)` removes tickers
or the whole channel. The current set is replayed on every reconnect.
`requestSnapshot(marketTickers)` asks for fresh `orderbook_snapshot`s
without changing the subscription.

## Events

Venue events carry `data` (Guardian-validated; fixed-point fields become
numbers, named as in the REST schemas — `count_fp` → `count`,
`yes_price_dollars` → `yesPrice`; every other field camelCased and kept),
the envelope's `sid`, `seq` and `sendingTsMs`, and `venueTimestamp`
(`ts_ms` where the message has one, else `sending_ts_ms`).

| Type                 | Channel            | `data`                                                 |
| -------------------- | ------------------ | ------------------------------------------------------ |
| `orderbook_snapshot` | `orderbook_delta`  | `KalshiOrderbookSnapshot` — every YES and NO bid level |
| `orderbook_delta`    | `orderbook_delta`  | `KalshiOrderbookDelta` — a signed change at one level  |
| `trade`              | `trade`            | `KalshiFeedTrade` — one public print                   |
| `ticker`             | `ticker`           | `KalshiFeedTicker`                                     |
| `fill`               | `fill`             | `KalshiFeedFill` — one of your fills                   |
| `user_order`         | `user_orders`      | `KalshiFeedUserOrder`                                  |
| `market_position`    | `market_positions` | `KalshiFeedMarketPosition`                             |

Messages of other channels (`market_lifecycle_v2`, `communications`, …)
arrive as `unknown` events with the whole frame. Every event has
`receivedAt` (the local clock, read on arrival before parsing) and, with
`includeRaw: true`, `raw` — the exact frame text. Lifecycle events:

| Type           | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `connected`    | A connection opened and subscriptions were sent. `reconnected: true` after the first.         |
| `disconnected` | A connection ended; `reconnectInMs` says when the next attempt runs (absent: none will).      |
| `gap`          | A `seq` jumped (`expected`/`received`).                                                       |
| `error`        | A Kalshi `error` frame (`venueCode`) or a connection problem. `fatal: true`: closed for good. |
| `invalid`      | A known message type that failed validation — delivered with `data` and the reason.           |
| `unknown`      | A message of a type the socket doesn't model.                                                 |

Nothing is sampled, merged or de-duplicated: every snapshot, delta, trade
and fill is its own event.

## Sequence gaps

`seq` counts per `sid` and restarts with every connection. A jump is a
`gap` event (`stream: 'sid:<n>'`); the socket does not resync on its own —
call `requestSnapshot()` and treat the market as stale until the snapshot
arrives. After a reconnect (`connected` with `reconnected: true`) the venue
sends fresh snapshots for the resubscribed markets.

## Liveness

Kalshi pings every 10 seconds at the WebSocket level; the runtime answers
but cannot report it. The socket therefore sends `list_subscriptions` every
15 seconds and reconnects when no frame arrives for 45 seconds
(`heartbeatIntervalMs`, `idleTimeoutMs`). `dataTimeoutMs` additionally
reconnects a subscribed connection that stops delivering data.

See [Errors](Kalshi-Errors.md) for the `SOCKET_*` codes and
[Schemas](Kalshi-Schemas.md) for the payload schemas.

---

[← Back to Kalshi](../README.md)
