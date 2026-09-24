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

## Migrating from 0.1.x

0.2.0 is the first release built on the current RESTler/Guardian
conventions. The method signatures, return types, and every exported schema
and error name are unchanged. What changes:

**1. The App ID moves under `auth`** (a compile error until updated):

```ts ignore
// 0.1.x
const client = new OpenExchange({ appId: 'your-app-id' });

// 0.2.0
const client = new OpenExchange({
  auth: { type: 'CUSTOM', appId: 'your-app-id' },
});
```

**2. Some errors now carry a more accurate code.** Code that branches on
`OpenExchangeError` should check these:

| Situation                                           | 0.1.x                                                                           | 0.2.0                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| HTTP 429 (rate limited)                             | `RESPONSE_ERROR`                                                                | `RATE_LIMITED`, with `retryAfterSeconds` in context |
| An undocumented 4xx (e.g. 418)                      | `SERVICE_UNAVAILABLE` — or returned as success if the body happened to validate | `UNKNOWN_ERROR`                                     |
| `getHistoricalRates()` with a non-`YYYY-MM-DD` date | sent to the vendor                                                              | rejected locally with `INVALID_DATE`, no request    |

**3. Additions (non-breaking):** every error exposes a readonly `code`, so
you can branch on `error.code === 'RATE_LIMITED'` instead of matching
`.message`; and passing `maxRetryWait` at construction makes the client wait
out a rate-limit hint and retry once — see [Errors](docs/OpenExchange-Errors.md).

## License

MIT
