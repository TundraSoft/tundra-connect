# OpenWeatherMap Schemas

The `@tundraconnect/openweathermap/schemas` subpath exports Guardian
validators and inferred types. Client methods validate every payload before
returning it.

```ts
import {
  type CurrentWeatherSchema,
  CurrentWeatherSchemaObject,
} from '@tundraconnect/openweathermap/schemas';

const payload: unknown = {
  coord: { lon: -0.13, lat: 51.51 },
  weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
  base: 'stations',
  main: {
    temp: 15.2,
    feels_like: 14.6,
    temp_min: 13.9,
    temp_max: 16.1,
    pressure: 1015,
    humidity: 72,
  },
  visibility: 10000,
  wind: { speed: 4.1, deg: 280 },
  clouds: { all: 0 },
  dt: 1700000000,
  sys: { sunrise: 1699945200, sunset: 1699977600 },
  timezone: 0,
  id: 2643743,
  name: 'London',
  cod: 200,
};

const [error, weather] = CurrentWeatherSchemaObject.safeParse(payload);
if (error || !weather) throw error;

const typedWeather: CurrentWeatherSchema = weather;
console.log(typedWeather.main.temp);
```

## Response Schemas

| Schema                       | Endpoint    |
| ---------------------------- | ----------- |
| `CurrentWeatherSchemaObject` | `/weather`  |
| `ForecastSchemaObject`       | `/forecast` |

## Component Schemas

| Schema                         | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `ForecastListItemSchemaObject` | One 3-hour forecast timestamp within the forecast response.               |
| `CoordSchemaObject`            | Geographic longitude/latitude pair.                                       |
| `WeatherConditionSchemaObject` | One vendor weather-condition entry (`id`, `main`, `description`, `icon`). |
| `CloudsSchemaObject`           | Cloudiness percentage.                                                    |
| `WindSchemaObject`             | Wind speed, direction, and optional gust.                                 |
| `ErrorSchemaObject`            | Documented `{ cod, message }` error envelope on non-2xx responses.        |

## The `cod` inconsistency

OpenWeatherMap is genuinely inconsistent about whether its `cod` field is a
number or a numeric string: `getCurrentWeather()`'s response carries it as a
number (`200`), while `getForecast()`'s response carries it as a string
(`"200"`) — and error envelopes on either endpoint may echo it as either
type. Rather than duplicate a number-vs-string check per schema, both
response schemas share one validator, `codGuard`, from `schema/Common.ts`.

---

[← Back to OpenWeatherMap](../README.md)
