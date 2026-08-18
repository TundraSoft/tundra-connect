# OpenWeatherMap

Typed, cross-runtime client for the [OpenWeatherMap API](https://openweathermap.org/).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

OpenWeatherMap provides validated current weather and 5-day/3-hour forecast
responses from the free-tier `data/2.5` endpoints. It uses RESTler for
transport and Guardian for runtime response validation.

## Documentation

| Topic                                     | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| [API](docs/OpenWeatherMap-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/OpenWeatherMap-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/OpenWeatherMap-Schemas.md) | Public Guardian schemas and inferred types |

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

MIT
