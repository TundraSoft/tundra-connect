# OpenMeteo

Typed [Open-Meteo](https://open-meteo.com) weather client for Deno, Bun,
Node.js, browsers and Cloudflare Workers: the Forecast, Ensemble (every
member), Previous Runs, Historical Forecast, Single Runs and Historical
Weather (archive) APIs, with an explicit model choice (GFS, HRRR, ECMWF
IFS, ICON, GEM, ...) and any hourly, 15-minutely, daily or current
variable by name. A lightweight, validated alternative to the
`openmeteo` SDK.

[![JSR](https://jsr.io/badges/@tundraconnect/open-meteo)](https://jsr.io/@tundraconnect/open-meteo)
[![JSR Score](https://jsr.io/badges/@tundraconnect/open-meteo/score)](https://jsr.io/@tundraconnect/open-meteo)

## Overview

```ts
import { OpenMeteo } from '@tundraconnect/open-meteo';

const client = new OpenMeteo();
const [centralPark] = await client.forecast({
  latitude: 40.7794,
  longitude: -73.9692,
  hourly: ['temperature_2m'],
  minutely15: ['temperature_2m'],
  models: ['ncep_hrrr_conus', 'gfs_seamless', 'ecmwf_ifs025'],
  timeformat: 'unixtime',
});
console.log(centralPark?.hourly?.temperature_2m_ncep_hrrr_conus);
```

| Method                 | API                     | What it answers                                                  |
| ---------------------- | ----------------------- | ---------------------------------------------------------------- |
| `forecast()`           | Forecast `/v1/forecast` | The latest forecast, per model                                   |
| `ensemble()`           | Ensemble `/v1/ensemble` | Every ensemble member (31 GEFS, 51 ECMWF ENS, ...), not the mean |
| `previousRuns()`       | Previous Runs           | What the model forecast 1–7 days earlier for each hour           |
| `historicalForecast()` | Historical Forecast     | Archived first-hours forecasts, back to 2021/2022                |
| `singleRun()`          | Single Runs             | One model run exactly as issued (`run: '2026-11-05T00:00'`)      |
| `archive()`            | Historical Weather      | Reanalysis (ERA5 and others) back to 1940                        |

**Nothing is resampled, merged or rounded.** Every column Open-Meteo sends
comes back as-is — every model, every ensemble member, every `null` — with
the grid cell, elevation, timezone and units. Several `latitude`/
`longitude` values request several locations in one call; every method
returns one entry per location, in request order. With several models,
Open-Meteo suffixes each column with the model
(`temperature_2m_gfs_seamless`); `columns()` splits names back into
variable, ensemble member and model. Anything not modelled as an option
goes in `params` under Open-Meteo's own name.

**Free and paid hosts.** Without `auth` the client uses the free hosts
(`api.open-meteo.com`, `ensemble-api.open-meteo.com`, ...), which are for
non-commercial use only and rate-limited (600 calls/minute, 5,000/hour,
10,000/day and 300,000/month per IP at the time of writing). Commercial
use needs a paid plan: pass its key as `auth` and every call goes to the
matching `customer-*` host with an `apikey` parameter. `hosts` overrides
any host (a self-hosted Open-Meteo, a proxy).

### Out of scope (for now)

- The geocoding, elevation, air-quality, marine, flood, climate and
  satellite-radiation APIs.
- The FlatBuffers (`format=flatbuffers`) and CSV/XLSX outputs; this client
  reads JSON.

## Documentation

| Topic                                                                          | Description                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/OpenMeteo-API)         | Configuration, hosts, every method and query |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/OpenMeteo-Errors)   | Error codes and diagnostic metadata          |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/OpenMeteo-Schemas) | Public Guardian schemas and inferred types   |

## Upstream

- [Forecast API reference](https://open-meteo.com/en/docs)
- [Ensemble](https://open-meteo.com/en/docs/ensemble-api),
  [Previous Runs](https://open-meteo.com/en/docs/previous-runs-api),
  [Historical Forecast](https://open-meteo.com/en/docs/historical-forecast-api),
  [Single Runs](https://open-meteo.com/en/docs/single-runs-api) and
  [Historical Weather](https://open-meteo.com/en/docs/historical-weather-api)
- [Pricing and API keys](https://open-meteo.com/en/pricing)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/open-meteo
```

**Bun:**

```sh
bunx jsr add @tundraconnect/open-meteo
```

**Node.js:**

```sh
npx jsr add @tundraconnect/open-meteo
```

## Quick Start

Record what three models and the GFS ensemble say about tomorrow's high in
Central Park, and what GFS said about it yesterday:

```ts
import { columns, OpenMeteo } from '@tundraconnect/open-meteo';

const client = new OpenMeteo();
const station = { latitude: 40.7794, longitude: -73.9692 };

const [deterministic] = await client.forecast({
  ...station,
  hourly: ['temperature_2m'],
  models: ['ncep_hrrr_conus', 'gfs_seamless', 'ecmwf_ifs025'],
  temperatureUnit: 'fahrenheit',
  timezone: 'America/New_York',
  timeformat: 'unixtime',
});

const [ensemble] = await client.ensemble({
  ...station,
  hourly: ['temperature_2m'],
  models: ['gfs_seamless'],
  temperatureUnit: 'fahrenheit',
});
for (const c of columns(ensemble!.hourly!, ['temperature_2m'])) {
  console.log(c.model, c.member, Math.max(...c.values.map(Number)));
}

const [earlier] = await client.previousRuns({
  ...station,
  hourly: ['temperature_2m'],
  previousDays: [1],
  models: ['gfs_seamless'],
});
console.log(
  deterministic?.hourly?.time.length,
  earlier?.hourly?.temperature_2m_previous_day1,
);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
