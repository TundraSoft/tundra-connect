import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { AviationWeather } from './AviationWeather.ts';
import { AviationWeatherError } from './errors/mod.ts';

const metar = (extra: Record<string, unknown> = {}) => ({
  icaoId: 'KNYC',
  receiptTime: '2026-11-06T21:54:10.288Z',
  obsTime: 1794001860,
  reportTime: '2026-11-06T22:00:00.000Z',
  temp: 16.1,
  dewp: 15,
  metarType: 'METAR',
  rawOb:
    'METAR KNYC 062151Z AUTO 00000KT 10SM BKN047 OVC065 16/15 A2983 RMK AO2 SLP094 T01610150',
  ...extra,
});

type Captured = { url: URL; headers: Headers };

class MockAviationWeather extends AviationWeather {
  public requests: Captured[] = [];
  public clock = 0;
  public slept: number[] = [];

  constructor(options: ConstructorParameters<typeof AviationWeather>[0] = {}) {
    super(options);
    this._sleep = (ms: number) => {
      this.slept.push(ms);
      this.clock += ms;
      return Promise.resolve();
    };
  }

  protected override _now(): number {
    return this.clock;
  }

  respond(
    body: BodyInit | null | (() => BodyInit | null),
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): this {
    this._fetch = (input, init) => {
      this.requests.push({
        url: new URL(String(input)),
        headers: new Headers(init?.headers),
      });
      const b = typeof body === 'function' ? body() : body;
      return Promise.resolve(new Response(b, { status, headers }));
    };
    return this;
  }

  json(value: unknown, status = 200): this {
    return this.respond(JSON.stringify(value), status);
  }

  get last(): Captured {
    return this.requests.at(-1)!;
  }
}

const gzip = async (text: string): Promise<Uint8Array> => {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  void writer.write(new TextEncoder().encode(text)).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

describe('AviationWeather', () => {
  it('asks for METARs by station and range, with a custom User-Agent', async () => {
    const client = new MockAviationWeather({ userAgent: 'recorder/1.0' })
      .json([metar()]);
    const [r] = await client.getMetars({
      ids: ['KNYC', ' KLGA '],
      hours: 3,
      date: new Date('2026-11-05T12:00:00.000Z'),
    });
    const { url, headers } = client.last;
    asserts.assertEquals(
      url.origin + url.pathname,
      'https://aviationweather.gov/api/data/metar',
    );
    asserts.assertEquals(Object.fromEntries(url.searchParams), {
      format: 'json',
      ids: 'KNYC,KLGA',
      hours: '3',
      date: '2026-11-05T12:00:00Z',
    });
    asserts.assertEquals(headers.get('user-agent'), 'recorder/1.0');
    asserts.assertEquals(r?.rawOb.endsWith('T01610150'), true);
    asserts.assertEquals(r?.remarkTemperatures.hourly?.temperatureC, 16.1);
  });

  it('sends a default User-Agent and a bbox query', async () => {
    const client = new MockAviationWeather().json([metar()]);
    await client.getMetars({ bbox: [40, -74, 41, -73] });
    asserts.assertEquals(
      client.last.url.searchParams.get('bbox'),
      '40,-74,41,-73',
    );
    asserts.assertEquals(
      client.last.headers.get('user-agent'),
      '@tundraconnect/aviationweather',
    );
  });

  it('returns SPECIs and every field as sent', async () => {
    const client = new MockAviationWeather().json([
      metar({ metarType: 'SPECI', wdir: 'VRB', visib: '10+', extra: [1] }),
    ]);
    const [r] = await client.getMetars({ ids: 'KNYC' });
    asserts.assertEquals(r?.metarType, 'SPECI');
    asserts.assertEquals(r?.wdir, 'VRB');
    asserts.assertEquals(r?.extra, [1]);
  });

  it('treats 204 No Content as no reports', async () => {
    const client = new MockAviationWeather().respond(null, 204, {});
    asserts.assertEquals(await client.getMetars({ ids: 'ZZZZ' }), []);
    asserts.assertEquals(await client.getTafs({ ids: 'ZZZZ' }), []);
  });

  it('asks for TAFs by issue time', async () => {
    const client = new MockAviationWeather().json([{
      icaoId: 'KLGA',
      issueTime: '2026-11-06T20:30:00.000Z',
      validTimeFrom: 1,
      validTimeTo: 2,
      rawTAF: 'TAF KLGA 062030Z 0621/0724 32007KT P6SM',
      fcsts: [{ timeFrom: 1, timeTo: 2, fcstChange: null }],
    }]);
    const [taf] = await client.getTafs({
      ids: 'KLGA',
      time: 'issue',
      date: '2026-11-06T12:00:00Z',
    });
    asserts.assertEquals(client.last.url.pathname, '/api/data/taf');
    asserts.assertEquals(client.last.url.searchParams.get('time'), 'issue');
    asserts.assertEquals(taf?.rawTAF.startsWith('TAF KLGA'), true);
  });

  it('validates queries locally', async () => {
    const client = new MockAviationWeather().json([]);
    const cases: [() => Promise<unknown>, string][] = [
      [() => client.getMetars({}), 'ids or bbox'],
      [() => client.getMetars({ ids: ['  '] }), 'ids or bbox'],
      [() => client.getMetars({ ids: 'KNYC', hours: 0 }), 'hours'],
      [() => client.getMetars({ ids: 'KNYC', date: 'yesterday' }), 'date'],
      [
        // deno-lint-ignore no-explicit-any
        () => client.getMetars({ bbox: [1, 2, 3] as any }),
        'bbox',
      ],
      [
        // deno-lint-ignore no-explicit-any
        () => client.getTafs({ ids: 'KLGA', time: 'later' as any }),
        'time',
      ],
    ];
    for (const [call, reason] of cases) {
      const err = await asserts.assertRejects(
        call,
        AviationWeatherError,
        reason,
      );
      asserts.assertEquals(err.code, 'INVALID_REQUEST');
    }
    asserts.assertEquals(client.requests.length, 0);
  });

  it('rejects a malformed body as RESPONSE_ERROR', async () => {
    const client = new MockAviationWeather().json([{ icaoId: 'KNYC' }]);
    const err = await asserts.assertRejects(
      () => client.getMetars({ ids: 'KNYC' }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('maps error statuses, keeping the service message', async () => {
    const cases: [number, string][] = [
      [400, 'BAD_REQUEST'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [429, 'RATE_LIMITED'],
      [504, 'SERVICE_UNAVAILABLE'],
      [418, 'UNKNOWN_ERROR'],
    ];
    for (const [status, code] of cases) {
      const client = new MockAviationWeather().json(
        { status: 'error', error: 'Invalid value for hours' },
        status,
      );
      const err = await asserts.assertRejects(
        () => client.getMetars({ ids: 'KNYC' }),
        AviationWeatherError,
      );
      asserts.assertEquals(err.code, code);
      asserts.assertEquals(
        err.getContextValue('reason'),
        'Invalid value for hours',
      );
    }
  });

  it('downloads, decompresses and splits the METAR cache', async () => {
    const csv = [
      'No errors',
      'raw_text,station_id,observation_time,temp_c,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,metar_type',
      '"METAR KNYC 062151Z AUTO 16/15 RMK AO2 T01610150",KNYC,2026-11-06T21:51:00.000Z,16.1,BKN,4700,OVC,6500,METAR',
      '"SPECI KMDW 062210Z 10/09 RMK AO2 T01000090",KMDW,2026-11-06T22:10:00.000Z,10,FEW,1000,,,SPECI',
      '"METAR EGLL 062220Z 12/10",EGLL,2026-11-06T22:20:00.000Z,12,,,,,METAR',
      '',
    ].join('\n');
    const body = await gzip(csv);
    const client = new MockAviationWeather().respond(() => body.slice(), 200, {
      'content-type': 'application/octet-stream',
      'last-modified': 'Fri, 06 Nov 2026 22:18:11 GMT',
    });
    const cache = await client.getMetarCache({ stations: ['knyc', 'KMDW'] });
    asserts.assertEquals(
      client.last.url.href,
      'https://aviationweather.gov/data/cache/metars.cache.csv.gz',
    );
    asserts.assertEquals(cache.lastModified, 'Fri, 06 Nov 2026 22:18:11 GMT');
    asserts.assertEquals(cache.header.length, 9);
    asserts.assertEquals(cache.rows.map((r) => r.station_id), ['KNYC', 'KMDW']);
    const [nyc, mdw] = cache.rows;
    asserts.assertEquals(nyc?.temp_c, '16.1');
    asserts.assertEquals(nyc?.sky_cover, ['BKN', 'OVC']);
    asserts.assertEquals(mdw?.cloud_base_ft_agl, ['1000', '']);
    asserts.assertEquals(mdw?.metar_type, 'SPECI');
    asserts.assertEquals(mdw?.remarkTemperatures.hourly?.temperatureC, 10);
    asserts.assertEquals(
      (await client.getMetarCache()).rows.length,
      3,
    );
  });

  it('rejects a cache file without the expected header', async () => {
    const body = await gzip('hello\nworld\n');
    const client = new MockAviationWeather().respond(() => body.slice(), 200, {
      'content-type': 'application/octet-stream',
    });
    const err = await asserts.assertRejects(
      () => client.getMetarCache(),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('paces requests to the sliding-window budget', async () => {
    const client = new MockAviationWeather({
      rateLimit: { requests: 2, windowMs: 1000 },
    }).json([]);
    await Promise.all([
      client.getMetars({ ids: 'A' }),
      client.getMetars({ ids: 'B' }),
      client.getMetars({ ids: 'C' }),
    ]);
    asserts.assertEquals(client.requests.length, 3);
    asserts.assertEquals(client.slept, [1000]);
    asserts.assertEquals(
      client.requests.map((r) => r.url.searchParams.get('ids')),
      ['A', 'B', 'C'],
    );
  });

  it('defaults to 100 per minute, can be turned off, and rejects a bad budget', async () => {
    asserts.assertEquals(new MockAviationWeather().rateLimit, {
      requests: 100,
      windowMs: 60_000,
    });
    const free = new MockAviationWeather({ rateLimit: false }).json([]);
    await Promise.all(
      Array.from({ length: 150 }, () => free.getMetars({ ids: 'A' })),
    );
    asserts.assertEquals(free.slept, []);
    const err = asserts.assertThrows(
      () =>
        new MockAviationWeather({ rateLimit: { requests: 0, windowMs: 1 } }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_RATE_LIMIT');
  });
});

describe('AviationWeather — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockAviationWeather({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getMetars({ ids: 'KNYC' }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = new MockAviationWeather();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.getMetars({ ids: 'KNYC' }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });
});

describe('AviationWeather — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockAviationWeather({ maxRetryWait, rateLimit: false });
    let calls = 0;
    c['_fetch'] = () => {
      calls++;
      return Promise.resolve(
        new Response('{"status":"error","error":"slow down"}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.getMetars({ ids: 'KNYC' }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(c.slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.getMetars({ ids: 'KNYC' }),
      AviationWeatherError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
// The Data API is open, so the live suite only needs public live tests on.
const publicLive = !!env.get('LIVE_TEST_PUBLIC');

describe({
  name: 'AviationWeather — live',
  ignore: !publicLive,
  bun: false,
  node: false,
  fn: () => {
    const awc = new AviationWeather();

    it('fetches recent METARs for Central Park with the remark T-group', async () => {
      const reports = await awc.getMetars({ ids: 'KNYC', hours: 3 });
      asserts.assert(reports.length > 0);
      const withT = reports.find((r) => r.remarkTemperatures.hourly);
      asserts.assertExists(withT);
      // The service's decoded temp is the T-group value when it has one.
      asserts.assertEquals(
        withT.temp,
        withT.remarkTemperatures.hourly!.temperatureC,
      );
    });

    it('fetches a TAF', async () => {
      const [taf] = await awc.getTafs({ ids: 'KLGA' });
      asserts.assertStringIncludes(taf!.rawTAF, 'KLGA');
    });

    it('reads the bulk METAR cache', async () => {
      const cache = await awc.getMetarCache();
      asserts.assert(cache.rows.length > 1000);
      asserts.assert(cache.rows.some((r) => r.metar_type === 'SPECI'));
    });

    it('surfaces an invalid parameter as BAD_REQUEST', async () => {
      const err = await asserts.assertRejects(
        () => awc.getMetars({ ids: 'KNYC', hours: 9999 }),
        AviationWeatherError,
      );
      asserts.assertEquals(err.code, 'BAD_REQUEST');
    });
  },
});
