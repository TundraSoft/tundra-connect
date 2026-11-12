import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  OPEN_METEO_CUSTOMER_HOSTS,
  OPEN_METEO_FREE_HOSTS,
  OpenMeteo,
} from './OpenMeteo.ts';
import { OpenMeteoError } from './errors/mod.ts';

const location = (extra: Record<string, unknown> = {}) => ({
  latitude: 40.78858,
  longitude: -73.9661,
  generationtime_ms: 0.2,
  utc_offset_seconds: 0,
  timezone: 'GMT',
  timezone_abbreviation: 'GMT',
  elevation: 40,
  hourly_units: { time: 'unixtime', temperature_2m_gfs_seamless: '°C' },
  hourly: {
    time: [1793923200, 1793926800],
    temperature_2m_gfs_seamless: [21.1, null],
  },
  ...extra,
});

type Captured = { url: URL; method?: string };

class MockOpenMeteo extends OpenMeteo {
  public requests: Captured[] = [];

  respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
    this._fetch = (input, init) => {
      this.requests.push({ url: new URL(String(input)), method: init?.method });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
      );
    };
    return this;
  }

  get last(): URL {
    return this.requests.at(-1)!.url;
  }
}

describe('OpenMeteo', () => {
  it('defaults to the free hosts and never exposes a key', () => {
    const client = new MockOpenMeteo();
    asserts.assertEquals(client.vendor, 'OpenMeteo');
    asserts.assertEquals(client.hasApiKey, false);
    asserts.assertEquals(client.hosts, OPEN_METEO_FREE_HOSTS);
  });

  it('switches every API to the customer hosts when a key is configured', () => {
    const client = new MockOpenMeteo({
      auth: { type: 'CUSTOM', apiKey: 'paid-key' },
    });
    asserts.assertEquals(client.hasApiKey, true);
    asserts.assertEquals(client.hosts, OPEN_METEO_CUSTOMER_HOSTS);
    asserts.assertEquals(
      JSON.stringify(client).includes('paid-key'),
      false,
    );
  });

  it('honours host overrides and rejects a non-https host', () => {
    const client = new MockOpenMeteo({
      hosts: { archive: 'https://weather.example.com/om/' },
    });
    asserts.assertEquals(
      client.hosts.archive,
      'https://weather.example.com/om',
    );
    asserts.assertEquals(client.hosts.forecast, OPEN_METEO_FREE_HOSTS.forecast);
    asserts.assertEquals(
      new MockOpenMeteo({ hosts: { forecast: 'http://localhost:8080' } })
        .hosts.forecast,
      'http://localhost:8080',
    );
    const err = asserts.assertThrows(
      () => new MockOpenMeteo({ hosts: { forecast: 'http://example.com' } }),
      OpenMeteoError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_HOST');
  });

  it('rejects an empty or malformed key without echoing it', () => {
    for (
      const auth of [
        { type: 'CUSTOM', apiKey: '' },
        { type: 'CUSTOM', apiKey: 4242424242 },
        { type: 'BEARER', token: 'x' },
      ]
    ) {
      const err = asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockOpenMeteo({ auth: auth as any }),
        OpenMeteoError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
      asserts.assertEquals(
        JSON.stringify(err.toJSON()).includes('4242424242'),
        false,
      );
    }
  });

  it('serialises every query field to Open-Meteo parameter names', async () => {
    const client = new MockOpenMeteo().respond(location());
    await client.forecast({
      latitude: 40.78,
      longitude: -73.97,
      elevation: 33,
      hourly: ['temperature_2m', 'dew_point_2m'],
      minutely15: ['temperature_2m'],
      daily: ['temperature_2m_max'],
      current: ['temperature_2m'],
      models: ['ncep_hrrr_conus', 'gfs_seamless'],
      timezone: 'America/New_York',
      timeformat: 'unixtime',
      temperatureUnit: 'fahrenheit',
      windSpeedUnit: 'kn',
      precipitationUnit: 'inch',
      pastDays: 1,
      forecastDays: 2,
      cellSelection: 'nearest',
      params: { forecast_hours: 12, models_extra: ['a', 'b'], bool: true },
    });
    const url = client.last;
    asserts.assertEquals(url.origin, 'https://api.open-meteo.com');
    asserts.assertEquals(url.pathname, '/v1/forecast');
    const q = Object.fromEntries(url.searchParams);
    asserts.assertEquals(q, {
      latitude: '40.78',
      longitude: '-73.97',
      elevation: '33',
      hourly: 'temperature_2m,dew_point_2m',
      minutely_15: 'temperature_2m',
      daily: 'temperature_2m_max',
      current: 'temperature_2m',
      models: 'ncep_hrrr_conus,gfs_seamless',
      timezone: 'America/New_York',
      timeformat: 'unixtime',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'kn',
      precipitation_unit: 'inch',
      past_days: '1',
      forecast_days: '2',
      cell_selection: 'nearest',
      forecast_hours: '12',
      models_extra: 'a,b',
      bool: 'true',
    });
    asserts.assertEquals(url.searchParams.has('apikey'), false);
  });

  it('returns every column untouched, nulls included', async () => {
    const client = new MockOpenMeteo().respond(location({ extra_field: 1 }));
    const [nyc] = await client.forecast({
      latitude: 40.78,
      longitude: -73.97,
      hourly: ['temperature_2m'],
    });
    asserts.assertEquals(nyc?.hourly?.temperature_2m_gfs_seamless, [
      21.1,
      null,
    ]);
    asserts.assertEquals(nyc?.extra_field, 1);
    asserts.assertEquals(nyc?.latitude, 40.78858);
  });

  it('requests several locations at once and keeps their order', async () => {
    const client = new MockOpenMeteo().respond([
      location({ location_id: 0 }),
      location({ location_id: 1, latitude: 51.5 }),
    ]);
    const result = await client.forecast({
      latitude: [40.78, 51.5],
      longitude: [-73.97, -0.1],
      hourly: ['temperature_2m'],
    });
    asserts.assertEquals(result.map((r) => r.location_id), [0, 1]);
    asserts.assertEquals(
      client.last.searchParams.get('latitude'),
      '40.78,51.5',
    );
  });

  it('routes each API to its own host and path', async () => {
    const client = new MockOpenMeteo().respond(location());
    const base = { latitude: 1, longitude: 2, hourly: ['temperature_2m'] };
    await client.ensemble(base);
    asserts.assertEquals(
      client.last.href.split('?')[0],
      'https://ensemble-api.open-meteo.com/v1/ensemble',
    );
    await client.previousRuns(base);
    asserts.assertEquals(
      client.last.href.split('?')[0],
      'https://previous-runs-api.open-meteo.com/v1/forecast',
    );
    await client.historicalForecast(base);
    asserts.assertEquals(
      client.last.href.split('?')[0],
      'https://historical-forecast-api.open-meteo.com/v1/forecast',
    );
    await client.singleRun({ ...base, run: '2026-11-05T00:00' });
    asserts.assertEquals(
      client.last.href.split('?')[0],
      'https://single-runs-api.open-meteo.com/v1/forecast',
    );
    asserts.assertEquals(
      client.last.searchParams.get('run'),
      '2026-11-05T00:00',
    );
    await client.archive({
      ...base,
      startDate: '2025-01-01',
      endDate: '2025-01-02',
    });
    asserts.assertEquals(
      client.last.href.split('?')[0],
      'https://archive-api.open-meteo.com/v1/archive',
    );
    asserts.assertEquals(
      client.last.searchParams.get('start_date'),
      '2025-01-01',
    );
  });

  it('sends the key as apikey on the customer hosts', async () => {
    const client = new MockOpenMeteo({
      auth: { type: 'CUSTOM', apiKey: ' paid-key ' },
    }).respond(location());
    await client.ensemble({ latitude: 1, longitude: 2, hourly: ['t'] });
    asserts.assertEquals(
      client.last.origin,
      OPEN_METEO_CUSTOMER_HOSTS.ensemble,
    );
    asserts.assertEquals(client.last.searchParams.get('apikey'), 'paid-key');
  });

  it('expands previousDays into _previous_dayN columns', async () => {
    const client = new MockOpenMeteo().respond(location());
    await client.previousRuns({
      latitude: 1,
      longitude: 2,
      hourly: ['temperature_2m', 'dew_point_2m_previous_day3'],
      minutely15: ['temperature_2m'],
      previousDays: [1, 2],
    });
    asserts.assertEquals(
      client.last.searchParams.get('hourly'),
      'temperature_2m,temperature_2m_previous_day1,temperature_2m_previous_day2,dew_point_2m_previous_day3',
    );
    asserts.assertEquals(
      client.last.searchParams.get('minutely_15'),
      'temperature_2m,temperature_2m_previous_day1,temperature_2m_previous_day2',
    );
    await asserts.assertRejects(
      () =>
        client.previousRuns({
          latitude: 1,
          longitude: 2,
          previousDays: [0],
        }),
      OpenMeteoError,
      'previousDays',
    );
  });

  it('validates the request locally before calling', async () => {
    const client = new MockOpenMeteo().respond(location());
    const cases: [() => Promise<unknown>, string][] = [
      [
        () => client.forecast({ latitude: [1, 2], longitude: [1] }),
        'one value',
      ],
      [() => client.forecast({ latitude: NaN, longitude: 1 }), 'finite'],
      [() => client.forecast({ latitude: [], longitude: [] }), 'finite'],
      [
        () =>
          client.forecast({ latitude: 1, longitude: 1, startDate: '1/2/25' }),
        'startDate',
      ],
      [
        () =>
          client.forecast({ latitude: 1, longitude: 1, endHour: '2025-01-01' }),
        'endHour',
      ],
      [
        () =>
          client.singleRun({ latitude: 1, longitude: 1, run: '2025-01-01' }),
        'run',
      ],
      [
        () =>
          // deno-lint-ignore no-explicit-any
          client.archive({ latitude: 1, longitude: 1 } as any),
        'startDate and endDate',
      ],
    ];
    for (const [call, reason] of cases) {
      const err = await asserts.assertRejects(call, OpenMeteoError, reason);
      asserts.assertEquals(err.code, 'INVALID_REQUEST');
    }
    asserts.assertEquals(client.requests.length, 0);
  });

  it('rejects a malformed or ragged success body as RESPONSE_ERROR', async () => {
    for (
      const body of [
        { hello: 'world' },
        location({ hourly: { time: [1, 2], temperature_2m: [1] } }),
        location({ hourly: { time: [1], temperature_2m: [{}] } }),
      ]
    ) {
      const client = new MockOpenMeteo().respond(body);
      const err = await asserts.assertRejects(
        () => client.forecast({ latitude: 1, longitude: 1 }),
        OpenMeteoError,
      );
      asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    }
  });

  it('maps error statuses to codes, keeping the reason', async () => {
    const cases: [number, string, string][] = [
      [400, 'Cannot initialize ... bogus_var', 'BAD_REQUEST'],
      [400, 'The supplied API key is invalid.', 'INVALID_API_KEY'],
      [401, 'nope', 'INVALID_API_KEY'],
      [404, 'Not Found', 'NOT_FOUND'],
      [429, 'Minutely API request limit exceeded.', 'RATE_LIMITED'],
      [502, 'bad gateway', 'SERVICE_UNAVAILABLE'],
      [418, 'teapot', 'UNKNOWN_ERROR'],
    ];
    for (const [status, reason, code] of cases) {
      const client = new MockOpenMeteo().respond(
        { error: true, reason },
        status,
      );
      const err = await asserts.assertRejects(
        () => client.forecast({ latitude: 1, longitude: 1 }),
        OpenMeteoError,
      );
      asserts.assertEquals(err.code, code, `${status} ${reason}`);
      asserts.assertEquals(err.getContextValue('status'), status);
      asserts.assertEquals(err.getContextValue('reason'), reason);
    }
  });
});

describe('OpenMeteo — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockOpenMeteo({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.forecast({ latitude: 1, longitude: 1 }),
      OpenMeteoError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails, without the key', async () => {
    const c = new MockOpenMeteo({
      auth: { type: 'CUSTOM', apiKey: 'SECRET-API-KEY-MARKER' },
    });
    c['_fetch'] = (input) =>
      Promise.reject(new TypeError(`error sending request ${String(input)}`));
    const err = await asserts.assertRejects(
      () => c.forecast({ latitude: 1, longitude: 1 }),
      OpenMeteoError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes('SECRET-API-KEY-MARKER'),
      false,
    );
  });
});

describe('OpenMeteo — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockOpenMeteo({ maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = () => {
      calls++;
      return Promise.resolve(
        new Response('{"error":true,"reason":"limit"}', {
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
      () => c.forecast({ latitude: 1, longitude: 1 }),
      OpenMeteoError,
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
      () => c.forecast({ latitude: 1, longitude: 1 }),
      OpenMeteoError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
// Open-Meteo's free tier needs no key, so the live suite runs whenever
// public live tests are enabled; the paid-host test additionally needs a key.
const publicLive = !!env.get('LIVE_TEST_PUBLIC');
const apiKey = env.get('CONNECTOR_OPEN_METEO_API_KEY');

describe({
  name: 'OpenMeteo — live',
  ignore: !publicLive,
  bun: false,
  node: false,
  fn: () => {
    const client = new OpenMeteo();
    const nyc = { latitude: 40.7794, longitude: -73.9692 };

    it('forecasts per model, hourly and 15-minutely', async () => {
      const [r] = await client.forecast({
        ...nyc,
        hourly: ['temperature_2m'],
        minutely15: ['temperature_2m'],
        models: ['ncep_hrrr_conus', 'gfs_seamless'],
        forecastDays: 1,
        timeformat: 'unixtime',
      });
      asserts.assertExists(r?.hourly?.temperature_2m_ncep_hrrr_conus);
      asserts.assertExists(r?.hourly?.temperature_2m_gfs_seamless);
      asserts.assertEquals(r?.minutely_15?.time.length, 96);
    });

    it('returns every ensemble member', async () => {
      const [r] = await client.ensemble({
        ...nyc,
        hourly: ['temperature_2m'],
        models: ['gfs_seamless'],
        forecastDays: 1,
      });
      // GEFS: control + 30 perturbed members.
      asserts.assertEquals(Object.keys(r!.hourly!).length - 1, 31);
    });

    it('returns previous-day forecasts, a single run and the archive', async () => {
      const [prev] = await client.previousRuns({
        ...nyc,
        hourly: ['temperature_2m'],
        previousDays: [1],
        models: ['gfs_seamless'],
        forecastDays: 1,
      });
      asserts.assertExists(prev?.hourly?.temperature_2m_previous_day1);
      const day = new Date(Date.now() - 2 * 86_400_000).toISOString()
        .slice(0, 10);
      const [run] = await client.singleRun({
        ...nyc,
        hourly: ['temperature_2m'],
        models: ['gfs_global'],
        run: `${day}T00:00`,
        forecastDays: 1,
      });
      asserts.assertEquals(run?.hourly?.time[0], `${day}T00:00`);
      const [past] = await client.archive({
        ...nyc,
        daily: ['temperature_2m_max'],
        startDate: '2025-07-01',
        endDate: '2025-07-02',
      });
      asserts.assertEquals(past?.daily?.time, ['2025-07-01', '2025-07-02']);
    });

    it('surfaces an unknown variable as BAD_REQUEST', async () => {
      const err = await asserts.assertRejects(
        () => client.forecast({ ...nyc, hourly: ['not_a_variable'] }),
        OpenMeteoError,
      );
      asserts.assertEquals(err.code, 'BAD_REQUEST');
    });

    it({
      name: 'calls the customer hosts with a paid key',
      ignore: !apiKey,
      fn: async () => {
        const paid = new OpenMeteo({
          auth: { type: 'CUSTOM', apiKey: apiKey! },
        });
        const [r] = await paid.forecast({
          ...nyc,
          hourly: ['temperature_2m'],
          forecastDays: 1,
        });
        asserts.assertExists(r?.hourly?.temperature_2m);
      },
    });
  },
});
