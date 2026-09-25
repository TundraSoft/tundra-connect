# OpenWeatherMap API

## Configuration

```ts
import { OpenWeatherMap } from '@tundraconnect/openweathermap';

const client = new OpenWeatherMap({
  auth: { type: 'CUSTOM', apiKey: 'your-api-key' },
  timeout: 10,
});
```

`timeout` is expressed in seconds (defaults to 10). The base URL is fixed at
`https://api.openweathermap.org/data/2.5` — OpenWeatherMap's free-tier,
stable base for current weather and 5-day forecast. The paid One Call
3.0/4.0 APIs use a different base and response shape and are out of scope
for this client.

## Locating a request

Every endpoint method accepts exactly one of four location variants:

| Variant     | Shape               | Notes                                    |
| ----------- | ------------------- | ---------------------------------------- |
| Coordinates | `{ lat, lon }`      | Most robust — no geocoding involved.     |
| City name   | `{ q }`             | Optionally `"city,state,country"`.       |
| ZIP/postal  | `{ zip, country? }` | `country` defaults to `US` when omitted. |
| City ID     | `{ id }`            | OpenWeatherMap's internal city ID.       |

Both methods also accept optional `units` (`'standard' | 'metric' |
'imperial'`, defaults to standard/Kelvin when omitted) and `lang`.

## Endpoints

| Method                | Endpoint    | Result                            |
| --------------------- | ----------- | --------------------------------- |
| `getCurrentWeather()` | `/weather`  | Current conditions for a location |
| `getForecast()`       | `/forecast` | 5-day forecast in 3-hour steps    |

```ts
import { OpenWeatherMap } from '@tundraconnect/openweathermap';

const client = new OpenWeatherMap({
  auth: { type: 'CUSTOM', apiKey: 'your-api-key' },
});

const weather = await client.getCurrentWeather({
  lat: 51.51,
  lon: -0.13,
  units: 'metric',
});
console.log(weather.main.temp, weather.weather[0]?.description);

const forecast = await client.getForecast({ q: 'London,GB', cnt: 8 });
console.log(forecast.list[0]?.main.temp, forecast.city.name);
```

`getForecast()`'s `cnt` limits the number of returned 3-hour timestamps (max
40, which covers the full 5 days).

See [Errors](OpenWeatherMap-Errors.md) for failure handling and
[Schemas](OpenWeatherMap-Schemas.md) for response validation.

---

[← Back to OpenWeatherMap](../README.md)
