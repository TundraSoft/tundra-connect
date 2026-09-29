# OpenWeatherMap

Typed [OpenWeatherMap API](https://openweathermap.org/) client for Deno, Bun,
Node.js and Cloudflare Workers. Current weather and 5-day / 3-hour forecasts by
city name or coordinates.

[![JSR](https://jsr.io/badges/@tundraconnect/openweathermap)](https://jsr.io/@tundraconnect/openweathermap)
[![JSR Score](https://jsr.io/badges/@tundraconnect/openweathermap/score)](https://jsr.io/@tundraconnect/openweathermap)

## Overview

OpenWeatherMap provides validated current weather and 5-day/3-hour forecast
responses from the free-tier `data/2.5` endpoints. It uses RESTler for
transport and Guardian for runtime response validation.

## Documentation

| Topic                                                                               | Description                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/OpenWeatherMap-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/OpenWeatherMap-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/OpenWeatherMap-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [OpenWeatherMap API reference](https://openweathermap.org/api)
- [Create an OpenWeatherMap account](https://home.openweathermap.org/users/sign_up)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/openweathermap
```

**Bun:**

```sh
bunx jsr add @tundraconnect/openweathermap
```

**Node.js:**

```sh
npx jsr add @tundraconnect/openweathermap
```

## Quick Start

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
console.log(weather.main.temp);

const forecast = await client.getForecast({ q: 'London,GB', cnt: 8 });
console.log(forecast.list[0]?.main.temp);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
