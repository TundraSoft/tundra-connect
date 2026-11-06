# Deribit

Typed [Deribit](https://www.deribit.com) market-data client for Deno, Bun,
Node.js, browsers and Cloudflare Workers: option-chain discovery, book
summaries, tickers, order-book snapshots and historical trades over REST,
plus a JSON-RPC WebSocket feed (`./sockets`) of order books with
`change_id` gap detection, every trade, tickers with mark IV and greeks,
DVOL, price indices and option mark prices.

[![JSR](https://jsr.io/badges/@tundraconnect/deribit)](https://jsr.io/@tundraconnect/deribit)
[![JSR Score](https://jsr.io/badges/@tundraconnect/deribit/score)](https://jsr.io/@tundraconnect/deribit)

## Overview

```ts
import { Deribit } from '@tundraconnect/deribit';

const deribit = new Deribit();
const expiries = await deribit.getExpirations({
  currency: 'BTC',
  kind: 'option',
});
const nearest = expiries.btc?.option?.[0];
const chain = await deribit.getOptionChain({
  currency: 'BTC',
  expiry: nearest,
});
const marks = await deribit.getBookSummaryByCurrency({
  currency: 'BTC',
  kind: 'option',
});
console.log(nearest, chain.length, marks.find((m) => m.markIv)?.markIv);
```

**REST** (`Deribit`): instruments, expiries and the option chain by
currency and expiry; book summaries (mark price, mark IV, open interest);
tickers (greeks, bid/ask IV); order-book snapshots; trades by currency or
instrument, by time, id or sequence — including the full archive on
history.deribit.com (`source: 'history'`); the price index and DVOL
candles; and `call()` for any other public method, returning the whole
JSON-RPC envelope with Deribit's `usIn`/`usOut` microsecond timing.

**Sockets** (`DeribitSocket`, from `@tundraconnect/deribit/sockets`):

| Subscription                                   | Channel                               | Events                                             |
| ---------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `{ kind: 'book', instrument }`                 | `book.<instrument>.<interval>`        | `book` (snapshot, then every change at full depth) |
| `{ kind: 'trades', instrument }`               | `trades.<instrument>.<interval>`      | `trade`, one per trade                             |
| `{ kind: 'trades', instrumentKind, currency }` | `trades.<kind>.<currency>.<interval>` | `trade`, one per trade                             |
| `{ kind: 'ticker', instrument }`               | `ticker.<instrument>.<interval>`      | `ticker` (mark IV, greeks)                         |
| `{ kind: 'volatilityIndex', index }`           | `deribit_volatility_index.<index>`    | `volatilityIndex` (DVOL)                           |
| `{ kind: 'priceIndex', index }`                | `deribit_price_index.<index>`         | `priceIndex`                                       |
| `{ kind: 'markPrice', index }`                 | `markprice.options.<index>`           | `markPrice`, one per option                        |
| `{ channel }`                                  | anything else                         | `unknown`                                          |

**Lowest grain.** Nothing is sampled or merged: each trade of a batched
notification is its own event, each book change arrives at full depth, and
each option mark is delivered. A book change whose `prev_change_id` isn't
the previous `change_id` is a `gap` event, and so is a jump in a trade's
per-instrument `trade_seq` (also across a reconnect); the socket never
resyncs on its own — rebuild from `getOrderBook()` or backfill trades with
`getLastTradesByInstrument({ startSeq, endSeq })`. Every event carries
`receivedAt`, Deribit's own `venueTimestamp`, and `raw` (the exact frame)
with `includeRaw`. Integers wider than 2^53 — `starbaseMatchId` and the
nanosecond `starbaseTimestamp` on every trade — keep all their digits as
strings, over REST and the socket; `JSON.parse` would round them.

**Raw channels need auth.** Deribit's unthrottled `raw` channels are only
served to an authenticated connection; without one it refuses them with
error `13778 raw_subscriptions_not_available_for_unauthorized` (verified
2026-11-06). With the default `interval: 'finest'`, the socket subscribes
to `raw` when `auth` is configured and to the `100ms` channels otherwise —
those batch updates into 100ms notifications but drop no book change or
trade. The socket answers Deribit's heartbeat `test_request`, refreshes
the token before it expires, and re-authenticates and resubscribes after
every reconnect.

The REST client and the socket use only `fetch` and the global
`WebSocket`, so they run on Deno, Bun, Node 22+, browsers, Cloudflare
Workers and plain V8.

### Out of scope (for now)

- Private endpoints: orders, positions, account and wallet.
- `book.<instrument>.<group>.<depth>.<interval>` grouped books (subscribe
  with `{ channel }` to receive them as `unknown`), `chart.trades`,
  `perpetual`, `quote` and `incremental_ticker` channels.

## Getting a read-only API key

Most market data needs no key: every REST method here and the `100ms`
socket channels work anonymously. A key only unlocks the `raw` channels.

**Testnet** (recommended for development and CI):

1. Create an account at <https://test.deribit.com>. It is a separate
   account from production — nothing (logins, balances, keys) is shared
   — and Deribit asks you not to upload identity documents there:
   verification isn't required on testnet.
2. Open **Account → API** and choose **Add new key**.
3. Give it read scopes only (`account:read`, `trade:read`,
   `wallet:read`, ...) and nothing ending in `:read_write` — no trading,
   wallet or withdrawal permissions. Market data needs no more.
4. Copy the **Client ID** and **Client Secret**. The secret is shown
   only once.

A testnet key only authenticates against testnet
(`environment: 'testnet'`, `wss://test.deribit.com/ws/api/v2`); testnet
prices aren't real, but authentication and channels behave the same.

**Production** (www.deribit.com): the same steps on the live site. Deribit
requires identity verification (KYC) on production accounts before
deposits and trading, and doesn't serve some jurisdictions — check its
terms for eligibility first. For a host with a fixed IP, add an IP
allow-list to the key.

Use the key as `client_credentials`:

```ts
import { DeribitSocket } from '@tundraconnect/deribit/sockets';

const socket = new DeribitSocket({
  environment: 'testnet',
  auth: {
    type: 'CUSTOM',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
  },
  subscriptions: [{ kind: 'book', instrument: 'BTC-PERPETUAL' }],
});
console.log(socket.interval); // 'raw'
```

**Live tests** read `CONNECTOR_DERIBIT_CLIENT_ID`,
`CONNECTOR_DERIBIT_CLIENT_SECRET` and `CONNECTOR_DERIBIT_ENVIRONMENT`
(`testnet` or `production`, default `production` — set `testnet` for a
testnet key): from a local, gitignored `.env` (see the repository's
`.env.sample`), or the GitHub Actions secrets of the same names in CI. The
public REST and `100ms` socket tests need no key and run with
`LIVE_TEST_PUBLIC` / `LIVE_TEST_SOCKETS`.

## Documentation

| Topic                                                                        | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Deribit-API)         | REST client configuration and methods      |
| [Sockets](https://github.com/TundraSoft/tundra-connect/wiki/Deribit-Sockets) | The WebSocket feed, its events and gaps    |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Deribit-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Deribit-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [API documentation](https://docs.deribit.com/)
- [Creating an API key](https://docs.deribit.com/articles/creating-api-key)
  and [access scopes](https://docs.deribit.com/articles/access-scope)
- [Testnet](https://test.deribit.com)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/deribit
```

**Bun:**

```sh
bunx jsr add @tundraconnect/deribit
```

**Node.js:**

```sh
npx jsr add @tundraconnect/deribit
```

## Quick Start

Price a BTC daily bracket from the nearest expiry's option IVs, and record
DVOL and the index while you do:

```ts
import { Deribit } from '@tundraconnect/deribit';
import { DeribitSocket } from '@tundraconnect/deribit/sockets';

const deribit = new Deribit();
const nearest =
  (await deribit.getExpirations({ currency: 'BTC', kind: 'option' }))
    .btc?.option?.[0];
const chain = await deribit.getOptionChain({
  currency: 'BTC',
  expiry: nearest,
});

const socket = new DeribitSocket({
  includeRaw: true,
  subscriptions: [
    ...chain.map((o) => ({
      kind: 'ticker' as const,
      instrument: o.instrumentName,
    })),
    { kind: 'volatilityIndex', index: 'btc_usd' },
    { kind: 'priceIndex', index: 'btc_usd' },
  ],
  signal: AbortSignal.timeout(60_000),
});

for await (const event of socket) {
  switch (event.type) {
    case 'ticker':
      console.log(
        event.data.instrumentName,
        event.data.markIv,
        event.data.greeks?.delta,
        event.receivedAt,
      );
      break;
    case 'volatilityIndex':
      console.log('DVOL', event.data.volatility);
      break;
    case 'gap':
      console.warn(
        `${event.stream}: expected ${event.expected}, got ${event.received}`,
      );
      break;
    case 'error':
      if (event.fatal) throw event.error;
  }
}
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
