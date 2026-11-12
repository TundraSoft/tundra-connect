# AviationWeather Schemas

The `@tundraconnect/aviationweather/schemas` subpath exports the Guardian
validators the client applies to every report, with their types.

```ts
import {
  type AviationWeatherMetarSchema,
  AviationWeatherMetarSchemaObject,
} from '@tundraconnect/aviationweather/schemas';
import { parseRemarkTemperatures } from '@tundraconnect/aviationweather';

const stored: unknown = {
  icaoId: 'KNYC',
  obsTime: 1794001860,
  metarType: 'METAR',
  temp: 16.1,
  dewp: 15,
  wdir: 0,
  visib: '10+',
  rawOb:
    'METAR KNYC 062151Z AUTO 00000KT 10SM BKN047 OVC065 16/15 A2983 RMK AO2 SLP094 T01610150',
};

const [error, metar] = AviationWeatherMetarSchemaObject.safeParse(stored);
if (error) throw error;
const typed: AviationWeatherMetarSchema = metar;
console.log(parseRemarkTemperatures(typed.rawOb).hourly?.temperatureC);
```

| Schema                                  | Type                              | Shape                                                             |
| --------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `AviationWeatherMetarSchemaObject`      | `AviationWeatherMetarSchema`      | One decoded METAR/SPECI with `rawOb`. Unknown fields are kept.    |
| `AviationWeatherCloudLayerSchemaObject` | `AviationWeatherCloudLayerSchema` | `{ cover, base }`.                                                |
| `AviationWeatherTafSchemaObject`        | `AviationWeatherTafSchema`        | One TAF with `rawTAF` and `fcsts`.                                |
| `AviationWeatherTafPeriodSchemaObject`  | `AviationWeatherTafPeriodSchema`  | One forecast period (`FM`, `TEMPO`, `BECMG`, `PROB` or the base). |
| `AviationWeatherErrorBodySchemaObject`  | `AviationWeatherErrorBodySchema`  | `{ status, error }` of a refused request.                         |

Numeric fields are strict (a numeric string is rejected, not coerced);
`wdir` and `visib` accept the service's string values (`VRB`, `10+`).
`AviationWeatherMetar` (from the package root) is the schema type plus the
client's `remarkTemperatures`.
