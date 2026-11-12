# OpenMeteo API

## Configuration

```ts
import { OpenMeteo } from '@tundraconnect/open-meteo';

// Free, non-commercial hosts.
const free = new OpenMeteo();

// Paid plan: every API moves to its customer-* host, with `apikey`.
const paid = new OpenMeteo({
  auth: { type: 'CUSTOM', apiKey: 'your-open-meteo-key' },
  timeout: 30,
});

// A self-hosted Open-Meteo for the archive only.
const mixed = new OpenMeteo({
  hosts: { archive: 'https://weather.internal.example.com' },
});
console.log(free.hosts.forecast, paid.hasApiKey, mixed.hosts.archive);
```

| Option         | Type                                    | Default         | Description                                                         |
| -------------- | --------------------------------------- | --------------- | ------------------------------------------------------------------- |
| `auth`         | `{ type: 'CUSTOM', apiKey }`            | —               | Paid-plan key. Switches every API to the `customer-*` hosts.        |
| `hosts`        | `Partial<Record<OpenMeteoApi, string>>` | free / customer | Per-API host override; `https://` (or `http://localhost`).          |
| `timeout`      | `number` (seconds)                      | `30`            | Per-request timeout.                                                |
| `maxRetryWait` | `number` (seconds)                      | —               | Opt into RESTler's single retry on a 429 with a `Retry-After` hint. |

The key is never readable back off the client; `hasApiKey` says whether one
is set. `hosts` returns the host each API is called on:

| API                  | Free host                                | Paid host                                         | Path           |
| -------------------- | ---------------------------------------- | ------------------------------------------------- | -------------- |
| `forecast`           | `api.open-meteo.com`                     | `customer-api.open-meteo.com`                     | `/v1/forecast` |
| `ensemble`           | `ensemble-api.open-meteo.com`            | `customer-ensemble-api.open-meteo.com`            | `/v1/ensemble` |
| `previousRuns`       | `previous-runs-api.open-meteo.com`       | `customer-previous-runs-api.open-meteo.com`       | `/v1/forecast` |
| `historicalForecast` | `historical-forecast-api.open-meteo.com` | `customer-historical-forecast-api.open-meteo.com` | `/v1/forecast` |
| `singleRuns`         | `single-runs-api.open-meteo.com`         | `customer-single-runs-api.open-meteo.com`         | `/v1/forecast` |
| `archive`            | `archive-api.open-meteo.com`             | `customer-archive-api.open-meteo.com`             | `/v1/archive`  |

## Methods

| Method                      | Result                      | Notes                                                                |
| --------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `forecast(query)`           | `OpenMeteoForecastSchema[]` | Latest forecast.                                                     |
| `ensemble(query)`           | `OpenMeteoForecastSchema[]` | Every member: `temperature_2m_member07_ncep_gefs_seamless`, ...      |
| `previousRuns(query)`       | `OpenMeteoForecastSchema[]` | `previousDays: [1, 2]` adds `<var>_previous_day1`, `_previous_day2`. |
| `historicalForecast(query)` | `OpenMeteoForecastSchema[]` | Use `startDate`/`endDate`.                                           |
| `singleRun(query)`          | `OpenMeteoForecastSchema[]` | `run` (UTC initialisation, `YYYY-MM-DDTHH:MM`) is required.          |
| `archive(query)`            | `OpenMeteoForecastSchema[]` | `startDate` and `endDate` (`YYYY-MM-DD`) are required.               |

Every method returns one entry per requested location, in request order —
also for a single location.

### Query

| Field                                                                                            | Open-Meteo parameter                        | Notes                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------- |
| `latitude`, `longitude`, `elevation`                                                             | same                                        | A number, or one value per location.                  |
| `hourly`, `minutely15`, `daily`, `current`                                                       | `hourly`, `minutely_15`, `daily`, `current` | Variable names, any the API offers.                   |
| `models`                                                                                         | `models`                                    | Model ids; see `OPEN_METEO_MODELS` for common ones.   |
| `timezone`, `timeformat`                                                                         | same                                        | `timeformat: 'unixtime'` avoids DST ambiguity.        |
| `temperatureUnit`, `windSpeedUnit`, `precipitationUnit`                                          | `temperature_unit`, ...                     |                                                       |
| `pastDays`, `forecastDays`, `pastHours`, `forecastHours`, `pastMinutely15`, `forecastMinutely15` | `past_days`, ...                            |                                                       |
| `startDate`, `endDate`                                                                           | `start_date`, `end_date`                    | `YYYY-MM-DD`.                                         |
| `startHour`, `endHour`, `startMinutely15`, `endMinutely15`                                       | `start_hour`, ...                           | `YYYY-MM-DDTHH:MM`.                                   |
| `cellSelection`                                                                                  | `cell_selection`                            | `land`, `sea` or `nearest`.                           |
| `params`                                                                                         | verbatim                                    | Any other parameter; arrays are sent comma-separated. |

Coordinates, dates and `run` are validated locally (`INVALID_REQUEST`)
before any request is made. Variable and model names are not: Open-Meteo
rejects an unknown one with `BAD_REQUEST` and its own `reason`.

### Splitting columns

```ts
import { columns, OpenMeteo } from '@tundraconnect/open-meteo';

const client = new OpenMeteo();
const [r] = await client.ensemble({
  latitude: 41.786,
  longitude: -87.752,
  hourly: ['temperature_2m'],
  models: ['gfs_seamless', 'ecmwf_ifs025'],
});
for (const c of columns(r!.hourly!, ['temperature_2m'])) {
  // c.member is 0 for the control run; c.model is the suffix Open-Meteo used
  // (it answers gfs_seamless with ncep_gefs_seamless).
  console.log(c.key, c.member, c.model, c.values.length);
}
```

Pass every variable you requested: names are matched longest first, so
`temperature_2m_max` is never read as `temperature_2m` plus a model.

See [Errors](OpenMeteo-Errors.md) for failure handling and
[Schemas](OpenMeteo-Schemas.md) for the response shape.
