# EIA Schemas

The `@tundraconnect/eia/schemas` subpath exports the Guardian validators
the client applies to every response, with their types.

```ts
import {
  type EIADataResponseSchema,
  EIADataResponseSchemaObject,
} from '@tundraconnect/eia/schemas';

const recorded: unknown = {
  response: {
    total: '2301',
    dateFormat: 'YYYY-MM-DD',
    frequency: 'weekly',
    data: [{
      period: '2026-10-30',
      series: 'WCESTUS1',
      'series-description':
        'U.S. Ending Stocks excluding SPR of Crude Oil (Thousand Barrels)',
      value: '409760',
      units: 'MBBL',
    }],
  },
  request: { command: '/v2/petroleum/stoc/wstk/data/', params: {} },
  apiVersion: '2.1.14',
};

const [error, page] = EIADataResponseSchemaObject.safeParse(recorded);
if (error) throw error;
const typed: EIADataResponseSchema = page;
console.log(typed.response.data[0]?.value);
```

| Schema                        | Type                    | Shape                                                                                                 |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `EIADataResponseSchemaObject` | `EIADataResponseSchema` | One data page: `response.total`/`dateFormat`/`frequency`/`data`, `request`, `apiVersion`, `warnings`. |
| `EIARowSchemaObject`          | `EIARowSchema`          | A row: a string `period` plus scalar columns (string, number or `null`).                              |
| `EIARouteSchemaObject`        | `EIARouteSchema`        | Route metadata: `routes`, or `frequency`/`facets`/`data`/`startPeriod`/`endPeriod`.                   |
| `EIAFacetValuesSchemaObject`  | `EIAFacetValuesSchema`  | `response.facets` (`{ id, name }`) and `totalFacets`.                                                 |
| `EIAWarningSchemaObject`      | `EIAWarningSchema`      | `{ warning, description }`.                                                                           |
| `EIAErrorBodySchemaObject`    | `EIAErrorBodySchema`    | Either error shape: `{ error: { code, message } }` or `{ error, code }`.                              |

Keys stay exactly as EIA names them, hyphens included (`series-description`,
`area-name`); values are never converted.
