# Kalshi Schemas

The `@tundraconnect/kalshi/schemas` subpath exports Guardian validators
and inferred types.

```ts
import { MarketSchemaObject } from '@tundraconnect/kalshi/schemas';

const [error, market] = MarketSchemaObject.safeParse(rawResponse);
```

## Market data

| Schema                                                | Endpoint                                     | Notes                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarketSchemaObject`                                  | `GET /markets/*`, `GET /markets/{ticker}`    | `.passthrough()` — unmodeled vendor fields (multivariate-event legs, structured strike details, price-range ladders, ...) survive on the parsed object. Fixed-point dollar/count strings are coerced to `number`. `seriesTicker` isn't on the wire — derived from `eventTicker`'s prefix. |
| `MarketsPageSchemaObject`                             | `GET /markets`                               | `{ markets, cursor? }`.                                                                                                                                                                                                                                                                   |
| `SingleMarketSchemaObject`                            | `GET /markets/{ticker}`                      | Unwraps the vendor's `{ "market": ... }` envelope.                                                                                                                                                                                                                                        |
| `OrderbookSchemaObject`                               | `GET /markets/{ticker}/orderbook`            | Unwraps `orderbook_fp.{yes_dollars,no_dollars}` (arrays of `[priceString, countString]` pairs) into `{yes, no}: {price, count}[]`.                                                                                                                                                        |
| `TradeSchemaObject`/`TradesPageSchemaObject`          | `GET /markets/trades`                        | Public trade tape (not account-specific — see `FillSchemaObject` for your own executions).                                                                                                                                                                                                |
| `EventSchemaObject`/`EventsPageSchemaObject`          | `GET /events`, `GET /events/{event_ticker}`  | `markets` nests `MarketSchemaObject` entries when the request set `withNestedMarkets: true`.                                                                                                                                                                                              |
| `SeriesSchemaObject`/`SeriesListResponseSchemaObject` | `GET /series`, `GET /series/{series_ticker}` | The top-level grouping above events.                                                                                                                                                                                                                                                      |
| `ExchangeStatusSchemaObject`                          | `GET /exchange/status`                       | `{ exchangeActive, tradingActive, ... }`.                                                                                                                                                                                                                                                 |

## Portfolio & orders

| Schema                                                                 | Endpoint                                              | Notes                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BalanceSchemaObject`                                                  | `GET /portfolio/balance`                              | Cents (`balance`) plus a dollar-formatted echo (`balanceDollars`) and `portfolioValue`.                                                  |
| `MarketPositionSchemaObject`/`EventPositionSchemaObject`               | `GET /portfolio/positions`                            | `position` is signed — negative = NO side, positive = YES.                                                                               |
| `FillSchemaObject`/`FillsPageSchemaObject`                             | `GET /portfolio/fills`                                | Your own executions.                                                                                                                     |
| `OrderSchemaObject`/`OrdersPageSchemaObject`/`SingleOrderSchemaObject` | `GET /portfolio/orders`, `GET /portfolio/orders/{id}` | The rich list/status shape — `status`, `outcomeSide`/`bookSide`, fees, timestamps. `SingleOrderSchemaObject` unwraps `{ "order": ... }`. |
| `OrderAckSchemaObject`                                                 | `POST /portfolio/events/orders` (create), `.../amend` | Flat create/amend response — no `status` field (an order is active immediately on creation).                                             |
| `CancelAckSchemaObject`                                                | `DELETE /portfolio/events/orders/{id}`                | Distinct shape from `OrderAckSchemaObject` — reports `reducedBy`, not a fill/remaining pair.                                             |
| `BatchOrderRowSchemaObject`/`BatchOrdersResponseSchemaObject`          | `.../orders/batched` (create & cancel)                | One row per submitted/canceled order — EITHER the success fields OR an `error: {code, message, details?}`, never both.                   |
| `OrderErrorSchemaObject`                                               | (nested in a batch row's `error`)                     | Kalshi's documented per-order failure envelope.                                                                                          |

All schemas rename Kalshi's snake_case wire fields
(`event_ticker`→`eventTicker`, `yes_bid_dollars`→`yesBid`,
`fill_count`→`fillCount`, ...) to camelCase and coerce every fixed-point
dollar/count STRING to a `number` — this is DISPLAY/RESULT data only.
Order SUBMISSION builds its own exact fixed-point strings from validated
integer cents (see `Kalshi.ts`'s `dollarsFromCents`/`countFp`) rather than
routing through float math, the same separation Polymarket keeps between
its numeric `GammaMarket` display schema and its exact-string order wire
encoding.

---

[← Back to Kalshi](../README.md)
