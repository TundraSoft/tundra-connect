# EIA

Typed [U.S. Energy Information Administration Open Data API
v2](https://www.eia.gov/opendata/) client for Deno, Bun, Node.js, browsers
and Cloudflare Workers: any route and facet, pagination past the 5,000-row
cap, and typed helpers for WTI and Brent spot prices and Weekly Petroleum
Status Report stocks. Rows keep EIA's own values and periods, and every
page keeps its metadata — EIA revises data, so nothing is collapsed.

[![JSR](https://jsr.io/badges/@tundraconnect/eia)](https://jsr.io/@tundraconnect/eia)
[![JSR Score](https://jsr.io/badges/@tundraconnect/eia/score)](https://jsr.io/@tundraconnect/eia)

## Overview

```ts
import { EIA } from '@tundraconnect/eia';

const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
const { rows } = await eia.getSpotPrices({ start: '2026-10-01' });
for (const r of rows) console.log(r.period, r.series, r.value); // "99.64"
```

| Method                      | Route                           | Result                                                                                     |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `getRoute(route)`           | `/v2/<route>/`                  | Child routes, or a data route's frequencies, facets, columns and `startPeriod`/`endPeriod` |
| `getFacetValues(route, id)` | `/v2/<route>/facet/<id>/`       | Every value of one facet                                                                   |
| `getData(route, query)`     | `/v2/<route>/data/`             | One page (≤ 5,000 rows) with metadata                                                      |
| `paginate(route, query)`    | `/v2/<route>/data/`, repeatedly | Async iterator of pages                                                                    |
| `getAllData(route, query)`  | `/v2/<route>/data/`, repeatedly | Every row plus each page's metadata                                                        |
| `getSeriesById(id)`         | `/v2/seriesid/<id>`             | A legacy APIv1 series id (`PET.RWTC.D`)                                                    |
| `getSpotPrices()`           | `petroleum/pri/spt`             | WTI (`RWTC`) and Brent (`RBRTE`) daily                                                     |
| `getWeeklyStocks()`         | `petroleum/stoc/wstk`           | WPSR headline stocks (`EIA_WPSR_STOCK_SERIES`)                                             |

**Values as sent.** EIA sends most numbers as strings (`"107.03"`) and a
missing value as `null`; rows keep exactly that, with every facet and label
column (`series`, `series-description`, `duoarea`, `units`, ...). Each page
keeps EIA's `total`, `warnings` (for example `incomplete return`) and the
`request` echo, so a revision between two pages is visible.

**Release schedule.** The v2 API doesn't publish a release calendar. A data
route's `getRoute()` metadata carries `endPeriod`, the latest period
released, which is how to detect a new release (the WPSR normally lands on
Wednesdays at 10:30 ET; EIA's schedule page lists holiday shifts).

### Out of scope (for now)

- XML output (`out=xml`) and the bulk-download files.
- APIv1 (retired by EIA); `getSeriesById` covers v1 series ids through v2.

## Getting an API key

The API needs a key; it's free.

1. Register at <https://www.eia.gov/opendata/register.php>: first and last
   name, email, a category and a reason, and accept the API terms of
   service. There's no approval step.
2. EIA emails the key to that address.
3. Pass it as `auth: { type: 'CUSTOM', apiKey }`. It is sent as the
   `api_key` query parameter and never appears in an error.

EIA also accepts the public `DEMO_KEY`, but it's shared and throttled —
10 requests per hour when checked on 2026-11-06 — so it's fine for a first
try and too low for live tests or real use. EIA suspends a key that
requests too fast for a short cool-down; the client then throws
`RATE_LIMITED`.

**Live tests** read `CONNECTOR_EIA_API_KEY`: from a local, gitignored
`.env` (see the repository's `.env.sample`) when you run them yourself, and
from the GitHub Actions secret of the same name in CI.

## Documentation

| Topic                                                                    | Description                                |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/EIA-API)         | Configuration, queries, paging and helpers |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/EIA-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/EIA-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [API documentation](https://www.eia.gov/opendata/documentation.php)
- [API browser](https://www.eia.gov/opendata/browser/) — find routes,
  facets and series ids
- [Register for a key](https://www.eia.gov/opendata/register.php)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/eia
```

**Bun:**

```sh
bunx jsr add @tundraconnect/eia
```

**Node.js:**

```sh
npx jsr add @tundraconnect/eia
```

## Quick Start

Read this week's crude and Cushing stocks as soon as EIA publishes them,
and the full WTI history page by page:

```ts
import { EIA, EIA_WPSR_STOCK_SERIES } from '@tundraconnect/eia';

const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });

const meta = await eia.getRoute('petroleum/stoc/wstk');
const latest = meta.response.endPeriod; // e.g. '2026-10-30'
const { rows } = await eia.getWeeklyStocks({
  series: [EIA_WPSR_STOCK_SERIES.CRUDE_EXCL_SPR, EIA_WPSR_STOCK_SERIES.CUSHING],
  start: latest,
});
console.log(rows.map((r) => [r.series, r.value, r.units]));

for await (
  const page of eia.paginate('petroleum/pri/spt', {
    frequency: 'daily',
    data: ['value'],
    facets: { series: ['RWTC'] },
    sort: [{ column: 'period', direction: 'asc' }],
  })
) {
  console.log(page.offset, page.response.data.length, page.response.total);
}
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
