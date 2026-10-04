import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { CloudflareDNS, type CloudflareDNSOptions } from './CloudflareDNS.ts';
import { CloudflareDNSError } from './errors/mod.ts';

const ZONE = '023e105f4ecef8ad9ca31a8372d0c353';
const RECORD = '372e67954025e0ba6aaa6d586b9e0b59';
const TOKEN = 'cf-token-secret';
const AUTH = { type: 'BEARER' as const, token: TOKEN };

const record = {
  id: RECORD,
  zone_id: ZONE,
  zone_name: 'example.com',
  name: 'app.example.com',
  type: 'A',
  content: '203.0.113.10',
  proxiable: true,
  proxied: true,
  ttl: 1,
  created_on: '2026-10-04T12:00:00.000Z',
  modified_on: '2026-10-04T12:00:00.000Z',
};

/** Envelope Cloudflare wraps every client/v4 response in. */
function envelope(result: unknown, result_info?: unknown) {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    ...(result_info ? { result_info } : {}),
  };
}

function errorEnvelope(
  code: number,
  message: string,
  chain?: { code: number; message: string }[],
) {
  return {
    success: false,
    errors: [{ code, message, ...(chain ? { error_chain: chain } : {}) }],
    messages: [],
    result: null,
  };
}

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

class MockDNS extends CloudflareDNS {
  public request?: Captured;

  setResponse(
    body: unknown,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(new Response(text, { status, headers }));
    };
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.request?.body ?? '{}');
  }

  path(): string {
    return new URL(this.request!.url).pathname;
  }

  query(): Record<string, string> {
    return Object.fromEntries(new URL(this.request!.url).searchParams);
  }
}

function client(extra: Partial<CloudflareDNSOptions> = {}): MockDNS {
  const c = new MockDNS({ auth: AUTH, zoneId: ZONE, ...extra });
  c.setResponse(envelope(record));
  return c;
}

describe('CloudflareDNS — configuration', () => {
  it('exposes the vendor name and zone id', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'CloudflareDNS');
    asserts.assertEquals(c.zoneId, ZONE);
  });

  it('works without a default zone id', () => {
    const c = new MockDNS({ auth: AUTH });
    asserts.assertEquals(c.zoneId, undefined);
  });

  it('trims a padded zone id', () => {
    asserts.assertEquals(client({ zoneId: `  ${ZONE}  ` }).zoneId, ZONE);
  });

  it('rejects a blank or malformed zone id', () => {
    for (const zoneId of ['', '   ', 'zone/with/slash', 'a'.repeat(65)]) {
      const err = asserts.assertThrows(
        () => new MockDNS({ auth: AUTH, zoneId }),
        CloudflareDNSError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_ZONE_ID', zoneId);
    }
  });

  it('rejects a missing, non-BEARER or blank API token', () => {
    const cases = [
      {},
      { auth: { type: 'BASIC', username: 'u', password: 'p' } },
      { auth: { type: 'BEARER', token: '  ' } },
    ];
    for (const options of cases) {
      const err = asserts.assertThrows(
        () => new MockDNS(options as unknown as CloudflareDNSOptions),
        CloudflareDNSError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_API_TOKEN');
    }
  });
});

describe('CloudflareDNS — zones', () => {
  it('lists zones with a name filter and keeps result_info', async () => {
    const c = client();
    const zone = { id: ZONE, name: 'example.com', status: 'active' };
    c.setResponse(
      envelope([zone], {
        page: 1,
        per_page: 20,
        count: 1,
        total_count: 1,
        total_pages: 1,
      }),
    );
    const page = await c.listZones({ name: 'example.com', per_page: 20 });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), '/client/v4/zones');
    asserts.assertEquals(c.query(), { name: 'example.com', per_page: '20' });
    asserts.assertEquals(page.result[0]?.id, ZONE);
    asserts.assertEquals(page.result_info?.total_count, 1);
    const headers = c.request!.headers ?? {};
    asserts.assertEquals(
      headers['Authorization'] ?? headers['authorization'],
      `Bearer ${TOKEN}`,
    );
  });

  it('lists zones with no query string when no filter is given', async () => {
    const c = client();
    c.setResponse(envelope([]));
    const page = await c.listZones();
    asserts.assertEquals(new URL(c.request!.url).search, '');
    asserts.assertEquals(page.result, []);
    asserts.assertEquals(page.result_info, undefined);
  });

  it('rejects an invalid zone filter before sending', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.listZones({ per_page: 1 }),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      'per_page',
    );
    asserts.assertEquals(c.request, undefined);
  });

  it('fetches the default zone, or a named one', async () => {
    const c = client();
    c.setResponse(envelope({ id: ZONE, name: 'example.com' }));
    const zone = await c.getZone();
    asserts.assertEquals(c.path(), `/client/v4/zones/${ZONE}`);
    asserts.assertEquals(zone.name, 'example.com');

    c.setResponse(envelope({ id: 'other', name: 'other.example' }));
    await c.getZone({ zoneId: 'other' });
    asserts.assertEquals(c.path(), '/client/v4/zones/other');
  });
});

describe('CloudflareDNS — records', () => {
  it('lists records with filters, paging and ordering', async () => {
    const c = client();
    c.setResponse(
      envelope([record], {
        page: 1,
        per_page: 100,
        count: 1,
        total_count: 1,
        total_pages: 1,
      }),
    );
    const page = await c.listRecords({
      type: 'A',
      name: 'app.example.com',
      proxied: true,
      per_page: 100,
      order: 'name',
      direction: 'asc',
    });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), `/client/v4/zones/${ZONE}/dns_records`);
    asserts.assertEquals(c.query(), {
      type: 'A',
      name: 'app.example.com',
      proxied: 'true',
      per_page: '100',
      order: 'name',
      direction: 'asc',
    });
    asserts.assertEquals(page.result[0]?.id, RECORD);
    asserts.assertEquals(page.result_info?.total_pages, 1);
  });

  it('uses a per-call zone id over the client default', async () => {
    const c = client();
    c.setResponse(envelope([]));
    await c.listRecords({ zoneId: 'perCallZone' });
    asserts.assertEquals(c.path(), '/client/v4/zones/perCallZone/dns_records');
    asserts.assertEquals(new URL(c.request!.url).search, '');
  });

  it('requires a zone id from somewhere', async () => {
    const c = new MockDNS({ auth: AUTH });
    c.setResponse(envelope([]));
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      'zoneId',
    );
    asserts.assertEquals(c.request, undefined);
    // …but a per-call one is enough.
    await c.listRecords({ zoneId: ZONE });
    asserts.assertEquals(c.path(), `/client/v4/zones/${ZONE}/dns_records`);
  });

  it('fetches one record', async () => {
    const c = client();
    const r = await c.getRecord({ recordId: RECORD });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/${RECORD}`,
    );
    asserts.assertEquals(r.content, '203.0.113.10');
  });

  it('creates a record with the JSON body Cloudflare documents', async () => {
    const c = client();
    const r = await c.createRecord({
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.10',
      proxied: true,
      ttl: 1,
      comment: 'web',
      tags: ['env:prod'],
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(c.path(), `/client/v4/zones/${ZONE}/dns_records`);
    asserts.assertEquals(c.json(), {
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.10',
      proxied: true,
      ttl: 1,
      comment: 'web',
      tags: ['env:prod'],
    });
    asserts.assertEquals(r.id, RECORD);
  });

  it('creates a structured record from data alone', async () => {
    const c = client();
    await c.createRecord({
      type: 'SRV',
      name: '_sip._tcp.example.com',
      data: { priority: 10, weight: 5, port: 5060, target: 'sip.example.com' },
    });
    asserts.assertEquals(c.json().data, {
      priority: 10,
      weight: 5,
      port: 5060,
      target: 'sip.example.com',
    });
    asserts.assertEquals('content' in c.json(), false);
  });

  it('never sends zoneId in the body', async () => {
    const c = client();
    await c.createRecord({
      zoneId: ZONE,
      type: 'A',
      name: 'n.example.com',
      content: '203.0.113.1',
    });
    asserts.assertEquals('zoneId' in c.json(), false);
  });

  it('patches a record with only the given fields', async () => {
    const c = client();
    await c.updateRecord({
      recordId: RECORD,
      content: '203.0.113.11',
      comment: 'moved',
    });
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/${RECORD}`,
    );
    asserts.assertEquals(c.json(), {
      content: '203.0.113.11',
      comment: 'moved',
    });
  });

  it('replaces a record with PUT', async () => {
    const c = client();
    await c.replaceRecord({
      recordId: RECORD,
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.12',
    });
    asserts.assertEquals(c.request!.method, 'PUT');
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/${RECORD}`,
    );
    asserts.assertEquals(c.json(), {
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.12',
    });
  });

  it('deletes a record and resolves to its id', async () => {
    const c = client();
    c.setResponse(envelope({ id: RECORD }));
    const deleted = await c.deleteRecord({ recordId: RECORD });
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/${RECORD}`,
    );
    asserts.assertEquals(deleted, { id: RECORD });
  });

  it('posts a batch and resolves to its four lists', async () => {
    const c = client();
    c.setResponse(
      envelope({ deletes: [record], posts: [{ ...record, id: 'new' }] }),
    );
    const result = await c.batch({
      deletes: [{ id: RECORD }],
      posts: [{ type: 'A', name: 'b.example.com', content: '203.0.113.2' }],
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/batch`,
    );
    asserts.assertEquals(c.json(), {
      deletes: [{ id: RECORD }],
      posts: [{ type: 'A', name: 'b.example.com', content: '203.0.113.2' }],
    });
    asserts.assertEquals(result.deletes?.[0]?.id, RECORD);
    asserts.assertEquals(result.posts?.[0]?.id, 'new');
  });

  it('exports the zone as text', async () => {
    const c = client();
    c.setResponse('example.com.\t300\tIN\tA\t203.0.113.10\n', 200, {
      'content-type': 'text/plain',
    });
    const bind = await c.exportRecords();
    asserts.assertEquals(
      c.path(),
      `/client/v4/zones/${ZONE}/dns_records/export`,
    );
    asserts.assertStringIncludes(bind, 'IN\tA');
  });

  it('unwraps the envelope and keeps additive record fields', async () => {
    const c = client();
    c.setResponse(envelope({ ...record, brand_new: 1 }));
    const r = await c.getRecord({ recordId: RECORD });
    asserts.assertEquals((r as Record<string, unknown>).success, undefined);
    asserts.assertEquals((r as Record<string, unknown>).brand_new, 1);
  });
});

describe('CloudflareDNS — local request validation', () => {
  const rejects = async (
    call: (c: MockDNS) => Promise<unknown>,
    fragment: string,
  ) => {
    const c = client();
    const err = await asserts.assertRejects(() => call(c), CloudflareDNSError);
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      fragment,
    );
    asserts.assertEquals(c.request, undefined);
  };

  it('rejects a record with neither content nor data', async () => {
    await rejects(
      (c) => c.createRecord({ type: 'A', name: 'n.example.com' }),
      'content',
    );
    await rejects(
      (c) =>
        c.replaceRecord({ recordId: RECORD, type: 'A', name: 'n.example.com' }),
      'content',
    );
  });

  it('rejects an unknown type, empty name, bad ttl, and names the fields', async () => {
    await rejects(
      (c) =>
        c.createRecord({
          type: 'SPF' as never,
          name: '',
          content: 'c',
          ttl: 5,
        }),
      'type: ',
    );
    const c = client();
    const err = await asserts.assertRejects(
      () =>
        c.createRecord({
          type: 'SPF' as never,
          name: '',
          content: 'c',
          ttl: 5,
        }),
      CloudflareDNSError,
    );
    const reason = String(err.getContextValue('reason'));
    asserts.assertStringIncludes(reason, 'name: ');
    asserts.assertStringIncludes(reason, 'ttl: ');
  });

  it('rejects a malformed record id', async () => {
    for (const recordId of ['', ' ', 'a/b', '../x', 'x'.repeat(65)]) {
      await rejects((c) => c.getRecord({ recordId }), 'recordId');
      await rejects((c) => c.deleteRecord({ recordId }), 'recordId');
    }
  });

  it('rejects a malformed per-call zone id', async () => {
    await rejects((c) => c.listRecords({ zoneId: 'bad/zone' }), 'zoneId');
    await rejects((c) => c.getZone({ zoneId: '' }), 'zoneId');
  });

  it('rejects an empty patch', async () => {
    await rejects(
      (c) => c.updateRecord({ recordId: RECORD }),
      'at least one field',
    );
  });

  it('rejects a batch with nothing in it, or a put/post without content', async () => {
    await rejects((c) => c.batch({}), 'non-empty');
    await rejects((c) => c.batch({ deletes: [], posts: [] }), 'non-empty');
    await rejects(
      (c) => c.batch({ posts: [{ type: 'A', name: 'n.example.com' }] }),
      'content',
    );
    await rejects(
      (c) =>
        c.batch({ puts: [{ id: RECORD, type: 'A', name: 'n.example.com' }] }),
      'content',
    );
  });

  it('rejects an invalid list filter', async () => {
    await rejects((c) => c.listRecords({ per_page: 0 }), 'per_page');
    await rejects((c) => c.listRecords({ order: 'id' as never }), 'order');
  });
});

describe('CloudflareDNS — error mapping', () => {
  const cases: [number, number, string, string][] = [
    [400, 1004, 'DNS Validation Error', 'INVALID_REQUEST'],
    [400, 10000, 'Authentication error', 'AUTH_FAILED'],
    [401, 9109, 'Invalid access token', 'AUTH_FAILED'],
    [
      400,
      9106,
      'Missing X-Auth-Key, X-Auth-Email or Authorization headers',
      'AUTH_FAILED',
    ],
    [403, 10000, 'Authentication error', 'FORBIDDEN'],
    [
      400,
      7003,
      'Could not route to /zones/x/dns_records, perhaps your object identifier is invalid?',
      'NOT_FOUND',
    ],
    [404, 81044, 'Record does not exist.', 'NOT_FOUND'],
    [400, 81057, 'An identical record already exists.', 'RECORD_CONFLICT'],
    [
      400,
      81053,
      'An A, AAAA, or CNAME record with that host already exists.',
      'RECORD_CONFLICT',
    ],
    [400, 81056, 'NS records with that host already exist.', 'RECORD_CONFLICT'],
  ];

  for (const [status, vendorCode, message, expected] of cases) {
    it(`maps vendor code ${vendorCode} on HTTP ${status} to ${expected}`, async () => {
      const c = client();
      c.setResponse(errorEnvelope(vendorCode, message), status);
      const err = await asserts.assertRejects(
        () => c.getRecord({ recordId: RECORD }),
        CloudflareDNSError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.getContextValue('vendorCode'), vendorCode);
      asserts.assertEquals(err.getContextValue('status'), status);
      asserts.assertStringIncludes(
        String(err.getContextValue('detail')),
        String(vendorCode),
      );
    });
  }

  it('consults error_chain when the top-level code is unmapped', async () => {
    const c = client();
    c.setResponse(
      errorEnvelope(6003, 'Invalid request headers', [
        { code: 6111, message: 'Invalid format for Authorization header' },
      ]),
      400,
    );
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'AUTH_FAILED');
    asserts.assertEquals(err.getContextValue('vendorCode'), 6003);
  });

  const byStatus: [number, string][] = [
    [400, 'INVALID_REQUEST'],
    [401, 'AUTH_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'RECORD_CONFLICT'],
    [422, 'INVALID_REQUEST'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVICE_UNAVAILABLE'],
    [502, 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, expected] of byStatus) {
    it(`falls back to ${expected} for an unmapped code on HTTP ${status}`, async () => {
      const c = client();
      c.setResponse(errorEnvelope(99999, 'brand new'), status, {
        'content-type': 'application/json',
        'retry-after': '3',
      });
      const err = await asserts.assertRejects(
        () => c.getRecord({ recordId: RECORD }),
        CloudflareDNSError,
      );
      asserts.assertEquals(err.code, expected);
      if (status === 429) {
        asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 3);
      }
    });
  }

  it('falls back to HTTP status when the body is not an envelope', async () => {
    const c = client();
    c.setResponse('<html>502 Bad Gateway</html>', 502, {
      'content-type': 'text/html',
    });
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(err.getContextValue('detail'), 'no detail');
  });

  it('treats success:false on a 200 as a failure', async () => {
    const c = client();
    c.setResponse(errorEnvelope(81044, 'Record does not exist.'), 200);
    const err = await asserts.assertRejects(
      () => c.getRecord({ recordId: RECORD }),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });

  it('raises RESPONSE_ERROR when a success body fails validation', async () => {
    const c = client();
    c.setResponse(envelope({ name: 'no id', type: 'A' }));
    const err = await asserts.assertRejects(
      () => c.getRecord({ recordId: RECORD }),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');

    c.setResponse(envelope({ not: 'an array' }));
    const paged = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(paged.code, 'RESPONSE_ERROR');
  });

  it('never leaks the API token into a mapped vendor error', async () => {
    const c = client();
    c.setResponse(errorEnvelope(10000, 'Authentication error'), 400);
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(JSON.stringify(err.toJSON()).includes(TOKEN), false);
  });
});

describe('CloudflareDNS — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockDNS({ auth: AUTH, zoneId: ZONE, timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(JSON.stringify(err.toJSON()).includes(TOKEN), false);
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = client();
    c.setResponse('<html>503</html>', 503, { 'content-type': 'text/html' });
    const outage = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse(errorEnvelope(10000, 'Authentication error'), 403);
    const refusal = await asserts.assertRejects(
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(refusal.code, 'FORBIDDEN');
    asserts.assertEquals(refusal.transient, false);
  });
});

describe('CloudflareDNS — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockDNS({ auth: AUTH, zoneId: ZONE, maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (_input) => {
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
      () => c.listRecords(),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.deleteRecord({ recordId: RECORD }),
      CloudflareDNSError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
const credentials = {
  token: env.get('CONNECTOR_CLOUDFLARE_DNS_API_TOKEN'),
  zoneId: env.get('CONNECTOR_CLOUDFLARE_DNS_ZONE_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'CloudflareDNS — live',
  // Self-contained: every record it creates carries a unique
  // `_tundra-connect-live-*` TXT name and is deleted in a `finally`, so the
  // zone is left as it was found. Nothing here is visible outside the zone.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new CloudflareDNS({
        auth: { type: 'BEARER', token: credentials.token! },
        zoneId: credentials.zoneId!,
      });

    it('reads the zone and lists its records', async () => {
      const dns = live();
      const zone = await dns.getZone();
      asserts.assertEquals(zone.id, credentials.zoneId);
      const page = await dns.listRecords({ per_page: 5 });
      asserts.assert(Array.isArray(page.result));
      asserts.assertExists(page.result_info);
      const zones = await dns.listZones({ name: zone.name });
      asserts.assertEquals(zones.result[0]?.id, zone.id);
    });

    it('creates, reads, patches, replaces and deletes a TXT record', async () => {
      const dns = live();
      const zone = await dns.getZone();
      const name = `_tundra-connect-live-${
        crypto.randomUUID().slice(0, 8)
      }.${zone.name}`;
      const created = await dns.createRecord({
        type: 'TXT',
        name,
        content: '"tundra-connect live test"',
        ttl: 60,
        comment: 'tundra-connect live test — safe to delete',
      });
      try {
        asserts.assertEquals(created.type, 'TXT');
        const fetched = await dns.getRecord({ recordId: created.id });
        asserts.assertEquals(fetched.id, created.id);

        const patched = await dns.updateRecord({
          recordId: created.id,
          comment: 'patched',
        });
        asserts.assertEquals(patched.comment, 'patched');

        const replaced = await dns.replaceRecord({
          recordId: created.id,
          type: 'TXT',
          name,
          content: '"tundra-connect live test v2"',
          ttl: 120,
        });
        asserts.assertEquals(replaced.ttl, 120);

        const listed = await dns.listRecords({ type: 'TXT', name });
        asserts.assertEquals(listed.result[0]?.id, created.id);

        const bind = await dns.exportRecords();
        asserts.assertStringIncludes(bind.toLowerCase(), name.toLowerCase());
      } finally {
        const deleted = await dns.deleteRecord({ recordId: created.id });
        asserts.assertEquals(deleted.id, created.id);
      }
    });

    it('applies a batch that creates then deletes a record', async () => {
      const dns = live();
      const zone = await dns.getZone();
      const name = `_tundra-connect-live-${
        crypto.randomUUID().slice(0, 8)
      }.${zone.name}`;
      const created = await dns.batch({
        posts: [{ type: 'TXT', name, content: '"batch"', ttl: 60 }],
      });
      const id = created.posts?.[0]?.id;
      asserts.assertExists(id);
      try {
        const removed = await dns.batch({ deletes: [{ id }] });
        asserts.assertEquals(removed.deletes?.[0]?.id, id);
      } catch (err) {
        // The batch delete failed: fall back to a plain delete so the zone
        // is still left clean, then re-throw.
        await dns.deleteRecord({ recordId: id }).catch(() => {});
        throw err;
      }
    });

    it('reports NOT_FOUND for a record that does not exist', async () => {
      const err = await asserts.assertRejects(
        () => live().getRecord({ recordId: '0'.repeat(32) }),
        CloudflareDNSError,
      );
      asserts.assertEquals(err.code, 'NOT_FOUND');
    });
  },
});
