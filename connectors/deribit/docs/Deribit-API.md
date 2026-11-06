# Deribit API

## Configuration

```ts
import { Deribit } from '@tundraconnect/deribit';

const deribit = new Deribit({ environment: 'production', timeout: 30 });
console.log(deribit.environment);
```

| Option         | Type                        | Default         | Description                                                         |
| -------------- | --------------------------- | --------------- | ------------------------------------------------------------------- |
| `environment`  | `'production' \| 'testnet'` | `'production'`  | `www.deribit.com` or `test.deribit.com`.                            |
| `baseURL`      | `string`                    | per environment | Override the REST base URL.                                         |
| `timeout`      | `number` (seconds)          | `30`            | Per-request timeout.                                                |
| `maxRetryWait` | `number` (seconds)          | —               | Opt into RESTler's single retry on a 429 with a `Retry-After` hint. |

The REST client covers public methods only and takes no credentials.

## Methods

| Method                                          | Deribit method                                  | Result                                     |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `getInstruments({ currency, kind?, expired? })` | `public/get_instruments`                        | `DeribitInstrumentSchema[]`                |
| `getInstrument(name)`                           | `public/get_instrument`                         | `DeribitInstrumentSchema`                  |
| `getExpirations({ currency, kind })`            | `public/get_expirations`                        | `{ btc: { option: ['7NOV26', ...] } }`     |
| `getOptionChain({ currency, expiry? })`         | `public/get_instruments` (`kind: option`)       | Options of one expiry (code or ms), or all |
| `getBookSummaryByCurrency({ currency, kind? })` | `public/get_book_summary_by_currency`           | `DeribitBookSummarySchema[]`               |
| `getBookSummaryByInstrument(name)`              | `public/get_book_summary_by_instrument`         | `DeribitBookSummarySchema[]`               |
| `getTicker(name)`                               | `public/ticker`                                 | `DeribitTickerSchema`                      |
| `getOrderBook({ instrumentName, depth? })`      | `public/get_order_book`                         | `DeribitOrderBookSchema`                   |
| `getLastTradesByCurrencyAndTime(q)`             | `public/get_last_trades_by_currency_and_time`   | `DeribitTradesPageSchema`                  |
| `getLastTradesByInstrumentAndTime(q)`           | `public/get_last_trades_by_instrument_and_time` | `DeribitTradesPageSchema`                  |
| `getLastTradesByCurrency(q)`                    | `public/get_last_trades_by_currency`            | `DeribitTradesPageSchema`                  |
| `getLastTradesByInstrument(q)`                  | `public/get_last_trades_by_instrument`          | `DeribitTradesPageSchema`                  |
| `getIndexPrice(indexName)`                      | `public/get_index_price`                        | `DeribitIndexPriceSchema`                  |
| `getVolatilityIndexData(q)`                     | `public/get_volatility_index_data`              | `DeribitVolatilityIndexDataSchema`         |
| `call(method, params?)`                         | any `public/*`                                  | The whole JSON-RPC envelope                |

Query keys are camelCase (`instrumentName`, `startTimestamp`, `startSeq`)
and sent under Deribit's names. Trade queries take `count` (≤ 1000),
`sorting` and `source`: `'live'` (default) or `'history'` — the
history.deribit.com archive, which keeps every trade (production only).
Page with `hasMore`.

`deribitExpiryCode(ms)` turns an expiration timestamp into Deribit's code
(`1794038400000` → `7NOV26`).

## Response shape

Results are validated and camelCased at every depth (`instrument_name` →
`instrumentName`, `stats.volume_usd` → `stats.volumeUsd`); unknown fields
are kept. Book snapshots become `{ price, amount }` levels. Bodies are
parsed with `parseJsonLossless`, so `starbaseMatchId` and
`starbaseTimestamp` (nanoseconds) keep all their digits as strings. Use
`call()` when you need Deribit's `usIn`/`usOut`/`usDiff` server timing.

See [Sockets](Deribit-Sockets.md) for streaming, [Errors](Deribit-Errors.md)
for failure handling and [Schemas](Deribit-Schemas.md) for every shape.
