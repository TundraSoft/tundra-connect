# Polymarket Schemas

The `@tundraconnect/polymarket/schemas` subpath exports Guardian validators
and inferred types.

```ts
import { GammaMarketSchemaObject } from '@tundraconnect/polymarket/schemas';

const [error, market] = GammaMarketSchemaObject.safeParse(rawResponse);
```

## Gamma

| Schema                              | Endpoint                              | Notes                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GammaMarketSchemaObject`           | `/markets/*`, `/markets/slug/{slug}`  | `.passthrough()` — unmodeled vendor fields survive on the parsed object. `outcomes`/`outcomePrices`/`clobTokenIds` accept either a JSON-encoded string or a native array (Gamma serializes both ways, observed in the wild) and always normalize to `string[]`. |
| `GammaMarketListSchemaObject`       | `/markets` (legacy)                   | A bare array of `GammaMarketSchemaObject` entries.                                                                                                                                                                                                              |
| `GammaMarketKeysetPageSchemaObject` | `/markets/keyset`                     | `{ markets, nextCursor? }` — the keyset endpoint wraps its page in an object, unlike legacy's bare array.                                                                                                                                                       |
| `FeeScheduleSchemaObject`           | (nested in `GammaMarket.feeSchedule`) | Only present on markets with a non-default fee schedule.                                                                                                                                                                                                        |

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
| `ClobBalanceSchemaObject`            | `GET /balance-allowance`                                          | `balance` coerced from the vendor's decimal-string wire form to a `number`.                                                                                                                                                 |
| `ClobApiCredentialsSchemaObject`     | `POST /auth/api-key`, `GET /auth/derive-api-key`                  | The vendor's `key` field (an alternate name for `apiKey`) is accepted and normalized.                                                                                                                                       |
| `ClobPostOrderResponseSchemaObject`  | `POST /order`, each element of `POST /orders`                     | Normalizes `orderID`/`tradeIDs`/`retry_after_seconds` to `orderId`/`tradeIds`/`retryAfterSeconds`. Every field is optional — the same schema validates a fill, a graceful no-match, and a rejection body (`errorMsg`-only). |
| `ClobPostOrdersResponseSchemaObject` | `POST /orders`                                                    | A bare array of `ClobPostOrderResponseSchemaObject` entries, one per submitted order.                                                                                                                                       |
| `ClobCancelResponseSchemaObject`     | `DELETE /order`, `DELETE /orders`, `DELETE /cancel-market-orders` | Normalizes `not_canceled` to `notCanceled`; both default to empty when the vendor omits them.                                                                                                                               |

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

All CLOB schemas that rename a snake_case wire field to camelCase
(`minimum_tick_size` → `minimumTickSize`, `neg_risk` → `negRisk`, `orderID`
→ `orderId`, `not_canceled` → `notCanceled`) do so because these are small,
hand-computed values this connect's own methods consume directly — unlike
the Gamma schemas, which pass the vendor's own field names straight through
since callers are expected to cross-reference Gamma's own API docs.

---

[← Back to Polymarket](../README.md)
