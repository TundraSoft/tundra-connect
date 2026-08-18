import * as asserts from '@asserts';
import { describe, it } from '@test';
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
    asserts.assertEquals(client.appId, 'test-app-id');
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
