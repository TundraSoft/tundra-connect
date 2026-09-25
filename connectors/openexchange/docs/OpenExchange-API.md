# OpenExchange API

## Configuration

```ts
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  auth: { type: 'CUSTOM', appId: 'your-app-id' },
  baseCurrency: 'USD',
  timeout: 10,
});
```

`baseCurrency` defaults to `USD`; `timeout` is expressed in seconds.

## Endpoints

| Method                 | Endpoint                       | Result                      |
| ---------------------- | ------------------------------ | --------------------------- |
| `getStatus()`          | `/usage.json`                  | Account plan and usage      |
| `listCurrencies()`     | `/currencies.json`             | Currency code-to-name map   |
| `getRates()`           | `/latest.json`                 | Latest currency rates       |
| `getHistoricalRates()` | `/historical/{date}.json`      | Rates for one date          |
| `getTimeSeries()`      | `/time-series.json`            | Rates grouped by date       |
| `convert()`            | `/convert/{value}/{from}/{to}` | Conversion result and rate  |
| `getOHLC()`            | `/ohlc.json`                   | Open, high, low, close data |

`getHistoricalRates()` validates its `date` argument locally — anything that
is not a `YYYY-MM-DD` string rejects with `INVALID_DATE` before a request is
sent.

```ts
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  auth: { type: 'CUSTOM', appId: 'your-app-id' },
});
const conversion = await client.convert(100, 'USD', 'EUR');

console.log(conversion.response);
```

See [Errors](OpenExchange-Errors.md) for failure handling and [Schemas](OpenExchange-Schemas.md) for response validation.

---

[← Back to OpenExchange](../README.md)
