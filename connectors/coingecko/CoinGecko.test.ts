import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { CoinGecko } from './CoinGecko.ts';
import { CoinGeckoError } from './errors/mod.ts';

const marketEntry = {
  id: 'bitcoin',
  symbol: 'btc',
  name: 'Bitcoin',
  image: 'https://example.com/bitcoin.png',
  current_price: 65000.5,
  market_cap: 1_280_000_000_000,
  market_cap_rank: 1,
  total_volume: 25_000_000_000,
  high_24h: 66000,
  low_24h: 64000,
  price_change_24h: 500,
  price_change_percentage_24h: 0.77,
  circulating_supply: 19_700_000,
  total_supply: 21_000_000,
  max_supply: 21_000_000,
  ath: 73750,
  ath_date: '2024-03-14T07:10:36.635Z',
  atl: 67.81,
  atl_date: '2013-07-06T00:00:00.000Z',
  roi: null,
  last_updated: '2024-06-01T00:00:00.000Z',
};

class MockCoinGecko extends CoinGecko {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };
  private responseBody: unknown = {};
  private responseStatus = 200;

  setResponse(body: unknown, status = 200): void {
    this.responseBody = body;
    this.responseStatus = status;
    // deno-lint-ignore require-await
    this._fetch = async (input, init) => {
      const headers: Record<string, string> = {};
      if (init?.headers) {
        for (
          const [key, value] of Object.entries(
            init.headers as Record<string, string>,
          )
        ) {
          headers[key] = value;
        }
      }
      this.request = { url: String(input), method: init?.method, headers };
      return new Response(JSON.stringify(this.responseBody), {
        status: this.responseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }
}

describe('CoinGecko', () => {
  it('defaults to the demo environment with no API key required', () => {
    const client = new MockCoinGecko();
    asserts.assertEquals(client.vendor, 'CoinGecko');
    asserts.assertEquals(client.environment, 'demo');
    asserts.assertEquals(client.apiKey, undefined);
  });

  it('exposes validated configuration through named getters', () => {
    const client = new MockCoinGecko({
      auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'my-pro-key' },
    });
    asserts.assertEquals(client.environment, 'pro');
    asserts.assertEquals(client.apiKey, 'my-pro-key');
  });

  it('rejects an invalid environment value', () => {
    asserts.assertThrows(
      () =>
        new MockCoinGecko({
          auth: { type: 'CUSTOM', environment: 'staging' as never },
        }),
      CoinGeckoError,
      "Environment must be 'demo' or 'pro'",
    );
  });

  it('renders a placeholder-safe message when auth.environment is itself undefined', () => {
    // A non-`CUSTOM` auth value (or any caller bypassing TypeScript) can
    // reach `_processOption` with `environment` itself undefined — the
    // error constructor's placeholder tripwire fills the missing value
    // with a neutral marker, so the thrown message must not contain a
    // literal unpopulated `${environment}` placeholder.
    let thrown: CoinGeckoError | undefined;
    try {
      new MockCoinGecko({ auth: { type: 'BASIC' } as never });
    } catch (error) {
      thrown = error as CoinGeckoError;
    }
    asserts.assertExists(thrown);
    asserts.assertInstanceOf(thrown, CoinGeckoError);
    asserts.assertStringIncludes(
      thrown.message,
      "Environment must be 'demo' or 'pro', got <environment unavailable>.",
    );
    asserts.assertEquals(thrown.message.includes('${'), false);
  });

  it('rejects an empty API key', () => {
    asserts.assertThrows(
      () =>
        new MockCoinGecko({
          auth: { type: 'CUSTOM', environment: 'demo', apiKey: '   ' },
        }),
      CoinGeckoError,
      'API key must be a non-empty string',
    );
  });

  it('fails fast when environment is pro without an apiKey', () => {
    asserts.assertThrows(
      () => new MockCoinGecko({ auth: { type: 'CUSTOM', environment: 'pro' } }),
      CoinGeckoError,
      'apiKey is required when environment',
    );
  });

  it('uses the demo base URL and omits the auth header when keyless', async () => {
    const client = new MockCoinGecko();
    client.setResponse({ bitcoin: { usd: 65000 } });

    await client.getPrice({ ids: 'bitcoin', vsCurrencies: 'usd' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'https://api.coingecko.com/api/v3/simple/price',
    );
    asserts.assertEquals(
      client.request?.headers?.['x-cg-demo-api-key'],
      undefined,
    );
    asserts.assertEquals(
      client.request?.headers?.['x-cg-pro-api-key'],
      undefined,
    );
  });

  it('sets the demo header when an apiKey is configured in demo environment', async () => {
    const client = new MockCoinGecko({
      auth: { type: 'CUSTOM', environment: 'demo', apiKey: 'demo-key' },
    });
    client.setResponse({ bitcoin: { usd: 65000 } });

    await client.getPrice({ ids: 'bitcoin' });

    asserts.assertEquals(
      client.request?.headers?.['x-cg-demo-api-key'],
      'demo-key',
    );
  });

  it('switches to the pro base URL and header when environment is pro', async () => {
    const client = new MockCoinGecko({
      auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'my-pro-key' },
    });
    client.setResponse([marketEntry]);

    await client.getMarkets({ vsCurrency: 'usd' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'https://pro-api.coingecko.com/api/v3/coins/markets',
    );
    asserts.assertEquals(
      client.request?.headers?.['x-cg-pro-api-key'],
      'my-pro-key',
    );
    asserts.assertEquals(
      client.request?.headers?.['x-cg-demo-api-key'],
      undefined,
    );
  });

  it('requests prices with CSV-joined ids/symbols/currencies', async () => {
    const client = new MockCoinGecko();
    client.setResponse({
      bitcoin: { usd: 65000, usd_market_cap: 1_280_000_000_000 },
    });

    const prices = await client.getPrice({
      ids: ['bitcoin', 'ethereum'],
      vsCurrencies: ['usd', 'eur'],
      includeMarketCap: true,
    });

    asserts.assertEquals(prices.bitcoin?.usd, 65000);
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'ids=bitcoin%2Cethereum',
    );
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'vs_currencies=usd%2Ceur',
    );
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'include_market_cap=true',
    );
  });

  it('defaults vs_currencies to usd when omitted', async () => {
    const client = new MockCoinGecko();
    client.setResponse({ bitcoin: { usd: 65000 } });

    await client.getPrice({ ids: 'bitcoin' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'vs_currencies=usd',
    );
  });

  it('falls back to the usd default when vsCurrencies is an empty array', async () => {
    const client = new MockCoinGecko();
    client.setResponse({ bitcoin: { usd: 65000 } });

    await client.getPrice({ ids: 'bitcoin', vsCurrencies: [] });

    const url = new URL(client.request?.url ?? 'https://invalid.example');
    asserts.assertEquals(url.searchParams.get('vs_currencies'), 'usd');
  });

  it('omits the ids param entirely when ids is an empty array', async () => {
    const client = new MockCoinGecko();
    client.setResponse({});

    await client.getPrice({ ids: [], vsCurrencies: 'usd' });

    const url = new URL(client.request?.url ?? 'https://invalid.example');
    asserts.assertEquals(url.searchParams.has('ids'), false);
    asserts.assertEquals(url.searchParams.get('vs_currencies'), 'usd');
  });

  it('returns an empty object for an unknown coin id without erroring', async () => {
    const client = new MockCoinGecko();
    client.setResponse({});

    const prices = await client.getPrice({ ids: 'not-a-real-coin' });

    asserts.assertEquals(prices, {});
  });

  it('lists coins with optional platform data', async () => {
    const client = new MockCoinGecko();
    client.setResponse([
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
      {
        id: 'usd-coin',
        symbol: 'usdc',
        name: 'USD Coin',
        platforms: { ethereum: '0xa0b8...' },
      },
    ]);

    const coins = await client.listCoins({ includePlatform: true });

    asserts.assertEquals(coins.length, 2);
    asserts.assertEquals(coins[1]?.platforms?.ethereum, '0xa0b8...');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'include_platform=true',
    );
  });

  it('gets markets with pagination and sparkline query params', async () => {
    const client = new MockCoinGecko();
    client.setResponse([marketEntry]);

    const markets = await client.getMarkets({
      vsCurrency: 'usd',
      perPage: 10,
      page: 2,
      sparkline: false,
    });

    asserts.assertEquals(markets[0]?.id, 'bitcoin');
    asserts.assertStringIncludes(client.request?.url ?? '', 'vs_currency=usd');
    asserts.assertStringIncludes(client.request?.url ?? '', 'per_page=10');
    asserts.assertStringIncludes(client.request?.url ?? '', 'page=2');
    asserts.assertStringIncludes(client.request?.url ?? '', 'sparkline=false');
  });

  it('rejects malformed successful responses', async () => {
    const client = new MockCoinGecko();
    client.setResponse({ not: 'an-array' });

    await asserts.assertRejects(
      () => client.getMarkets({ vsCurrency: 'usd' }),
      CoinGeckoError,
      'CoinGecko API response did not match the expected schema',
    );
  });

  it('maps every documented vendor error_code', async () => {
    const cases: Array<{
      body: unknown;
      status: number;
      expected: string;
    }> = [
      {
        status: 401,
        body: { status: { error_code: 10002, error_message: 'no key' } },
        expected: 'no API key was supplied',
      },
      {
        status: 403,
        body: { status: { error_code: 10005, error_message: 'plan' } },
        expected: 'not available on your CoinGecko plan',
      },
      {
        status: 401,
        body: {
          error: { status: { error_code: 10010, error_message: 'wrong host' } },
        },
        expected: 'does not match the requested host',
      },
      {
        status: 401,
        body: { status: { error_code: 10011, error_message: 'wrong host' } },
        expected: 'does not match the requested host',
      },
    ];

    for (const testCase of cases) {
      const client = new MockCoinGecko();
      client.setResponse(testCase.body, testCase.status);
      await asserts.assertRejects(
        () => client.getPrice({ ids: 'bitcoin' }),
        CoinGeckoError,
        testCase.expected,
      );
    }
  });

  it('maps status-based errors when no documented error_code is present', async () => {
    const cases: Array<{
      body: unknown;
      status: number;
      expected: string;
    }> = [
      { status: 429, body: { error: 'rate limited' }, expected: 'rate limit' },
      {
        status: 400,
        body: { error: 'invalid vs_currency' },
        expected: 'invalid',
      },
      { status: 422, body: { error: 'unprocessable' }, expected: 'invalid' },
      { status: 404, body: { error: 'not found' }, expected: 'not found' },
      {
        status: 500,
        body: 'Internal Server Error',
        expected: 'currently unavailable',
      },
      {
        status: 403,
        body: { error: 'forbidden, no known code' },
        expected: 'unknown error occurred',
      },
    ];

    for (const testCase of cases) {
      const client = new MockCoinGecko();
      client.setResponse(testCase.body, testCase.status);
      await asserts.assertRejects(
        () => client.getPrice({ ids: 'bitcoin' }),
        CoinGeckoError,
        testCase.expected,
      );
    }
  });

  it('falls back to a status-based error when the body matches no envelope shape', async () => {
    const client = new MockCoinGecko();
    client.setResponse({ totally: 'unexpected' }, 503);

    await asserts.assertRejects(
      () => client.getPrice({ ids: 'bitcoin' }),
      CoinGeckoError,
      'currently unavailable',
    );
  });

  it('redacts the API-key header in call event payloads', async () => {
    for (
      const [environment, header] of [
        ['demo', 'x-cg-demo-api-key'],
        ['pro', 'x-cg-pro-api-key'],
      ] as const
    ) {
      const rawKey = `super-secret-${environment}-key-must-not-leak`;
      const client = new MockCoinGecko({
        auth: { type: 'CUSTOM', environment, apiKey: rawKey },
      });
      client.setResponse({ bitcoin: { usd: 65000 } });
      const captured: unknown[] = [];
      client.on('call', (_vendor, request) => {
        captured.push(request);
      });

      await client.getPrice({ ids: 'bitcoin' });

      asserts.assertEquals(captured.length, 1);
      const request = captured[0] as { headers?: Record<string, string> };
      asserts.assertEquals(request.headers?.[header], '[REDACTED]');
      asserts.assertEquals(JSON.stringify(captured[0]).includes(rawKey), false);
      // The wire request itself still carries the real key.
      asserts.assertEquals(client.request?.headers?.[header], rawKey);
    }
  });

  it('never leaks the raw API key into a thrown error or its serialized context', async () => {
    const rawKey = 'super-secret-pro-key-must-not-leak';
    const client = new MockCoinGecko({
      auth: { type: 'CUSTOM', environment: 'pro', apiKey: rawKey },
    });
    // A 200 body that fails schema validation — the resulting error chain
    // records the failed request (headers included) in its context.
    client.setResponse({ not: 'an-array' });
    let capturedError: { toJSON: () => unknown } | undefined;
    client.on('call', (_vendor, _request, _response, error) => {
      capturedError = error;
    });

    let caught: CoinGeckoError | undefined;
    try {
      await client.getMarkets({ vsCurrency: 'usd' });
    } catch (error) {
      caught = error as CoinGeckoError;
    }

    asserts.assertExists(caught);
    asserts.assertInstanceOf(caught, CoinGeckoError);
    const caughtJson = JSON.stringify(caught.toJSON());
    asserts.assertEquals(caughtJson.includes(rawKey), false);

    // The `call` event's error argument (whose context records the failed
    // request) shows the redacted header value, never the raw key.
    asserts.assertExists(capturedError);
    const eventErrorJson = JSON.stringify(capturedError.toJSON());
    asserts.assertStringIncludes(eventErrorJson, '[REDACTED]');
    asserts.assertEquals(eventErrorJson.includes(rawKey), false);
  });
});

const env = envArgs();
const credentials = {
  apiKey: env.get('CONNECTOR_COINGECKO_API_KEY'),
};
const liveTestsEnabled = !!credentials.apiKey;

describe({
  name: 'CoinGecko — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('fetches real prices from the CoinGecko API', async () => {
      const client = new CoinGecko({
        auth: {
          type: 'CUSTOM',
          environment: 'demo',
          apiKey: credentials.apiKey!,
        },
      });
      const prices = await client.getPrice({
        ids: 'bitcoin',
        vsCurrencies: ['usd'],
      });
      asserts.assertExists(prices['bitcoin']);
    });

    it('lists real coins from the CoinGecko API', async () => {
      const client = new CoinGecko({
        auth: {
          type: 'CUSTOM',
          environment: 'demo',
          apiKey: credentials.apiKey!,
        },
      });
      const coins = await client.listCoins();
      asserts.assertEquals(Array.isArray(coins), true);
    });

    it('fetches real market data from the CoinGecko API', async () => {
      const client = new CoinGecko({
        auth: {
          type: 'CUSTOM',
          environment: 'demo',
          apiKey: credentials.apiKey!,
        },
      });
      const markets = await client.getMarkets({ vsCurrency: 'usd' });
      asserts.assertEquals(Array.isArray(markets), true);
    });
  },
});
