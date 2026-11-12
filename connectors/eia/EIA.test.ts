import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { EIA, EIA_WPSR_STOCK_SERIES } from './EIA.ts';
import { EIAError } from './errors/mod.ts';

const AUTH = { type: 'CUSTOM' as const, apiKey: 'test-eia-key' };

const row = (
  period: string,
  series = 'RWTC',
  value: string | null = '99.64',
) => ({
  period,
  duoarea: 'YCUOK',
  'area-name': 'NA',
  product: 'EPCWTI',
  series,
  'series-description': 'Cushing, OK WTI Spot Price FOB (Dollars per Barrel)',
  value,
  units: '$/BBL',
});

const page = (data: unknown[], total: string | number = data.length) => ({
  warnings: [{ warning: 'incomplete return', description: 'max 5000 rows' }],
  response: {
    total: String(total),
    dateFormat: 'YYYY-MM-DD',
    frequency: 'daily',
    data,
  },
  request: { command: '/v2/petroleum/pri/spt/data/', params: {} },
  apiVersion: '2.1.14',
  ExcelAddInVersion: '2.1.0',
});

class MockEIA extends EIA {
  public requests: URL[] = [];

  respond(body: unknown | ((url: URL) => unknown), status = 200): this {
    this._fetch = (input) => {
      const url = new URL(String(input));
      this.requests.push(url);
      const b = typeof body === 'function'
        ? (body as (u: URL) => unknown)(url)
        : body;
      return Promise.resolve(
        new Response(JSON.stringify(b), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    return this;
  }

  get last(): URL {
    return this.requests.at(-1)!;
  }
}

describe('EIA', () => {
  it('requires a key and never exposes it', () => {
    const client = new MockEIA({ auth: AUTH });
    asserts.assertEquals(client.vendor, 'EIA');
    asserts.assertEquals(client.hasApiKey, true);
    asserts.assertEquals(
      JSON.stringify(client).includes('test-eia-key'),
      false,
    );
    for (
      const options of [
        {},
        { auth: { type: 'CUSTOM', apiKey: '  ' } },
        { auth: { type: 'CUSTOM', apiKey: 5150515051 } },
      ]
    ) {
      const err = asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockEIA(options as any),
        EIAError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
      asserts.assertEquals(
        JSON.stringify(err.toJSON()).includes('5150515051'),
        false,
      );
    }
  });

  it('serialises a data query in EIA bracket notation with the key', async () => {
    const client = new MockEIA({ auth: AUTH }).respond(
      page([row('2026-11-03')]),
    );
    const result = await client.getData('petroleum/pri/spt', {
      frequency: 'daily',
      data: ['value'],
      facets: { series: ['RWTC', 'RBRTE'], duoarea: ['YCUOK'] },
      start: '2026-10-01',
      end: '2026-11-03',
      sort: [{ column: 'period', direction: 'desc' }, { column: 'series' }],
      offset: 10,
      length: 4,
    });
    const url = client.last;
    asserts.assertEquals(url.pathname, '/v2/petroleum/pri/spt/data/');
    asserts.assertEquals(Object.fromEntries(url.searchParams), {
      frequency: 'daily',
      'data[0]': 'value',
      'facets[series][0]': 'RWTC',
      'facets[series][1]': 'RBRTE',
      'facets[duoarea][0]': 'YCUOK',
      start: '2026-10-01',
      end: '2026-11-03',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      'sort[1][column]': 'series',
      'sort[1][direction]': 'asc',
      offset: '10',
      length: '4',
      api_key: 'test-eia-key',
    });
    asserts.assertEquals(result.response.data[0]?.value, '99.64');
    asserts.assertEquals(result.warnings?.[0]?.warning, 'incomplete return');
    asserts.assertEquals(result.ExcelAddInVersion, '2.1.0');
  });

  it('keeps values as sent: strings, numbers and nulls', async () => {
    const client = new MockEIA({ auth: AUTH }).respond(page([
      row('2026-11-03', 'RWTC', '99.640'),
      { ...row('2026-11-02'), value: 100.06 },
      row('2026-11-01', 'RWTC', null),
    ]));
    const { response } = await client.getData('petroleum/pri/spt');
    asserts.assertEquals(response.data.map((r) => r.value), [
      '99.640',
      100.06,
      null,
    ]);
  });

  it('builds route, facet and series-id paths and rejects bad ones', async () => {
    const client = new MockEIA({ auth: AUTH }).respond({
      response: { id: 'petroleum', routes: [{ id: 'pri', name: 'Prices' }] },
      request: { command: '/v2/petroleum/', params: [] },
      apiVersion: '2.1.14',
    });
    const meta = await client.getRoute('/v2/petroleum/');
    asserts.assertEquals(client.last.pathname, '/v2/petroleum/');
    asserts.assertEquals(meta.response.routes?.[0]?.id, 'pri');
    await client.getRoute();
    asserts.assertEquals(client.last.pathname, '/v2/');

    client.respond({
      response: { totalFacets: 2, facets: [{ id: 'RWTC', name: 'WTI' }] },
      request: { command: 'x', params: [] },
      apiVersion: '2.1.14',
    });
    const values = await client.getFacetValues('petroleum/pri/spt', 'series');
    asserts.assertEquals(
      client.last.pathname,
      '/v2/petroleum/pri/spt/facet/series/',
    );
    asserts.assertEquals(values.response.facets[0]?.id, 'RWTC');

    client.respond(page([row('2026-11-03')]));
    await client.getSeriesById('PET.RWTC.D');
    asserts.assertEquals(client.last.pathname, '/v2/seriesid/PET.RWTC.D');

    for (
      const call of [
        () => client.getRoute('petroleum/../x'),
        () => client.getFacetValues('petroleum', 'a/b'),
        () => client.getSeriesById('a b'),
        () => client.getData('petroleum', { length: 5001 }),
        () => client.getData('petroleum', { offset: -1 }),
      ]
    ) {
      const err = await asserts.assertRejects(call, EIAError);
      asserts.assertEquals(err.code, 'INVALID_REQUEST');
    }
  });

  it('paginates until total, keeping every page', async () => {
    const all = Array.from({ length: 7 }, (_, i) => row(`2026-10-${10 + i}`));
    const client = new MockEIA({ auth: AUTH }).respond((url: URL) => {
      const offset = Number(url.searchParams.get('offset'));
      const length = Number(url.searchParams.get('length'));
      return page(all.slice(offset, offset + length), all.length);
    });
    const result = await client.getAllData('petroleum/pri/spt', {
      sort: [{ column: 'period' }],
    }, { pageSize: 3 });
    asserts.assertEquals(
      result.rows.map((r) => r.period),
      all.map((r) => r.period),
    );
    asserts.assertEquals(result.pages.map((p) => [p.offset, p.rows]), [
      [0, 3],
      [3, 3],
      [6, 1],
    ]);
    asserts.assertEquals(result.pages[0]?.total, '7');
    asserts.assertEquals(result.dateFormat, 'YYYY-MM-DD');
    asserts.assertEquals(client.requests.length, 3);
  });

  it('stops on an exact multiple of the page size and at maxRows', async () => {
    const all = Array.from({ length: 4 }, (_, i) => row(`2026-10-${10 + i}`));
    const client = new MockEIA({ auth: AUTH }).respond((url: URL) => {
      const offset = Number(url.searchParams.get('offset'));
      const length = Number(url.searchParams.get('length'));
      return page(all.slice(offset, offset + length), all.length);
    });
    await client.getAllData('x', {}, { pageSize: 2 });
    asserts.assertEquals(client.requests.length, 2);

    client.requests = [];
    const capped = await client.getAllData('x', {}, {
      pageSize: 2,
      maxRows: 3,
    });
    asserts.assertEquals(capped.rows.length, 3);
    asserts.assertEquals(
      client.requests.map((u) => u.searchParams.get('length')),
      ['2', '1'],
    );
    const err = await asserts.assertRejects(
      () => client.getAllData('x', {}, { pageSize: 0 }),
      EIAError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
  });

  it('asks for WTI/Brent spot prices and WPSR stocks with typed defaults', async () => {
    const client = new MockEIA({ auth: AUTH }).respond(
      page([row('2026-11-03')]),
    );
    await client.getSpotPrices({ start: '2026-10-01' });
    let q = Object.fromEntries(client.last.searchParams);
    asserts.assertEquals(client.last.pathname, '/v2/petroleum/pri/spt/data/');
    asserts.assertEquals(q['frequency'], 'daily');
    asserts.assertEquals(q['facets[series][0]'], 'RWTC');
    asserts.assertEquals(q['facets[series][1]'], 'RBRTE');
    asserts.assertEquals(q['start'], '2026-10-01');
    asserts.assertEquals(q['sort[0][column]'], 'period');

    await client.getWeeklyStocks();
    q = Object.fromEntries(client.last.searchParams);
    asserts.assertEquals(client.last.pathname, '/v2/petroleum/stoc/wstk/data/');
    asserts.assertEquals(q['frequency'], 'weekly');
    asserts.assertEquals(
      Object.entries(q).filter(([k]) => k.startsWith('facets[series]')).map((
        [, v],
      ) => v),
      Object.values(EIA_WPSR_STOCK_SERIES),
    );
  });

  it('rejects a malformed body as RESPONSE_ERROR', async () => {
    const client = new MockEIA({ auth: AUTH }).respond(
      page([{ series: 'RWTC' }]),
    );
    const err = await asserts.assertRejects(
      () => client.getData('petroleum/pri/spt'),
      EIAError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('maps both error shapes, keeping the gateway code', async () => {
    const cases: [number, unknown, string, string | undefined][] = [
      [
        403,
        { error: { code: 'API_KEY_MISSING', message: 'No api_key' } },
        'INVALID_API_KEY',
        'API_KEY_MISSING',
      ],
      [
        403,
        { error: { code: 'API_KEY_INVALID', message: 'bad' } },
        'INVALID_API_KEY',
        'API_KEY_INVALID',
      ],
      [
        429,
        { error: { code: 'OVER_RATE_LIMIT', message: 'slow' } },
        'RATE_LIMITED',
        'OVER_RATE_LIMIT',
      ],
      [
        400,
        { error: "Invalid frequency 'bogus' provided.", code: 400 },
        'BAD_REQUEST',
        undefined,
      ],
      [404, { error: 'Not found.', code: 404 }, 'NOT_FOUND', undefined],
      [503, 'down', 'SERVICE_UNAVAILABLE', undefined],
    ];
    for (const [status, body, code, vendorCode] of cases) {
      const client = new MockEIA({ auth: AUTH }).respond(body, status);
      const err = await asserts.assertRejects(
        () => client.getRoute('petroleum'),
        EIAError,
      );
      asserts.assertEquals(err.code, code);
      asserts.assertEquals(err.getContextValue('vendorCode'), vendorCode);
      asserts.assertEquals(
        JSON.stringify(err.toJSON()).includes('test-eia-key'),
        false,
      );
    }
  });
});

describe('EIA — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockEIA({ auth: AUTH, timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(() => c.getRoute(), EIAError);
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
  });

  it('throws a transient NETWORK_ERROR without leaking the key', async () => {
    const c = new MockEIA({
      auth: { type: 'CUSTOM', apiKey: 'SECRET-API-KEY-MARKER' },
    });
    c['_fetch'] = (input) =>
      Promise.reject(new TypeError(`error sending request ${String(input)}`));
    const err = await asserts.assertRejects(() => c.getRoute(), EIAError);
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes('SECRET-API-KEY-MARKER'),
      false,
    );
  });
});

describe('EIA — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockEIA({ auth: AUTH, maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = () => {
      calls++;
      return Promise.resolve(
        new Response('{"error":{"code":"OVER_RATE_LIMIT"}}', {
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
    const err = await asserts.assertRejects(() => c.getRoute(), EIAError);
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(() => c.getRoute(), EIAError);
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
const credentials = { apiKey: env.get('CONNECTOR_EIA_API_KEY') };
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'EIA — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    // Built lazily: the suite body runs even when it is ignored.
    let client: EIA | undefined;
    const live = () =>
      client ??= new EIA({
        auth: { type: 'CUSTOM', apiKey: credentials.apiKey! },
      });

    it('reads WTI and Brent daily spot prices', async () => {
      const { rows, pages } = await live().getSpotPrices({
        start: '2026-10-01',
      });
      asserts.assert(rows.some((r) => r.series === 'RWTC'));
      asserts.assert(rows.some((r) => r.series === 'RBRTE'));
      asserts.assertEquals(pages[0]?.offset, 0);
    });

    it('reads the latest WPSR crude stocks and route metadata', async () => {
      const meta = await live().getRoute('petroleum/stoc/wstk');
      asserts.assertExists(meta.response.endPeriod);
      const { rows } = await live().getWeeklyStocks({
        series: [EIA_WPSR_STOCK_SERIES.CRUDE_EXCL_SPR],
        start: meta.response.endPeriod,
      });
      asserts.assertEquals(rows[0]?.period, meta.response.endPeriod);
    });

    it('pages past a small page size', async () => {
      const all = await live().getAllData('petroleum/pri/spt', {
        frequency: 'daily',
        data: ['value'],
        facets: { series: ['RWTC'] },
        start: '2026-01-01',
        sort: [{ column: 'period' }],
      }, { pageSize: 50, maxRows: 120 });
      asserts.assertEquals(all.rows.length, 120);
      asserts.assertEquals(all.pages.length, 3);
    });
  },
});
