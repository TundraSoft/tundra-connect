# CoinGecko API

## Configuration

```ts
import { CoinGecko } from '@tundraconnect/coingecko';

// Keyless, demo tier
const demo = new CoinGecko();

// Demo tier with an API key (raises rate limits, still optional)
const demoWithKey = new CoinGecko({
  auth: { type: 'CUSTOM', environment: 'demo', apiKey: 'your-demo-key' },
});

// Pro tier — apiKey is required
const pro = new CoinGecko({
  auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'your-pro-key' },
});
```

Credentials go through the standard `auth` option — `{ type: 'CUSTOM',
environment, apiKey? }`:

| `auth` field  | Default  | Notes                                                               |
| ------------- | -------- | ------------------------------------------------------------------- |
| `environment` | `'demo'` | `'demo'` or `'pro'`. Selects the base URL and the auth header name. |
| `apiKey`      | —        | Optional for `demo` (keyless works). **Required** for `pro`.        |

`auth.environment: 'pro'` without an `apiKey` throws `CONFIG_MISSING_API_KEY`
at construction time — see [Errors](CoinGecko-Errors.md).

| `environment` | Base URL                               | Auth header (sent only when `apiKey` is set) |
| ------------- | -------------------------------------- | -------------------------------------------- |
| `'demo'`      | `https://api.coingecko.com/api/v3`     | `x-cg-demo-api-key`                          |
| `'pro'`       | `https://pro-api.coingecko.com/api/v3` | `x-cg-pro-api-key`                           |

## Endpoints

| Method         | Endpoint         | Result                                           |
| -------------- | ---------------- | ------------------------------------------------ |
| `getPrice()`   | `/simple/price`  | Prices for one or more coins/currencies          |
| `listCoins()`  | `/coins/list`    | Every coin CoinGecko supports                    |
| `getMarkets()` | `/coins/markets` | Paginated market data (price, cap, ATH/ATL, ...) |

```ts
import { CoinGecko } from '@tundraconnect/coingecko';

const client = new CoinGecko();

const prices = await client.getPrice({
  ids: ['bitcoin', 'ethereum'],
  vsCurrencies: ['usd', 'eur'],
  includeMarketCap: true,
});
console.log(prices.bitcoin?.usd, prices.bitcoin?.usd_market_cap);

const coins = await client.listCoins({ includePlatform: true });
console.log(coins.find((c) => c.id === 'bitcoin')?.platforms);

const markets = await client.getMarkets({
  vsCurrency: 'usd',
  order: 'market_cap_desc',
  perPage: 25,
  page: 1,
});
console.log(markets[0]?.current_price);
```

### `getPrice(options)`

- `vsCurrencies` — CSV string or array; defaults to `usd` when omitted.
- `ids` / `names` / `symbols` — CSV string or array; CoinGecko defaults to
  `ids=bitcoin` when all three are omitted.
- `includeMarketCap` / `include24hrVol` / `include24hrChange` /
  `includeLastUpdatedAt` — booleans.
- `precision` — `'full'` or a digit-count string.
- An unknown coin id is **not** an error: the response is HTTP 200 with an
  empty object.

### `listCoins(options)`

- `includePlatform` — include per-platform contract addresses.
- `status` — `'active'` or `'inactive'`.

### `getMarkets(options)`

- `vsCurrency` — **required**, singular (one snapshot currency per request).
- `ids` / `names` / `symbols` — CSV string or array.
- `order`, `perPage` (1-250, CoinGecko defaults to 100), `page`, `sparkline`,
  `priceChangePercentage`, `precision`.

See [Errors](CoinGecko-Errors.md) for failure handling and
[Schemas](CoinGecko-Schemas.md) for response validation.

---

[← Back to CoinGecko](../README.md)
