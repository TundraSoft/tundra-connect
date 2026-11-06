# AviationWeather API

## Configuration

```ts
import { AviationWeather } from '@tundraconnect/aviationweather';

const awc = new AviationWeather({
  userAgent: 'my-recorder/1.0 (ops@example.com)',
  rateLimit: { requests: 100, windowMs: 60_000 }, // the default
  timeout: 30,
});
console.log(awc.rateLimit);
```

| Option         | Type                                | Default                              | Description                                                          |
| -------------- | ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `rateLimit`    | `{ requests, windowMs }` or `false` | `{ requests: 100, windowMs: 60000 }` | Sliding-window budget; each request waits for a slot, in call order. |
| `userAgent`    | `string`                            | `@tundraconnect/aviationweather`     | Sent as `User-Agent`; the service asks for a custom one.             |
| `timeout`      | `number` (seconds)                  | `30`                                 | Per-request timeout.                                                 |
| `maxRetryWait` | `number` (seconds)                  | —                                    | Opt into RESTler's single retry on a 429 with a `Retry-After` hint.  |

The budget is per client: share one client across your process, or set
`rateLimit: false` and budget yourself when several processes call the
service from one address.

## Methods

### `getMetars(query)`

| Field   | Type                               | Description                                                             |
| ------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `ids`   | `string` or `string[]`             | ICAO ids (`KNYC`), or a selector such as `@NY`. Required unless `bbox`. |
| `bbox`  | `[minLat, minLon, maxLat, maxLon]` | Stations in a box.                                                      |
| `hours` | `number`                           | Hours back from `date` (or now).                                        |
| `date`  | `Date` or ISO 8601 string          | End of the range. The service keeps 30 days.                            |

Returns every METAR and SPECI in range as `AviationWeatherMetar`: the
decoded fields (`temp`, `dewp`, `wdir` — a number or `VRB` — `visib` — a
number or `10+` — `altim`, `clouds`, `fltCat`, ...), `rawOb`, `obsTime`
(Unix seconds), `reportTime`, `receiptTime`, and `remarkTemperatures`.

### `getTafs(query)`

`ids`/`bbox`/`date` as above, plus `time: 'valid' | 'issue'` (TAFs valid at
`date`, the default, or issued then). Returns `rawTAF`, `issueTime`,
`validTimeFrom`/`validTimeTo` and the decoded `fcsts` periods.

### `getMetarCache({ stations? })`

Downloads `metars.cache.csv.gz` (every current METAR worldwide, rebuilt
about once a minute), decompresses it and returns `{ header, rows,
lastModified }`. Each row keeps every column as the file's exact text
(`''` when blank); the repeated `sky_cover`/`cloud_base_ft_agl` columns
become arrays in file order. `stations` filters rows by station id,
case-insensitively.

## Remark temperatures

`parseRemarkTemperatures(rawOb)` (also applied to every METAR and cache
row) reads only tokens after `RMK`, each as a whole token:

| Field            | Group         | Example                           |
| ---------------- | ------------- | --------------------------------- |
| `hourly`         | `TsnTTTsnTTT` | `T01610150` → 16.1 °C / 15.0 °C   |
| `sixHourMax`     | `1snTTT`      | `10200` → 20.0 °C                 |
| `sixHourMin`     | `2snTTT`      | `21128` → −12.8 °C                |
| `twentyFourHour` | `4snTTTsnTTT` | `401001128` → max 10.0, min −12.8 |

`sn` is the sign (`1` = negative) and `TTT` tenths of a degree. Each entry
keeps the `group` text it came from. A group with missing digits
(`1////`) is ignored; non-US reports usually carry none.

See [Errors](AviationWeather-Errors.md) for failure handling and
[Schemas](AviationWeather-Schemas.md) for the decoded shapes.
