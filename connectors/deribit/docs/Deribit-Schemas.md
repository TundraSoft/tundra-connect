# Deribit Schemas

The `@tundraconnect/deribit/schemas` subpath exports the Guardian
validators the REST client and the socket apply, with their types. Each
takes Deribit's raw snake_case payload and yields camelCased keys at every
depth, keeping unknown fields.

```ts
import {
  type DeribitTradeSchema,
  DeribitTradeSchemaObject,
} from '@tundraconnect/deribit/schemas';
import { parseJsonLossless } from '@tundraconnect/deribit';

const frame =
  '{"timestamp":1794003632876,"price":75947.5,"direction":"sell","index_price":75927.33,"instrument_name":"BTC-PERPETUAL","trade_seq":315282656,"amount":450.0,"mark_price":75947.52,"tick_direction":2,"starbase_match_id":244586781347950592,"trade_id":"462303753","contracts":45.0,"starbase_timestamp":1794003632876548820}';

const [error, trade] = DeribitTradeSchemaObject.safeParse(
  parseJsonLossless(frame),
);
if (error) throw error;
const typed: DeribitTradeSchema = trade;
console.log(typed.starbaseTimestamp); // '1794003632876548820', every digit
```

| Schema                                   | Type                               | Source                                              |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `DeribitInstrumentSchemaObject`          | `DeribitInstrumentSchema`          | `get_instruments`, `get_instrument`                 |
| `DeribitBookSummarySchemaObject`         | `DeribitBookSummarySchema`         | `get_book_summary_by_*`                             |
| `DeribitTickerSchemaObject`              | `DeribitTickerSchema`              | `ticker`, `ticker.*` (greeks, IVs, stats)           |
| `DeribitTradeSchemaObject`               | `DeribitTradeSchema`               | trade queries, `trades.*`                           |
| `DeribitTradesPageSchemaObject`          | `DeribitTradesPageSchema`          | `{ trades, hasMore }`                               |
| `DeribitBookUpdateSchemaObject`          | `DeribitBookUpdateSchema`          | `book.*`: `[action, price, amount]` → objects       |
| `DeribitOrderBookSchemaObject`           | `DeribitOrderBookSchema`           | `get_order_book`: `[price, amount]` → objects       |
| `DeribitPriceIndexSchemaObject`          | `DeribitPriceIndexSchema`          | `deribit_price_index.*`                             |
| `DeribitVolatilityIndexSchemaObject`     | `DeribitVolatilityIndexSchema`     | `deribit_volatility_index.*` (DVOL)                 |
| `DeribitMarkPriceSchemaObject`           | `DeribitMarkPriceSchema`           | one entry of `markprice.options.*`                  |
| `DeribitIndexPriceSchemaObject`          | `DeribitIndexPriceSchema`          | `get_index_price`                                   |
| `DeribitVolatilityIndexDataSchemaObject` | `DeribitVolatilityIndexDataSchema` | `get_volatility_index_data` candles                 |
| `DeribitRpcEnvelopeSchemaObject`         | `DeribitRpcEnvelopeSchema`         | the JSON-RPC envelope, with `usIn`/`usOut`/`usDiff` |
| `DeribitRpcErrorSchemaObject`            | `DeribitRpcErrorSchema`            | `{ code, message, data }`                           |
| `DeribitAuthResultSchemaObject`          | `DeribitAuthResultSchema`          | `public/auth`                                       |

Numbers are strict (a numeric string is rejected). `starbaseMatchId` and
`starbaseTimestamp` are always strings; parse payloads with
`parseJsonLossless` (as the client does) so they arrive exact.
