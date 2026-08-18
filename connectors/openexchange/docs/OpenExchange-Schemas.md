# OpenExchange Schemas

The `@tundraconnect/openexchange/schemas` subpath exports Guardian validators and inferred types. Client methods validate every payload before returning it.

```ts
import {
  type LatestRatesSchema,
  LatestRatesSchemaObject,
} from '@tundraconnect/openexchange/schemas';

const payload: unknown = {
  timestamp: 1703971200,
  base: 'USD',
  rates: { EUR: 0.9023 },
};

const [error, rates] = LatestRatesSchemaObject.safeParse(payload);
if (error || !rates) throw error;

const typedRates: LatestRatesSchema = rates;
console.log(typedRates.rates.EUR);
```

## Response Schemas

| Schema                        | Endpoint                       |
| ----------------------------- | ------------------------------ |
| `UsageResponseSchemaObject`   | `/usage.json`                  |
| `CurrenciesSchemaObject`      | `/currencies.json`             |
| `LatestRatesSchemaObject`     | `/latest.json`                 |
| `HistoricalRatesSchemaObject` | `/historical/{date}.json`      |
| `TimeSeriesSchemaObject`      | `/time-series.json`            |
| `ConvertRequestSchemaObject`  | `/convert/{value}/{from}/{to}` |
| `OHLCSchemaObject`            | `/ohlc.json`                   |
| `ErrorSchemaObject`           | Vendor error envelopes         |

## Component Schemas

| Schema                 | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `StatusSchemaObject`   | Account status and plan capabilities within the status response  |
| `UsageSchemaObject`    | Request quota and usage counters within the status response      |
| `OHLCDataSchemaObject` | Open, high, low, close, and average values for one currency/date |
| `RateSchemaObject`     | Positive exchange-rate map keyed by ISO 4217 currency code       |

## Common Validators

`baseGuard`, `disclaimerGuard`, `licenseGuard`, `timestampGuard`,
`startDateGuard`, and `endDateGuard` are reusable component validators.
`RateSchemaObject` composes those primitives into a validated rate map.
Keeping these shared exports flat avoids artificial request/response folders
while preserving a single source of truth.

---

[← Back to OpenExchange](../README.md)
