# CoinGecko Schemas

The `@tundraconnect/coingecko/schemas` subpath exports Guardian validators
and inferred types. Client methods validate every payload before returning
it.

```ts
import {
  type PriceSchema,
  PriceSchemaObject,
} from '@tundraconnect/coingecko/schemas';

const payload: unknown = { bitcoin: { usd: 65000.5 } };

const [error, prices] = PriceSchemaObject.safeParse(payload);
if (error || !prices) throw error;

const typedPrices: PriceSchema = prices;
console.log(typedPrices.bitcoin?.usd);
```

## Response Schemas

| Schema                      | Endpoint                          |
| --------------------------- | --------------------------------- |
| `PriceSchemaObject`         | `/simple/price`                   |
| `CoinListSchemaObject`      | `/coins/list`                     |
| `MarketsSchemaObject`       | `/coins/markets`                  |
| `ErrorEnvelopeSchemaObject` | Normalized vendor error envelopes |

## Component Schemas

| Schema                      | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `CoinListEntrySchemaObject` | A single `/coins/list` entry (id, symbol, name, platforms) |
| `MarketDataSchemaObject`    | A single `/coins/markets` entry                            |
| `RoiSchemaObject`           | Return-on-investment summary within a market data entry    |

## Common Validators

`coinIdGuard`, `coinSymbolGuard`, and `coinNameGuard` are reusable
non-empty-string validators shared across the coin-list and market-data
schemas. Keeping these shared exports flat avoids artificial
request/response folders while preserving a single source of truth.

## Notes

- `PriceSchemaObject` accepts an empty object `{}` — CoinGecko returns HTTP
  200 with an empty body for an unknown coin id, which is not an error.
- Several `MarketDataSchemaObject` fields (`market_cap_rank`, `high_24h`,
  `low_24h`, `price_change_24h`, `price_change_percentage_24h`,
  `circulating_supply`, `total_supply`, `max_supply`, `roi`) are nullable —
  CoinGecko returns `null` rather than omitting the field for thin/illiquid
  markets.
- `ErrorEnvelopeSchemaObject` is a `Guardian.oneOf(...)` over the three
  documented error shapes; see [Errors](CoinGecko-Errors.md) for the
  shapes themselves.

---

[← Back to CoinGecko](../README.md)
