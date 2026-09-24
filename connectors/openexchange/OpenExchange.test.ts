import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { OpenExchange } from './OpenExchange.ts';
import { OpenExchangeError } from './errors/mod.ts';

const latestRatesResponse = {
  disclaimer: 'Exchange rates are provided for informational purposes.',
  license: 'https://openexchangerates.org/license',
  timestamp: 1640995200,
  base: 'USD',
  rates: { EUR: 0.883, GBP: 0.741 },
};

class MockOpenExchange extends OpenExchange {
  public request?: { url: string; method?: string };
  private responseBody: unknown = latestRatesResponse;
  private responseStatus = 200;

  /** Like setResponse, but with explicit response headers — for rate-limit hints. */
  setResponseWithHeaders(
    body: unknown,
    status: number,
    headers: Record<string, string>,
  ): void {
    this._fetch = (input, init) => {
      this.request = { url: String(input), method: init?.method };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
      );
    };
  }

  setResponse(body: unknown, status = 200): void {
    this.responseBody = body;
    this.responseStatus = status;
    this._fetch = async (input, init) => {
      this.request = { url: String(input), method: init?.method };
      return new Response(JSON.stringify(this.responseBody), {
        status: this.responseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }
}

describe('OpenExchange', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
      baseCurrency: 'eur',
      timeout: 30,
    });

    asserts.assertEquals(client.vendor, 'OpenExchange');
    // The App ID is deliberately NOT readable back off the client.
    asserts.assertEquals(
      (client as unknown as Record<string, unknown>).appId,
      undefined,
    );
    asserts.assertEquals(client.baseCurrency, 'EUR');
    asserts.assertEquals(client.timeout, 30);
  });

  it('rejects invalid client configuration', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockOpenExchange({} as any),
      OpenExchangeError,
      'Application ID must be a non-empty string',
    );
    asserts.assertThrows(
      () => new MockOpenExchange({ auth: { type: 'CUSTOM', appId: '' } }),
      OpenExchangeError,
      'Application ID must be a non-empty string',
    );
    asserts.assertThrows(
      () =>
        new MockOpenExchange({
          auth: { type: 'CUSTOM', appId: 'test-app-id' },
          baseCurrency: 'EURO',
        }),
      OpenExchangeError,
      'Base currency must be a 3-character string',
    );
  });

  it('requests and validates latest rates through RESTler', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse(latestRatesResponse);

    const rates = await client.getRates({
      base: 'eur',
      symbols: ['usd', 'gbp'],
    });

    asserts.assertEquals(rates, { EUR: 0.883, GBP: 0.741 });
    asserts.assertEquals(client.request?.method, 'GET');
    asserts.assertStringIncludes(client.request?.url ?? '', '/latest.json');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'app_id=test-app-id',
    );
    asserts.assertStringIncludes(client.request?.url ?? '', 'base=EUR');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'symbols=USD%2CGBP',
    );
  });

  it('maps documented vendor errors to OpenExchange errors', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse({
      error: true,
      status: 401,
      message: 'invalid_app_id',
      description: 'Invalid application ID.',
    }, 401);

    await asserts.assertRejects(
      () => client.getRates(),
      OpenExchangeError,
      'Invalid application ID provided',
    );
  });

  it('rejects malformed successful responses', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse({ rates: { EU: -1 } });

    await asserts.assertRejects(
      () => client.getRates(),
      OpenExchangeError,
      'did not match the expected schema',
    );
  });

  it('validates every documented endpoint response', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });

    client.setResponse({
      status: 200,
      data: {
        app_id: 'test-app-id',
        status: 'ACTIVE',
        plan: {
          name: 'Free',
          quota: '1,000 requests/month',
          update_frequency: '60 minutes',
          features: {
            base: true,
            symbols: true,
            experimental: false,
            'time-series': false,
            convert: false,
            'bid-ask': false,
            ohlc: false,
            spot: true,
          },
        },
        usage: {
          requests: 1,
          requests_quota: 1000,
          requests_remaining: 999,
          days_elapsed: 1,
          days_remaining: 29,
          daily_average: 1,
        },
      },
    });
    asserts.assertEquals((await client.getStatus()).status, 200);

    client.setResponse({ USD: 'United States Dollar' });
    asserts.assertEquals(
      (await client.listCurrencies()).USD,
      'United States Dollar',
    );

    client.setResponse({
      timestamp: 1703894400,
      base: 'USD',
      rates: { EUR: 0.8945 },
    });
    asserts.assertEquals(
      (await client.getHistoricalRates('2023-12-01')).rates.EUR,
      0.8945,
    );

    client.setResponse({
      start_date: '2023-12-01',
      end_date: '2023-12-03',
      base: 'USD',
      rates: { '2023-12-01': { EUR: 0.8945 } },
    });
    asserts.assertEquals(
      (await client.getTimeSeries('2023-12-01', '2023-12-03'))
        .rates['2023-12-01']?.EUR,
      0.8945,
    );

    client.setResponse({
      request: {
        query: '100.0 USD => EUR',
        amount: 100,
        from: 'USD',
        to: 'EUR',
      },
      meta: { timestamp: 1640995200, rate: 0.9023 },
      response: 90.23,
    });
    asserts.assertEquals(
      (await client.convert(100, 'USD', 'EUR')).response,
      90.23,
    );

    client.setResponse({
      start_date: '2023-12-01',
      end_date: '2023-12-03',
      rates: {
        '2023-12-01': {
          EUR: { open: 1, high: 2, low: 0.5, close: 1.5, average: 1.25 },
        },
      },
    });
    asserts.assertEquals(
      (await client.getOHLC('2023-12-01', '1d')).rates['2023-12-01']?.EUR
        ?.close,
      1.5,
    );
  });

  it('sends convert() as a path-based request, not /convert.json', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse({
      request: {
        query: '100.0 USD => EUR',
        amount: 100,
        from: 'USD',
        to: 'EUR',
      },
      meta: { timestamp: 1640995200, rate: 0.9023 },
      response: 90.23,
    });

    await client.convert(100, 'USD', 'EUR');

    const url = client.request?.url ?? '';
    asserts.assertEquals(client.request?.method, 'GET');
    asserts.assertStringIncludes(url, '/convert/100/USD/EUR');
    asserts.assertEquals(url.includes('/convert.json'), false);
    asserts.assertEquals(url.includes('amount='), false);
    asserts.assertEquals(url.includes('from='), false);
    asserts.assertEquals(url.includes('to='), false);

    // Historical conversion still passes `date` as a query param on top
    // of the path-based endpoint.
    client.setResponse({
      request: {
        query: '100.0 USD => EUR',
        amount: 100,
        from: 'USD',
        to: 'EUR',
      },
      meta: { timestamp: 1640995200, rate: 0.9023 },
      response: 90.23,
    });
    await client.convert(100, 'USD', 'EUR', { date: '2023-01-01' });
    const historicalUrl = client.request?.url ?? '';
    asserts.assertStringIncludes(historicalUrl, '/convert/100/USD/EUR');
    asserts.assertStringIncludes(historicalUrl, 'date=2023-01-01');
  });

  it('rejects a malformed getHistoricalRates() date before any request is sent', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse(latestRatesResponse);

    // Wrong separator — would otherwise 404 misleadingly as
    // /historical/2023/01/01.json.
    await asserts.assertRejects(
      () => client.getHistoricalRates('2023/01/01'),
      OpenExchangeError,
      'must be a YYYY-MM-DD string',
    );

    // Path traversal — '../latest' would otherwise collapse onto the real
    // /latest.json endpoint and silently return CURRENT rates labelled
    // historical (the schemas are shape-identical).
    await asserts.assertRejects(
      () => client.getHistoricalRates('../latest'),
      OpenExchangeError,
      'must be a YYYY-MM-DD string',
    );

    // Confirm no request ever hit the wire.
    asserts.assertEquals(client.request, undefined);
  });

  it('requests the /historical/{date}.json path for a valid date', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse({
      timestamp: 1705276800,
      base: 'USD',
      rates: { EUR: 0.9134 },
    });

    await client.getHistoricalRates('2024-01-15');

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      '/historical/2024-01-15.json',
    );
  });

  it('sends getOHLC() start date under the start_time query key', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponse({
      start_date: '2023-12-01',
      end_date: '2023-12-03',
      rates: {
        '2023-12-01': {
          EUR: { open: 1, high: 2, low: 0.5, close: 1.5, average: 1.25 },
        },
      },
    });

    await client.getOHLC('2023-12-01', '1d');

    const url = client.request?.url ?? '';
    asserts.assertStringIncludes(url, '/ohlc.json');
    asserts.assertStringIncludes(url, 'start_time=2023-12-01');
    asserts.assertEquals(url.includes('start_date='), false);
  });

  it('maps every reachable vendor error code', async () => {
    const errorCases: Array<{
      status: number;
      message?: string;
      expected: string;
      call: (client: MockOpenExchange) => Promise<unknown>;
    }> = [
      {
        status: 400,
        message: 'missing_app_id',
        expected: 'Application ID is required',
        call: (client) => client.getRates(),
      },
      {
        status: 403,
        message: 'not_allowed',
        expected: 'not allowed',
        call: (client) => client.convert(1, 'USD', 'EUR'),
      },
      {
        status: 404,
        message: 'not_found',
        expected: 'not found',
        call: (client) => client.getHistoricalRates('2023-12-01'),
      },
      {
        status: 400,
        message: 'invalid_base',
        expected: 'did not match the expected schema',
        call: (client) => client.getRates(),
      },
      {
        status: 500,
        expected: 'service is currently unavailable',
        call: (client) => client.getRates(),
      },
      // Undocumented 4xx statuses are request-side problems, not outages —
      // they fall back to UNKNOWN_ERROR, not SERVICE_UNAVAILABLE.
      {
        status: 418,
        expected: 'An unknown error occurred in Open Exchange',
        call: (client) => client.getRates(),
      },
    ];

    for (const errorCase of errorCases) {
      const client = new MockOpenExchange({
        auth: { type: 'CUSTOM', appId: 'test-app-id' },
      });
      client.setResponse(
        errorCase.message
          ? {
            error: true,
            status: errorCase.status,
            message: errorCase.message,
            description: 'Vendor error.',
          }
          : { error: 'unavailable' },
        errorCase.status,
      );
      await asserts.assertRejects(
        () => errorCase.call(client),
        OpenExchangeError,
        errorCase.expected,
      );
    }
  });
});

/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('OpenExchange — credential custody', () => {
  it('does not echo a rejected app id into the config error', () => {
    // Regression: the config error used to carry `{ appId }` — the API
    // credential — in its logged context. A non-string trips the guard.
    const err = asserts.assertThrows(
      () =>
        new MockOpenExchange(
          { auth: { type: 'CUSTOM', appId: 987654321 } } as unknown as {
            auth: { type: 'CUSTOM'; appId: string };
          },
        ),
      OpenExchangeError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_APP_ID');
    asserts.assert(!dumpError(err).includes('987654321'));
  });

  it('never leaks the app id from a runtime failure, even though it travels in the query string', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'SECRET-APP-ID-MARKER' },
    });
    client.setResponse({ error: true, message: 'boom' }, 500);
    const err = await asserts.assertRejects(
      () => client.getStatus(),
      OpenExchangeError,
    );
    asserts.assert(!dumpError(err).includes('SECRET-APP-ID-MARKER'));
  });
});

describe('OpenExchange — rate limiting', () => {
  it('classifies a 429 as RATE_LIMITED (not RESPONSE_ERROR) and carries the retry hint', async () => {
    const client = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    client.setResponseWithHeaders(
      { error: true, status: 429, message: 'rate_limited' },
      429,
      { 'retry-after': '30' },
    );
    const err = await asserts.assertRejects(
      () => client.getStatus(),
      OpenExchangeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 30);
  });
});

const env = envArgs();
const credentials = {
  appId: env.get('CONNECTOR_OPENEXCHANGE_APP_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe('OpenExchange — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
      maxRetryWait,
    });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
      calls++;
      return Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, slept, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.getRates(),
      OpenExchangeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.getRates(),
      OpenExchangeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('OpenExchange — unrecognised error bodies', () => {
  it('fails RESPONSE_ERROR when a documented error status carries no recognisable envelope', async () => {
    // An *undocumented* 4xx is UNKNOWN_ERROR by design; RESPONSE_ERROR is
    // for a documented status (400/401/403/404) whose body isn't the envelope.
    const c = new MockOpenExchange({
      auth: { type: 'CUSTOM', appId: 'test-app-id' },
    });
    c.setResponse({ unexpected: true }, 400);
    const err = await asserts.assertRejects(
      () => c.getRates(),
      OpenExchangeError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe({
  name: 'OpenExchange — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    // Only `getRates()` and `listCurrencies()` are exercised here — both
    // are available on Open Exchange Rates' free plan. `getHistoricalRates`,
    // `getTimeSeries`, `getOHLC`, and `convert` are Developer/Enterprise-plan
    // features that a free-tier `appId` commonly gets `NOT_ALLOWED` (403)
    // for, so they're deliberately left untested here.
    it('fetches real latest rates from the OpenExchange API', async () => {
      const client = new OpenExchange({
        auth: { type: 'CUSTOM', appId: credentials.appId! },
      });
      const rates = await client.getRates({ symbols: ['EUR'] });
      asserts.assertExists(rates['EUR']);
    });

    it('lists real currencies from the OpenExchange API', async () => {
      const client = new OpenExchange({
        auth: { type: 'CUSTOM', appId: credentials.appId! },
      });
      const currencies = await client.listCurrencies();
      asserts.assertEquals(currencies['USD'], 'United States Dollar');
    });
  },
});
