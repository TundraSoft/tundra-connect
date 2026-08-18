# CoinGecko

Typed, cross-runtime client for the [CoinGecko API](https://www.coingecko.com/en/api).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

CoinGecko provides validated simple-price, coin-list, and market-data
responses for the CoinGecko REST API. It uses RESTler for transport and
Guardian for runtime response validation.

The client works keyless against the public `demo` tier, or with an API key
against either the `demo` or paid `pro` tier — `pro` requires an `apiKey`.

## Documentation

| Topic                                | Description                                |
| ------------------------------------ | ------------------------------------------ |
| [API](docs/CoinGecko-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/CoinGecko-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/CoinGecko-Schemas.md) | Public Guardian schemas and inferred types |

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

MIT
