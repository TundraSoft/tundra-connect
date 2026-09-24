# OpenExchange

Typed, cross-runtime client for the [Open Exchange Rates API](https://openexchangerates.org/).

## Overview

OpenExchange provides validated latest, historical, time-series, conversion,
currency, status, and OHLC responses. It uses RESTler for transport and
Guardian for runtime response validation.

## Documentation

| Topic                                   | Description                                |
| --------------------------------------- | ------------------------------------------ |
| [API](docs/OpenExchange-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/OpenExchange-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/OpenExchange-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Open Exchange Rates API reference](https://docs.openexchangerates.org/)
- [Create an Open Exchange Rates account](https://openexchangerates.org/signup)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/openexchange
```

**Bun:**

```sh
bunx jsr add @tundraconnect/openexchange
```

**Node.js:**

```sh
npx jsr add @tundraconnect/openexchange
```

## Quick Start

```ts
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  auth: { type: 'CUSTOM', appId: 'your-app-id' },
});
const rates = await client.getRates({ base: 'USD', symbols: ['EUR'] });

console.log(rates.EUR);
```

## License

MIT
