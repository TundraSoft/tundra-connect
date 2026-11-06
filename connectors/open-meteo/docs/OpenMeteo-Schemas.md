# OpenMeteo Schemas

The `@tundraconnect/open-meteo/schemas` subpath exports the Guardian
validators the client uses, with their types. Every method validates each
location before returning it.

```ts
import {
  type OpenMeteoForecastSchema,
  OpenMeteoForecastSchemaObject,
} from '@tundraconnect/open-meteo/schemas';

const recorded: unknown = {
  latitude: 40.78858,
  longitude: -73.9661,
  generationtime_ms: 0.2,
  utc_offset_seconds: 0,
  timezone: 'GMT',
  timezone_abbreviation: 'GMT',
  elevation: 40,
  hourly_units: { time: 'unixtime', temperature_2m: '°C' },
  hourly: { time: [1793923200, 1793926800], temperature_2m: [21.1, null] },
};

const [error, location] = OpenMeteoForecastSchemaObject.safeParse(recorded);
if (error) throw error;
const typed: OpenMeteoForecastSchema = location;
console.log(typed.hourly?.temperature_2m);
```

| Schema                              | Type                          | Shape                                                                                                                                  |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenMeteoForecastSchemaObject`     | `OpenMeteoForecastSchema`     | One location: grid cell, `elevation`, timezone, `current`/`hourly`/`minutely_15`/`daily` and their `*_units`. Unknown fields are kept. |
| `OpenMeteoSeriesBlockSchemaObject`  | `OpenMeteoSeriesBlockSchema`  | `{ time, <column>: [...] }`; every column must be exactly as long as `time` and hold numbers, strings or `null`.                       |
| `OpenMeteoCurrentBlockSchemaObject` | `OpenMeteoCurrentBlockSchema` | `{ time, interval, <variable>: value }`.                                                                                               |
| `OpenMeteoErrorBodySchemaObject`    | `OpenMeteoErrorBodySchema`    | `{ error, reason }` of a refused request.                                                                                              |

Keys stay exactly as Open-Meteo sends them (`utc_offset_seconds`,
`temperature_2m_gfs_seamless`); nothing is renamed, filled in or rounded.
`latitude`/`longitude` are the grid cell the data comes from, which can
differ from the coordinates requested.
