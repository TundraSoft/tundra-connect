# Binance Schemas

The `@tundraconnect/binance/schemas` subpath exports Guardian validators and
inferred types for the stream payloads (`event.data`).

```ts
import { BinanceTradeSchemaObject } from '@tundraconnect/binance/schemas';

declare const payload: unknown;
const [error, trade] = BinanceTradeSchemaObject.safeParse(payload);
```

Binance's single-letter keys are case-sensitive (`e`/`E`, `t`/`T`, `b`/`B`,
`m`/`M`), so each schema renames exactly the documented ones and passes every
other key through untouched (the trade's `M`, for one, stays `M`). Decimal
strings become numbers; ids and timestamps must already be numbers.

| Schema                           | Stream                 | Fields                                                                                          |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `BinanceTradeSchemaObject`       | `<symbol>@trade`       | `eventTime`, `symbol`, `tradeId`, `price`, `quantity`, `tradeTime`, `buyerIsMaker`              |
| `BinanceBookTickerSchemaObject`  | `<symbol>@bookTicker`  | `updateId`, `symbol`, `bidPrice`, `bidQuantity`, `askPrice`, `askQuantity`                      |
| `BinanceDepthUpdateSchemaObject` | `<symbol>@depth@100ms` | `eventTime`, `symbol`, `firstUpdateId`, `finalUpdateId`, `bids`/`asks` as `{ price, quantity }` |

`buyerIsMaker: true` means the buyer was the resting order — the taker sold.

---

[← Back to Binance](../README.md)
