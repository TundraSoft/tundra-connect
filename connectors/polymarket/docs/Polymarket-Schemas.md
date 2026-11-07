# Polymarket Schemas

The `@tundraconnect/polymarket/schemas` subpath exports Guardian validators
and inferred types.

```ts
import { GammaMarketSchemaObject } from '@tundraconnect/polymarket/schemas';

const [error, market] = GammaMarketSchemaObject.safeParse(rawResponse);
```

## Gamma

| Schema                              | Endpoint                                     | Notes                                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GammaMarketSchemaObject`           | `/markets/*`, `/markets/slug/{slug}`         | `.passthrough()` — unmodeled vendor fields survive on the parsed object. `outcomes`/`outcomePrices`/`clobTokenIds` accept either a JSON-encoded string or a native array (Gamma serializes both ways, observed in the wild) and always normalize to `string[]`. |
| `GammaMarketListSchemaObject`       | `/markets` (legacy)                          | A bare array of `GammaMarketSchemaObject` entries.                                                                                                                                                                                                              |
| `GammaMarketKeysetPageSchemaObject` | `/markets/keyset`                            | `{ markets, nextCursor? }` — the keyset endpoint wraps its page in an object, unlike legacy's bare array.                                                                                                                                                       |
| `FeeScheduleSchemaObject`           | (nested in `GammaMarket.feeSchedule`)        | `{ rate, exponent, takerOnly?, rebateRate? }` — the only input `estimateFees()` reads.                                                                                                                                                                          |
| `CryptoMarketConfigSchemaObject`    | (nested in `GammaMarket.cryptoMarketConfig`) | Crypto up/down markets: `asset`, `duration`, `twapEnabled`, `twapLookbackSeconds`.                                                                                                                                                                              |

`GammaMarket` also types the fee fields (`feesEnabled`, `feeSchedule`,
`feeType`, `takerBaseFee`/`makerBaseFee`), `cryptoMarketConfig`,
`resolutionMechanism`, `fallbackResolutionType`, `eventStartTime`,
`clearBookOnStart`, `rfqEnabled` and `version` (`v1` ConditionalTokens,
`v2` Protocol V2 — with `positionIds` and `resolutionStatus`); each is
optional and may be `null`.

`GammaMarket.active`/`closed`/`archived`/`negRisk` all default to `false`
when the vendor omits them (matching the vendor's own documented default),
rather than surfacing as `undefined` — the schema normalizes this upfront
via `Guardian.preprocess` on the whole object, not per-field (a per-field
`Guardian.preprocess` inside `Guardian.object()` does not correctly run
before that field's own type check — verified empirically against
`@tundralibs/guardian@1.1.0`; see the comment on `normalizeGammaMarket` in
[GammaMarket.ts](../schema/GammaMarket.ts) for the full explanation).

## CLOB

| Schema                               | Endpoint                                                          | Notes                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClobVersionSchemaObject`            | `GET /version`                                                    | `{ version }`.                                                                                                                                                                                                              |
| `ClobTickSizeSchemaObject`           | `GET /tick-size`                                                  | Normalizes the wire's `minimum_tick_size` to `minimumTickSize`; missing/zero/unparseable values default to `0.01` (matching the vendor SDK's own `Number(v ?? 0.01) \|\| 0.01` fallback).                                   |
| `ClobNegRiskSchemaObject`            | `GET /neg-risk`                                                   | Normalizes `neg_risk` to `negRisk`, coerced through JS truthiness (matches the vendor SDK).                                                                                                                                 |
| `ClobBalanceSchemaObject`            | `GET /balance-allowance`                                          | The vendor sends 6-decimal fixed-point base units (`'125500000'`); `balance` is the divided whole-unit `number` (`125.5`), `balanceRaw` the original string.                                                                |
| `ClobOrderBookSchemaObject`          | `GET /book`                                                       | snake_case → camelCase; every price/size/tick coerced to `number`; `bids`/`asks` keep the vendor ordering (best price last). Missing sides default to `[]`.                                                                 |
| `ClobOpenOrderSchemaObject`          | one row of `GET /data/orders`                                     | snake_case → camelCase, sizes/price/timestamps coerced to `number`; `side` must be `BUY`/`SELL`. `.passthrough()`.                                                                                                          |
| `ClobOpenOrdersPageSchemaObject`     | `GET /data/orders`                                                | Accepts the `{ data, next_cursor, count }` envelope or a bare array; `next_cursor` of `''`/`'LTE='` normalizes to an absent `nextCursor`.                                                                                   |
| `ClobTradeSchemaObject`              | one row of `GET /data/trades`                                     | Same normalization; `traderSide` must be `TAKER`/`MAKER`; `maker_orders` rows are kept raw; a `null` `transaction_hash` becomes absent.                                                                                     |
| `ClobTradesPageSchemaObject`         | `GET /data/trades`                                                | Same envelope handling as the orders page.                                                                                                                                                                                  |
| `ClobApiCredentialsSchemaObject`     | `POST /auth/api-key`, `GET /auth/derive-api-key`                  | The vendor's `key` field (an alternate name for `apiKey`) is accepted and normalized.                                                                                                                                       |
| `ClobPostOrderResponseSchemaObject`  | `POST /order`, each element of `POST /orders`                     | Normalizes `orderID`/`tradeIDs`/`retry_after_seconds` to `orderId`/`tradeIds`/`retryAfterSeconds`. Every field is optional — the same schema validates a fill, a graceful no-match, and a rejection body (`errorMsg`-only). |
| `ClobPostOrdersResponseSchemaObject` | `POST /orders`                                                    | A bare array of `ClobPostOrderResponseSchemaObject` entries, one per submitted order.                                                                                                                                       |
| `ClobCancelResponseSchemaObject`     | `DELETE /order`, `DELETE /orders`, `DELETE /cancel-market-orders` | Normalizes `not_canceled` to `notCanceled`; both default to empty when the vendor omits them.                                                                                                                               |

## Data API v2

Every v2 payload is snake_case on the wire; these schemas camelCase every
key (modelled or not) and pass unmodelled fields through.

| Schema                           | Endpoint              | Notes                                                                                                               |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DataPositionsPageSchemaObject`  | `GET /v2/positions`   | `{ data: DataPosition[], pagination }`. Economics required; Gamma/profile enrichment (`title`, `icon`, …) optional. |
| `DataPositionSchemaObject`       | one positions row     | `currentSize` is the holding, `totalSize` lifetime buys; `entryCostUsdc` fee-exclusive, `entryFeesUsdc` on top.     |
| `DataValueSchemaObject`          | `GET /v2/value`       | Unwraps `data` to `{ proxyWallet, value }`.                                                                         |
| `DataActivityPageSchemaObject`   | `GET /v2/activity`    | `{ data: DataActivity[], pagination }`; `isCombo` only on combo trade rows.                                         |
| `DataTradesPageSchemaObject`     | `GET /v2/trades`      | `{ data: DataTrade[], pagination }`.                                                                                |
| `DataTokenListSchemaObject`      | `GET /v2/tokens`      | Unwraps `data`; `structuralConditionId`, `finalPrice`, `clobIndex`, … may be `null`.                                |
| `DataResolutionListSchemaObject` | `GET /v2/resolutions` | Unwraps `data`; `expectedSettlementTime`/`settlementTimeBasis` only while an estimate applies.                      |
| `DataPaginationSchemaObject`     | `pagination` block    | `{ hasMore, limit, nextCursor: string \| null, offset }`.                                                           |

## Relayer

| Schema                              | Endpoint             | Notes                                                                                                              |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `RelayPayloadSchemaObject`          | `GET /relay-payload` | `{ address, nonce }` — the caller's next relay-hub nonce and the relay account that will broadcast the meta-tx.    |
| `RelayerSubmitResponseSchemaObject` | `POST /submit`       | Normalizes the vendor's `transactionID` (capital ID) to `transactionId`; `state` is optional (e.g. `"STATE_NEW"`). |

Neither Relayer schema carries the on-chain transaction hash — `POST /submit`
only acknowledges that the relay hub accepted the meta-tx for broadcast;
polling `GET /transaction` for confirmation is not implemented by this
connect. `Polymarket.split()`/`merge()`/`redeem()` wrap a
`RelayerSubmitResponse` into the same `OrderResult` shape used by every
other trading/collateral action — see
[API: OrderResult](Polymarket-API.md#orderresult--one-shape-for-every-action).

## WebSocket feeds

The socket event payloads (`event.data`). Every key is camelCased (unknown
ones too), decimal and timestamp strings become numbers, and
`.passthrough()` keeps every field the venue sends.

| Schema                                  | Message                     | Notes                                                                                    |
| --------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `PolymarketBookSchemaObject`            | market `book`               | Full-depth `bids`/`asks`; the initial snapshot also carries `tickSize`/`lastTradePrice`. |
| `PolymarketPriceChangeSchemaObject`     | market `price_change`       | `priceChanges[]`; accepts the `changes` variant. `size` is the level's new size.         |
| `PolymarketTickSizeChangeSchemaObject`  | market `tick_size_change`   |                                                                                          |
| `PolymarketLastTradePriceSchemaObject`  | market `last_trade_price`   |                                                                                          |
| `PolymarketBestBidAskSchemaObject`      | market `best_bid_ask`       |                                                                                          |
| `PolymarketNewMarketSchemaObject`       | market `new_market`         | Many extra fields (description, tags, fees) pass through.                                |
| `PolymarketMarketResolvedSchemaObject`  | market `market_resolved`    |                                                                                          |
| `PolymarketUserOrderSchemaObject`       | user `order`                | `type` is `PLACEMENT`/`UPDATE`/`CANCELLATION`.                                           |
| `PolymarketUserTradeSchemaObject`       | user `trade`                | A `null` `transaction_hash` becomes absent; `makerOrders` rows are camelCased.           |
| `PolymarketPriceEnvelopeSchemaObject`   | PolyBolt envelope           | `seq`/`ts`/`dropped` must be real integers.                                              |
| `PolymarketPriceUpdateSchemaObject`     | PolyBolt live price         | `fullAccuracyValue` keeps the exact decimal string; `source`, `marketStatus` (equity).   |
| `PolymarketPriceSnapshotSchemaObject`   | PolyBolt snapshot batch     | Batch-level `source` and `marketStatus`.                                                 |
| `PolymarketPriceBestBidAskSchemaObject` | PolyBolt `price.polymarket` |                                                                                          |

See [Sockets](Polymarket-Sockets.md) for the events that carry them.

All CLOB schemas that rename a snake_case wire field to camelCase
(`minimum_tick_size` → `minimumTickSize`, `neg_risk` → `negRisk`, `orderID`
→ `orderId`, `not_canceled` → `notCanceled`) do so because these are small,
hand-computed values this connect's own methods consume directly — unlike
the Gamma schemas, which pass the vendor's own field names straight through
since callers are expected to cross-reference Gamma's own API docs.

---

[← Back to Polymarket](../README.md)
