import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { OpenWeatherMap } from './OpenWeatherMap.ts';
import { OpenWeatherMapError } from './errors/mod.ts';

const currentWeatherResponse = {
  coord: { lon: -0.13, lat: 51.51 },
  weather: [
    { id: 800, main: 'Clear', description: 'clear sky', icon: '01d' },
  ],
  base: 'stations',
  main: {
    temp: 15.2,
    feels_like: 14.6,
    temp_min: 13.9,
    temp_max: 16.1,
    pressure: 1015,
    humidity: 72,
  },
  visibility: 10000,
  wind: { speed: 4.1, deg: 280 },
  clouds: { all: 0 },
  dt: 1700000000,
  sys: {
    type: 2,
    id: 2019646,
    country: 'GB',
    sunrise: 1699945200,
    sunset: 1699977600,
  },
  timezone: 0,
  id: 2643743,
  name: 'London',
  cod: 200,
};

const forecastResponse = {
  cod: '200',
  message: 0,
  cnt: 1,
  list: [
    {
      dt: 1700010800,
      main: {
        temp: 14.1,
        feels_like: 13.4,
        temp_min: 13.2,
        temp_max: 14.1,
        pressure: 1014,
        sea_level: 1014,
        grnd_level: 1009,
        humidity: 75,
        temp_kf: 0.9,
      },
      weather: [
        { id: 800, main: 'Clear', description: 'clear sky', icon: '01n' },
      ],
      clouds: { all: 5 },
      wind: { speed: 3.2, deg: 260 },
      visibility: 10000,
      pop: 0.1,
      sys: { pod: 'n' },
      dt_txt: '2023-11-14 21:00:00',
    },
  ],
  city: {
    id: 2643743,
    name: 'London',
    coord: { lat: 51.51, lon: -0.13 },
    country: 'GB',
    population: 1000000,
    timezone: 0,
    sunrise: 1699945200,
    sunset: 1699977600,
  },
};

class MockOpenWeatherMap extends OpenWeatherMap {
  public request?: { url: string; method?: string };
  private responseBody: unknown = currentWeatherResponse;
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

describe('OpenWeatherMap', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
      timeout: 30,
    });

    asserts.assertEquals(client.vendor, 'OpenWeatherMap');
    asserts.assertEquals(client.apiKey, 'test-api-key');
    asserts.assertEquals(client.timeout, 30);
  });

  it('rejects invalid client configuration', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockOpenWeatherMap({} as any),
      OpenWeatherMapError,
      'API key must be a non-empty string',
    );
    asserts.assertThrows(
      () => new MockOpenWeatherMap({ auth: { type: 'CUSTOM', apiKey: '' } }),
      OpenWeatherMapError,
      'API key must be a non-empty string',
    );
  });

  it('never leaks a non-string API key value into a thrown config error', () => {
    // The validation guard only throws CONFIG_INVALID_API_KEY for a
    // non-string or empty/whitespace `apiKey`, so a non-string value is the
    // only way to reach this throw site with a non-trivial value to check
    // for leakage.
    const secretLike = 918273645;
    try {
      new MockOpenWeatherMap({
        // deno-lint-ignore no-explicit-any
        auth: { type: 'CUSTOM', apiKey: secretLike } as any,
      });
      throw new Error('expected construction to throw');
    } catch (error) {
      if (!(error instanceof OpenWeatherMapError)) throw error;
      const serialized = JSON.stringify(error.toJSON());
      asserts.assertEquals(error.message.includes(String(secretLike)), false);
      asserts.assertEquals(serialized.includes(String(secretLike)), false);
    }
  });

  it('requests and validates current weather by coordinates', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    const weather = await client.getCurrentWeather({
      lat: 51.51,
      lon: -0.13,
      units: 'metric',
    });

    asserts.assertEquals(weather.name, 'London');
    asserts.assertEquals(weather.main.temp, 15.2);
    asserts.assertEquals(client.request?.method, 'GET');
    asserts.assertStringIncludes(client.request?.url ?? '', '/weather');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'appid=test-api-key',
    );
    asserts.assertStringIncludes(client.request?.url ?? '', 'lat=51.51');
    asserts.assertStringIncludes(client.request?.url ?? '', 'lon=-0.13');
    asserts.assertStringIncludes(client.request?.url ?? '', 'units=metric');
  });

  it('builds a location query for city name lookups', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await client.getCurrentWeather({ q: 'London,GB' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'q=London%2CGB',
    );
  });

  it('defaults the zip country to US when omitted', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await client.getCurrentWeather({ zip: '10001' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'zip=10001%2CUS',
    );
  });

  it('honors an explicit zip country', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await client.getCurrentWeather({ zip: '75001', country: 'FR' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'zip=75001%2CFR',
    );
  });

  it('builds a location query for a city ID', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await client.getCurrentWeather({ id: 2643743 });

    asserts.assertStringIncludes(client.request?.url ?? '', 'id=2643743');
  });

  it('rejects getCurrentWeather() when no location variant is supplied', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await asserts.assertRejects(
      // deno-lint-ignore no-explicit-any
      () => client.getCurrentWeather({} as any),
      OpenWeatherMapError,
      'failed local validation',
    );
    // Confirm the request was never actually sent.
    asserts.assertEquals(client.request, undefined);
  });

  it('rejects getForecast() when no location variant is supplied', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(forecastResponse);

    await asserts.assertRejects(
      // deno-lint-ignore no-explicit-any
      () => client.getForecast({} as any),
      OpenWeatherMapError,
      'failed local validation',
    );
    asserts.assertEquals(client.request, undefined);
  });

  it('rejects a partial lat/lon pair as if no location were supplied', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await asserts.assertRejects(
      // deno-lint-ignore no-explicit-any
      () => client.getCurrentWeather({ lat: 51.51 } as any),
      OpenWeatherMapError,
      'failed local validation',
    );
  });

  it('treats undefined-valued lat/lon keys as absent and falls through to q', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    // A spread-built options object carries the unused variant keys with
    // `undefined` values — they must not win the precedence race, and
    // `lat=undefined&lon=undefined` must never hit the wire.
    await client.getCurrentWeather(
      // deno-lint-ignore no-explicit-any
      { lat: undefined, lon: undefined, q: 'London' } as any,
    );

    const url = client.request?.url ?? '';
    asserts.assertStringIncludes(url, 'q=London');
    asserts.assertEquals(url.includes('lat='), false);
    asserts.assertEquals(url.includes('lon='), false);
  });

  it('treats an undefined-valued q key as absent and falls through to id', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(currentWeatherResponse);

    await client.getCurrentWeather(
      // deno-lint-ignore no-explicit-any
      { q: undefined, id: 123 } as any,
    );

    const url = client.request?.url ?? '';
    asserts.assertStringIncludes(url, 'id=123');
    asserts.assertEquals(url.includes('q='), false);
  });

  it('requests and validates the 5-day forecast, including cnt', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse(forecastResponse);

    const forecast = await client.getForecast({
      lat: 51.51,
      lon: -0.13,
      cnt: 8,
    });

    asserts.assertEquals(forecast.cod, '200');
    asserts.assertEquals(forecast.city.name, 'London');
    asserts.assertEquals(forecast.list[0]?.main.temp, 14.1);
    asserts.assertStringIncludes(client.request?.url ?? '', '/forecast');
    asserts.assertStringIncludes(client.request?.url ?? '', 'cnt=8');
  });

  it('rejects malformed successful responses', async () => {
    const client = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
    });
    client.setResponse({ weather: [] });

    await asserts.assertRejects(
      () => client.getCurrentWeather({ lat: 51.51, lon: -0.13 }),
      OpenWeatherMapError,
      'did not match the expected schema',
    );
  });

  it('maps every documented HTTP status to a connect-specific error code', async () => {
    const errorCases: Array<{ status: number; expected: string }> = [
      { status: 401, expected: 'rejected the configured API key' },
      { status: 404, expected: 'location could not be found' },
      { status: 429, expected: 'rate limit exceeded' },
      { status: 400, expected: 'rejected the request as invalid' },
      { status: 500, expected: 'currently unavailable' },
      // Unmapped 4xx statuses are request-side problems, not outages —
      // they fall back to UNKNOWN_ERROR, not SERVICE_UNAVAILABLE.
      { status: 403, expected: 'An unknown error occurred' },
    ];

    for (const errorCase of errorCases) {
      const client = new MockOpenWeatherMap({
        auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
      });
      client.setResponse(
        { cod: String(errorCase.status), message: 'vendor error message' },
        errorCase.status,
      );

      await asserts.assertRejects(
        () => client.getCurrentWeather({ lat: 51.51, lon: -0.13 }),
        OpenWeatherMapError,
        errorCase.expected,
      );
    }
  });
});

const env = envArgs();
const credentials = {
  apiKey: env.get('CONNECTOR_OPENWEATHERMAP_API_KEY'),
};
const liveTestsEnabled = !!credentials.apiKey;

describe('OpenWeatherMap — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockOpenWeatherMap({
      auth: { type: 'CUSTOM', apiKey: 'test-api-key' },
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
      () => c.getCurrentWeather({ lat: 51.51, lon: -0.13 }),
      OpenWeatherMapError,
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
      () => c.getCurrentWeather({ lat: 51.51, lon: -0.13 }),
      OpenWeatherMapError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe({
  name: 'OpenWeatherMap — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('fetches real current weather from the OpenWeatherMap API', async () => {
      const client = new OpenWeatherMap({
        auth: { type: 'CUSTOM', apiKey: credentials.apiKey! },
      });
      const weather = await client.getCurrentWeather({
        q: 'London,GB',
        units: 'metric',
      });
      asserts.assertEquals(weather.name, 'London');
      asserts.assertExists(weather.main.temp);
    });
  },
});
