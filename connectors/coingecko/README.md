# CoinGecko

Typed [CoinGecko API](https://www.coingecko.com/en/api) client for Deno, Bun,
Node.js and Cloudflare Workers, on the Demo and Pro tiers. Fetch cryptocurrency
prices, market data and the full coin list.

[![JSR](https://jsr.io/badges/@tundraconnect/coingecko)](https://jsr.io/@tundraconnect/coingecko)
[![JSR Score](https://jsr.io/badges/@tundraconnect/coingecko/score)](https://jsr.io/@tundraconnect/coingecko)

## Overview

CoinGecko provides validated simple-price, coin-list, and market-data
responses for the CoinGecko REST API. It uses RESTler for transport and
Guardian for runtime response validation.

The client works keyless against the public `demo` tier, or with an API key
against either the `demo` or paid `pro` tier — `pro` requires an `apiKey`.

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `CoinGecko` instance
and pass in a stand-in that returns the shapes from
`@tundraconnect/coingecko/schemas` or throws a real `CoinGeckoError`:

```ts
import { CoinGeckoError } from '@tundraconnect/coingecko/errors';

const outage = new CoinGeckoError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                          | Description                                |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/CoinGecko-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/CoinGecko-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/CoinGecko-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [CoinGecko API reference](https://docs.coingecko.com/reference/introduction)
- [Create a CoinGecko account](https://www.coingecko.com/en/api/pricing)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/coingecko
```

**Bun:**

```sh
bunx jsr add @tundraconnect/coingecko
```

**Node.js:**

```sh
npx jsr add @tundraconnect/coingecko
```

## Quick Start

### Keyless (demo tier)

```ts
import { CoinGecko } from '@tundraconnect/coingecko';

const client = new CoinGecko();

const prices = await client.getPrice({
  ids: ['bitcoin', 'ethereum'],
  vsCurrencies: 'usd',
});
console.log(prices.bitcoin?.usd);

const markets = await client.getMarkets({ vsCurrency: 'usd', perPage: 10 });
console.log(markets[0]?.name, markets[0]?.current_price);
```

### Pro tier

```ts
import { CoinGecko } from '@tundraconnect/coingecko';

const client = new CoinGecko({
  auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'your-pro-api-key' },
});

const coins = await client.listCoins({ includePlatform: true });
console.log(coins.length);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
