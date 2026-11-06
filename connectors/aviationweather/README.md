# AviationWeather

Typed [aviationweather.gov Data API](https://aviationweather.gov/data/api/)
client for Deno, Bun, Node.js and Cloudflare Workers: METAR and SPECI
observations by station and time range, TAFs, and the bulk METAR cache
file — raw report text next to the decoded fields, plus the remarks
T-group's tenths-of-a-degree temperature that weather markets settle on.

[![JSR](https://jsr.io/badges/@tundraconnect/aviationweather)](https://jsr.io/@tundraconnect/aviationweather)
[![JSR Score](https://jsr.io/badges/@tundraconnect/aviationweather/score)](https://jsr.io/@tundraconnect/aviationweather)

## Overview

```ts
import { AviationWeather } from '@tundraconnect/aviationweather';

const awc = new AviationWeather({ userAgent: 'my-recorder/1.0' });
const reports = await awc.getMetars({ ids: ['KNYC', 'KLGA'], hours: 6 });
for (const r of reports) {
  console.log(
    r.icaoId,
    r.metarType, // 'METAR' or 'SPECI'
    r.rawOb,
    r.remarkTemperatures.hourly?.temperatureC, // 16.1 from T01610150
  );
}
```

| Method            | Endpoint                          | Result                       |
| ----------------- | --------------------------------- | ---------------------------- |
| `getMetars()`     | `/api/data/metar`                 | `AviationWeatherMetar[]`     |
| `getTafs()`       | `/api/data/taf`                   | `AviationWeatherTafSchema[]` |
| `getMetarCache()` | `/data/cache/metars.cache.csv.gz` | `AviationWeatherMetarCache`  |

**Exact temperatures.** The body of a METAR rounds temperature to whole
degrees (`16/15`). US ASOS stations repeat it to 0.1 °C in the remarks
T-group (`T01610150` = 16.1 °C, dewpoint 15.0 °C), and synoptic-hour
reports add the 6-hour maximum and minimum (`10200`, `20189`) and the
24-hour extremes (`4snTTTsnTTT`). Every METAR comes back with
`remarkTemperatures`, read from `rawOb` itself, and
`parseRemarkTemperatures()` does the same for any report text you stored.

**Every report, as sent.** `getMetars()` returns every report in the
range, routine METARs and SPECIs alike, with every decoded field the
service sends (unmodelled ones included) and the raw text. A station with
nothing in range returns `[]` (the service's `204`). The bulk cache keeps
every CSV column as the exact string in the file.

**Rate limits.** aviationweather.gov allows 100 requests per minute and
blocks clients that go over. Each client paces its own requests to that
budget (`rateLimit`; `false` turns it off) and sends a custom `User-Agent`
(`userAgent`), as the service asks. A query returns at most 400 reports;
for many stations, read the cache file once a minute instead.

**Runtimes.** No credentials. The service sends no CORS headers, so it
can't be called from a browser page; everything else (Deno, Bun, Node,
Cloudflare Workers, plain V8) works. The cache file needs the standard
`DecompressionStream`.

### Out of scope (for now)

- PIREPs, SIGMETs, G-AIRMETs, station/airport info and the other Data API
  products.
- The TAF cache file (XML only).

## Documentation

| Topic                                                                                | Description                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/AviationWeather-API)         | Configuration, methods and remark groups   |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/AviationWeather-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/AviationWeather-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Data API](https://aviationweather.gov/data/api/) (usage rules, cache files)
- Remark groups are defined in the Federal Meteorological Handbook No. 1
  (FMH-1), chapter 12.

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/aviationweather
```

**Bun:**

```sh
bunx jsr add @tundraconnect/aviationweather
```

**Node.js:**

```sh
npx jsr add @tundraconnect/aviationweather
```

## Quick Start

Track the running daily high at Central Park, Midway and LAX from the bulk
cache, one request a minute for all three:

```ts
import { AviationWeather } from '@tundraconnect/aviationweather';

const awc = new AviationWeather({ userAgent: 'my-recorder/1.0' });
const cache = await awc.getMetarCache({ stations: ['KNYC', 'KMDW', 'KLAX'] });
for (const row of cache.rows) {
  const t = row.remarkTemperatures;
  console.log(
    row.station_id,
    row.observation_time,
    row.metar_type,
    t.hourly?.temperatureC ?? row.temp_c, // tenths when the T-group is there
    t.sixHourMax?.temperatureC,
  );
}
console.log('cache built', cache.lastModified);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
