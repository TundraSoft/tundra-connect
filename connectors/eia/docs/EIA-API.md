# EIA API

## Configuration

```ts
import { EIA } from '@tundraconnect/eia';

const eia = new EIA({
  auth: { type: 'CUSTOM', apiKey: 'your-eia-key' },
  timeout: 60,
});
console.log(eia.hasApiKey);
```

| Option         | Type                         | Default | Description                                                         |
| -------------- | ---------------------------- | ------- | ------------------------------------------------------------------- |
| `auth`         | `{ type: 'CUSTOM', apiKey }` | —       | Required. See the README's "Getting an API key".                    |
| `timeout`      | `number` (seconds)           | `60`    | Per-request timeout.                                                |
| `maxRetryWait` | `number` (seconds)           | —       | Opt into RESTler's single retry on a 429 with a `Retry-After` hint. |

## Routes and facets

EIA's data is a tree: `getRoute()` with no argument lists the top-level
routes, `getRoute('petroleum')` its children, and a leaf such as
`getRoute('petroleum/pri/spt')` describes a data route — its `frequency`
list, `facets`, `data` columns and `startPeriod`/`endPeriod`.
`getFacetValues(route, 'series')` lists every value one facet can take.

## Data queries

`getData(route, query)` fetches one page:

| Field              | EIA parameter                                | Notes                                            |
| ------------------ | -------------------------------------------- | ------------------------------------------------ |
| `frequency`        | `frequency`                                  | `daily`, `weekly`, `monthly`, `annual`, ...      |
| `data`             | `data[0]`, `data[1]`, ...                    | Columns to return, usually `['value']`.          |
| `facets`           | `facets[series][0]`, ...                     | `{ series: ['RWTC', 'RBRTE'] }`.                 |
| `start`, `end`     | `start`, `end`                               | Inclusive, in the route's period format.         |
| `sort`             | `sort[0][column]`, `sort[0][direction]`, ... | Applied in order; `direction` defaults to `asc`. |
| `offset`, `length` | `offset`, `length`                           | `length` at most 5,000 (`EIA_MAX_PAGE_SIZE`).    |

`paginate(route, query, { pageSize?, maxRows? })` requests page after page
from `query.offset` until EIA's `total` is reached or a page comes back
short, yielding each page with the `offset` it was requested at.
`getAllData()` collects them into `{ rows, pages }`, where each `pages`
entry keeps that page's `total`, `warnings`, `request` and `apiVersion`.
Give `sort` a key that orders rows uniquely (period, then series) so pages
don't overlap if EIA revises data mid-read.

## Helpers

| Method                                                 | Route                 | Defaults                                                     |
| ------------------------------------------------------ | --------------------- | ------------------------------------------------------------ |
| `getSpotPrices({ series?, frequency?, start?, end? })` | `petroleum/pri/spt`   | WTI `RWTC` and Brent `RBRTE`, `daily`, oldest first.         |
| `getWeeklyStocks({ series?, start?, end? })`           | `petroleum/stoc/wstk` | Every `EIA_WPSR_STOCK_SERIES` value, `weekly`, oldest first. |

`EIA_WPSR_STOCK_SERIES` (thousand barrels, verified against the route's
facet values on 2026-11-06): `CRUDE_EXCL_SPR` `WCESTUS1`, `SPR`
`WCSSTUS1`, `GASOLINE` `WGTSTUS1`, `DISTILLATE` `WDISTUS1`, `JET_FUEL`
`WKJSTUS1`, `TOTAL_EXCL_SPR` `WTESTUS1`, `CUSHING`
`W_EPC0_SAX_YCUOK_MBBL`. Any other series id in the route can be passed.

`getSeriesById('PET.RWTC.D')` reads a legacy APIv1 series id through
`/v2/seriesid/`.

See [Errors](EIA-Errors.md) for failure handling and
[Schemas](EIA-Schemas.md) for the response shapes.
