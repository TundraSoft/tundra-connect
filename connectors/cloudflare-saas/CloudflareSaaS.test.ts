import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  CloudflareSaaS,
  type CloudflareSaaSOptions,
  DEFAULT_SSL,
} from './CloudflareSaaS.ts';
import { CloudflareSaaSError } from './errors/mod.ts';

const ZONE = '023e105f4ecef8ad9ca31a8372d0c353';
const HOSTNAME_ID = '0d89c70d-ad9f-4843-b99f-6cc0252067e9';
const TOKEN = 'cf-token-secret';
const AUTH = { type: 'BEARER' as const, token: TOKEN };

const hostname = {
  id: HOSTNAME_ID,
  hostname: 'app.customer.com',
  status: 'pending',
  ssl: {
    id: 'ssl-1',
    type: 'dv',
    method: 'http',
    status: 'pending_validation',
    validation_records: [{
      http_url: 'http://app.customer.com/.well-known/pki-validation/ca3-x.txt',
      http_body: 'ca3-abc',
    }],
  },
  ownership_verification: {
    type: 'txt',
    name: '_cf-custom-hostname.app.customer.com',
    value: '5cc07c04-ea62-4a5a-95f0-419334a875a4',
  },
  created_at: '2026-10-04T12:00:00.000Z',
};

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

class MockSaaS extends CloudflareSaaS {
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

function client(extra: Partial<CloudflareSaaSOptions> = {}): MockSaaS {
  const c = new MockSaaS({ auth: AUTH, zoneId: ZONE, ...extra });
  c.setResponse(envelope(hostname));
  return c;
}

const BASE = `/client/v4/zones/${ZONE}/custom_hostnames`;

describe('CloudflareSaaS — configuration', () => {
  it('exposes the vendor name and zone id', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'CloudflareSaaS');
    asserts.assertEquals(c.zoneId, ZONE);
  });

  it('trims a padded zone id', () => {
    asserts.assertEquals(client({ zoneId: `  ${ZONE}  ` }).zoneId, ZONE);
  });

  it('rejects a missing, blank or malformed zone id', () => {
    for (
      const options of [{ auth: AUTH }, { auth: AUTH, zoneId: ' ' }, {
        auth: AUTH,
        zoneId: 'a/b',
      }]
    ) {
      const err = asserts.assertThrows(
        () => new MockSaaS(options as unknown as CloudflareSaaSOptions),
        CloudflareSaaSError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_ZONE_ID');
    }
  });

  it('rejects a missing, non-BEARER or blank API token', () => {
    const cases = [
      { zoneId: ZONE },
      { zoneId: ZONE, auth: { type: 'BASIC', username: 'u', password: 'p' } },
      { zoneId: ZONE, auth: { type: 'BEARER', token: '  ' } },
    ];
    for (const options of cases) {
      const err = asserts.assertThrows(
        () => new MockSaaS(options as unknown as CloudflareSaaSOptions),
        CloudflareSaaSError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_API_TOKEN');
    }
  });
});

describe('CloudflareSaaS — custom hostnames', () => {
  it('lists hostnames with filters and keeps result_info', async () => {
    const c = client();
    c.setResponse(
      envelope([hostname], {
        page: 1,
        per_page: 20,
        count: 1,
        total_count: 1,
        total_pages: 1,
      }),
    );
    const page = await c.listCustomHostnames({
      hostname_status: 'pending',
      ssl_status: 'pending_validation',
      per_page: 20,
      order: 'ssl_status',
      direction: 'asc',
    });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), BASE);
    asserts.assertEquals(c.query(), {
      hostname_status: 'pending',
      ssl_status: 'pending_validation',
      per_page: '20',
      order: 'ssl_status',
      direction: 'asc',
    });
    asserts.assertEquals(page.result[0]?.id, HOSTNAME_ID);
    asserts.assertEquals(page.result_info?.total_count, 1);
    const headers = c.request!.headers ?? {};
    asserts.assertEquals(
      headers['Authorization'] ?? headers['authorization'],
      `Bearer ${TOKEN}`,
    );
  });

  it('lists with no query string when no filter is given', async () => {
    const c = client();
    c.setResponse(envelope([]));
    const page = await c.listCustomHostnames();
    asserts.assertEquals(new URL(c.request!.url).search, '');
    asserts.assertEquals(page.result, []);
  });

  it('creates a hostname, defaulting ssl to http DCV', async () => {
    const c = client();
    const created = await c.createCustomHostname({
      hostname: 'app.customer.com',
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(c.path(), BASE);
    asserts.assertEquals(c.json(), {
      hostname: 'app.customer.com',
      ssl: { method: 'http', type: 'dv' },
    });
    asserts.assertEquals(DEFAULT_SSL, { method: 'http', type: 'dv' });
    asserts.assertEquals(created.id, HOSTNAME_ID);
    asserts.assertEquals(
      created.ssl?.validation_records?.[0]?.http_body,
      'ca3-abc',
    );
  });

  it("creates a hostname with the caller's ssl, metadata and origin", async () => {
    const c = client();
    await c.createCustomHostname({
      hostname: 'app.customer.com',
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
      custom_metadata: { tenant: 'acme' },
      custom_origin_server: 'origin-acme.yourapp.com',
      custom_origin_sni: 'origin-acme.yourapp.com',
    });
    asserts.assertEquals(c.json(), {
      hostname: 'app.customer.com',
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
      custom_metadata: { tenant: 'acme' },
      custom_origin_server: 'origin-acme.yourapp.com',
      custom_origin_sni: 'origin-acme.yourapp.com',
    });
  });

  it('accepts a 201 on create', async () => {
    const c = client();
    c.setResponse(envelope(hostname), 201);
    const created = await c.createCustomHostname({
      hostname: 'app.customer.com',
    });
    asserts.assertEquals(created.hostname, 'app.customer.com');
  });

  it('fetches one hostname', async () => {
    const c = client();
    const h = await c.getCustomHostname({ id: HOSTNAME_ID });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), `${BASE}/${HOSTNAME_ID}`);
    asserts.assertEquals(h.ownership_verification?.type, 'txt');
  });

  it('patches a hostname with only the given fields and accepts a 202', async () => {
    const c = client();
    c.setResponse(
      envelope({ ...hostname, ssl: { ...hostname.ssl, method: 'txt' } }),
      202,
    );
    const h = await c.updateCustomHostname({
      id: HOSTNAME_ID,
      ssl: { method: 'txt', type: 'dv' },
    });
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assertEquals(c.path(), `${BASE}/${HOSTNAME_ID}`);
    asserts.assertEquals(c.json(), { ssl: { method: 'txt', type: 'dv' } });
    asserts.assertEquals(h.ssl?.method, 'txt');
  });

  it('deletes a hostname and resolves to its id', async () => {
    const c = client();
    c.setResponse(envelope({ id: HOSTNAME_ID }));
    const deleted = await c.deleteCustomHostname({ id: HOSTNAME_ID });
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assertEquals(c.path(), `${BASE}/${HOSTNAME_ID}`);
    asserts.assertEquals(deleted, { id: HOSTNAME_ID });
  });

  it('unwraps the envelope and keeps additive fields', async () => {
    const c = client();
    c.setResponse(envelope({ ...hostname, brand_new: 1 }));
    const h = await c.getCustomHostname({ id: HOSTNAME_ID });
    asserts.assertEquals((h as Record<string, unknown>).success, undefined);
    asserts.assertEquals((h as Record<string, unknown>).brand_new, 1);
  });
});

describe('CloudflareSaaS — findCustomHostname', () => {
  it('asks for an exact match and returns the hostname', async () => {
    const c = client();
    c.setResponse(envelope([hostname]));
    const found = await c.findCustomHostname({ hostname: 'App.Customer.com ' });
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), BASE);
    asserts.assertEquals(c.query(), { 'hostname.exact': 'app.customer.com' });
    asserts.assertEquals(found?.id, HOSTNAME_ID);
  });

  it('returns null when nothing matches', async () => {
    const c = client();
    c.setResponse(envelope([]));
    asserts.assertEquals(
      await c.findCustomHostname({ hostname: 'app.customer.com' }),
      null,
    );
  });

  it('never returns a partial match', async () => {
    const c = client();
    c.setResponse(
      envelope([{ ...hostname, hostname: 'shop.app.customer.com' }]),
    );
    asserts.assertEquals(
      await c.findCustomHostname({ hostname: 'app.customer.com' }),
      null,
    );
  });

  it('rejects a blank hostname before sending', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.findCustomHostname({ hostname: ' ' }),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });
});

describe('CloudflareSaaS — certificate fields', () => {
  it('keeps issued certificates and the older top-level DCV fields', async () => {
    const c = client();
    c.setResponse(envelope({
      ...hostname,
      status: 'active',
      ssl: {
        status: 'active',
        method: 'txt',
        txt_name: '_acme-challenge.app.customer.com',
        txt_value: 'legacy-token',
        issued_on: '2026-10-04T12:00:00Z',
        expires_on: '2027-01-02T12:00:00Z',
        certificates: [{
          id: 'cert-1',
          issuer: 'GoogleTrustServices',
          issued_on: '2026-10-04T12:00:00Z',
          expires_on: '2027-01-02T12:00:00Z',
          fingerprint_sha256: 'ab12',
        }],
      },
    }));
    const h = await c.getCustomHostname({ id: HOSTNAME_ID });
    asserts.assertEquals(h.ssl?.txt_value, 'legacy-token');
    asserts.assertEquals(
      h.ssl?.certificates?.[0]?.expires_on,
      '2027-01-02T12:00:00Z',
    );
    asserts.assertEquals(h.ssl?.issued_on, '2026-10-04T12:00:00Z');
  });
});

describe('CloudflareSaaS — fallback origin and quota', () => {
  const origin = {
    origin: 'fallback.yourapp.com',
    status: 'active',
    errors: [],
  };

  it('reads the fallback origin', async () => {
    const c = client();
    c.setResponse(envelope(origin));
    const o = await c.getFallbackOrigin();
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(c.path(), `${BASE}/fallback_origin`);
    asserts.assertEquals(o.origin, 'fallback.yourapp.com');
  });

  it('sets the fallback origin with PUT', async () => {
    const c = client();
    c.setResponse(envelope({ ...origin, status: 'pending_deployment' }));
    const o = await c.setFallbackOrigin({ origin: 'fallback.yourapp.com' });
    asserts.assertEquals(c.request!.method, 'PUT');
    asserts.assertEquals(c.path(), `${BASE}/fallback_origin`);
    asserts.assertEquals(c.json(), { origin: 'fallback.yourapp.com' });
    asserts.assertEquals(o.status, 'pending_deployment');
  });

  it('deletes the fallback origin', async () => {
    const c = client();
    c.setResponse(envelope({ ...origin, status: 'pending_deletion' }));
    const o = await c.deleteFallbackOrigin();
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assertEquals(c.path(), `${BASE}/fallback_origin`);
    asserts.assertEquals(o.status, 'pending_deletion');
  });

  it('reads the quota', async () => {
    const c = client();
    c.setResponse(
      envelope({ allocated: 100, used: 12, hard_cap: 100, exceeded: false }),
    );
    const q = await c.getQuota();
    asserts.assertEquals(c.path(), `${BASE}/quota`);
    asserts.assertEquals(q.used, 12);
  });
});

describe('CloudflareSaaS — local request validation', () => {
  const rejects = async (
    call: (c: MockSaaS) => Promise<unknown>,
    fragment: string,
  ) => {
    const c = client();
    const err = await asserts.assertRejects(() => call(c), CloudflareSaaSError);
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      fragment,
    );
    asserts.assertEquals(c.request, undefined);
  };

  it('rejects a malformed hostname before sending', async () => {
    for (
      const bad of [
        '',
        'nodots',
        'has space.example',
        'http://app.customer.com',
      ]
    ) {
      await rejects(
        (c) => c.createCustomHostname({ hostname: bad }),
        'hostname',
      );
    }
  });

  it('rejects an invalid ssl block and origin', async () => {
    await rejects(
      (c) =>
        c.createCustomHostname({
          hostname: 'app.customer.com',
          ssl: { method: 'dns' as never },
        }),
      'ssl',
    );
    await rejects(
      (c) =>
        c.createCustomHostname({
          hostname: 'app.customer.com',
          custom_origin_server: 'bad origin',
        }),
      'custom_origin_server',
    );
  });

  it('rejects a malformed custom hostname id', async () => {
    for (const id of ['', ' ', 'a/b', '../x']) {
      await rejects((c) => c.getCustomHostname({ id }), 'id');
      await rejects((c) => c.deleteCustomHostname({ id }), 'id');
      await rejects(
        (c) => c.updateCustomHostname({ id, ssl: { method: 'txt' } }),
        'id',
      );
    }
  });

  it('rejects an empty update', async () => {
    await rejects(
      (c) => c.updateCustomHostname({ id: HOSTNAME_ID }),
      'at least one field',
    );
  });

  it('rejects an invalid list filter and fallback origin', async () => {
    await rejects((c) => c.listCustomHostnames({ per_page: 1 }), 'per_page');
    await rejects(
      (c) => c.listCustomHostnames({ hostname_status: 'live' as never }),
      'hostname_status',
    );
    await rejects((c) => c.setFallbackOrigin({ origin: '' }), 'origin');
  });
});

describe('CloudflareSaaS — error mapping', () => {
  const cases: [number, number, string, string][] = [
    [400, 1407, 'Invalid custom hostname.', 'INVALID_HOSTNAME'],
    [
      400,
      1409,
      'Reserved top domain custom hostnames... not supported.',
      'INVALID_HOSTNAME',
    ],
    [400, 1415, 'Invalid custom origin hostname.', 'INVALID_HOSTNAME'],
    [
      400,
      1421,
      'Custom origin hostname does not exist as a DNS record.',
      'INVALID_HOSTNAME',
    ],
    [409, 1406, 'Duplicate custom hostname found.', 'DUPLICATE_HOSTNAME'],
    [403, 1404, 'No quota has been allocated for this zone.', 'QUOTA_EXCEEDED'],
    [403, 1405, 'Quota exceeded.', 'QUOTA_EXCEEDED'],
    [
      403,
      1413,
      'No custom metadata access allocated for this zone.',
      'FORBIDDEN',
    ],
    [
      403,
      1414,
      'Access to setting custom origin server not granted.',
      'FORBIDDEN',
    ],
    [404, 1436, 'The custom hostname was not found.', 'NOT_FOUND'],
    [400, 1435, 'The custom hostname ID is invalid.', 'INVALID_REQUEST'],
    [
      409,
      1439,
      'Modifying the custom hostname is not supported.',
      'INVALID_REQUEST',
    ],
    [
      400,
      1449,
      'The request input bundle_method must be one of: ubiquitous, optimal, force.',
      'INVALID_REQUEST',
    ],
    [401, 1000, 'Unable to extract bearer token', 'AUTH_FAILED'],
    [400, 10000, 'Authentication error', 'AUTH_FAILED'],
    [403, 10000, 'Authentication error', 'FORBIDDEN'],
    [401, 9109, 'Invalid access token', 'AUTH_FAILED'],
    [
      400,
      7003,
      'Could not route to /zones/x/custom_hostnames, perhaps your object identifier is invalid?',
      'NOT_FOUND',
    ],
    [500, 1500, 'Internal Server Error', 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, vendorCode, message, expected] of cases) {
    it(`maps vendor code ${vendorCode} on HTTP ${status} to ${expected}`, async () => {
      const c = client();
      c.setResponse(errorEnvelope(vendorCode, message), status);
      const err = await asserts.assertRejects(
        () => c.getCustomHostname({ id: HOSTNAME_ID }),
        CloudflareSaaSError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.getContextValue('vendorCode'), vendorCode);
      asserts.assertEquals(err.getContextValue('status'), status);
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
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'AUTH_FAILED');
  });

  const byStatus: [number, string][] = [
    [400, 'INVALID_REQUEST'],
    [401, 'AUTH_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    // Only Cloudflare's code 1406 means a duplicate; an unexplained 409
    // is reported as a refused request, not guessed at.
    [409, 'INVALID_REQUEST'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, expected] of byStatus) {
    it(`falls back to ${expected} for an unmapped code on HTTP ${status}`, async () => {
      const c = client();
      c.setResponse(errorEnvelope(99999, 'brand new'), status, {
        'content-type': 'application/json',
        'retry-after': '3',
      });
      const err = await asserts.assertRejects(
        () => c.getQuota(),
        CloudflareSaaSError,
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
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(err.getContextValue('detail'), 'no detail');
  });

  it('treats success:false on a 200 as a failure', async () => {
    const c = client();
    c.setResponse(
      errorEnvelope(1436, 'The custom hostname was not found.'),
      200,
    );
    const err = await asserts.assertRejects(
      () => c.getCustomHostname({ id: HOSTNAME_ID }),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });

  it('raises RESPONSE_ERROR when a success body fails validation', async () => {
    const c = client();
    c.setResponse(envelope({ hostname: 'no id' }));
    const err = await asserts.assertRejects(
      () => c.getCustomHostname({ id: HOSTNAME_ID }),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');

    c.setResponse(envelope({ not: 'an array' }));
    const paged = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(paged.code, 'RESPONSE_ERROR');
  });

  it('never leaks the API token into a mapped vendor error', async () => {
    const c = client();
    c.setResponse(errorEnvelope(10000, 'Authentication error'), 400);
    const err = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(JSON.stringify(err.toJSON()).includes(TOKEN), false);
  });
});

describe('CloudflareSaaS — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockSaaS({ auth: AUTH, zoneId: ZONE, timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(JSON.stringify(err.toJSON()).includes(TOKEN), false);
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = client();
    c.setResponse('<html>503</html>', 503, { 'content-type': 'text/html' });
    const outage = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse(errorEnvelope(10000, 'Authentication error'), 403);
    const refusal = await asserts.assertRejects(
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
    );
    asserts.assertEquals(refusal.code, 'FORBIDDEN');
    asserts.assertEquals(refusal.transient, false);
  });
});

describe('CloudflareSaaS — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockSaaS({ auth: AUTH, zoneId: ZONE, maxRetryWait });
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
      () => c.listCustomHostnames(),
      CloudflareSaaSError,
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
      () => c.getQuota(),
      CloudflareSaaSError,
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
  token: env.get('CONNECTOR_CLOUDFLARE_SAAS_API_TOKEN'),
  zoneId: env.get('CONNECTOR_CLOUDFLARE_SAAS_ZONE_ID'),
  testHostname: env.get('CONNECTOR_CLOUDFLARE_SAAS_TEST_HOSTNAME'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'CloudflareSaaS — live',
  // Self-contained: the one custom hostname it creates uses TXT validation
  // (so nothing is attempted against the hostname's origin), stays
  // `pending`, and is deleted in a `finally`. The fallback origin is only
  // read, never changed — changing it would reroute every live customer.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new CloudflareSaaS({
        auth: { type: 'BEARER', token: credentials.token! },
        zoneId: credentials.zoneId!,
      });

    it('reads the quota, the fallback origin and the hostname list', async () => {
      const saas = live();
      const quota = await saas.getQuota();
      asserts.assertEquals(typeof quota.used, 'number');
      try {
        const origin = await saas.getFallbackOrigin();
        asserts.assertEquals(typeof origin.origin, 'string');
      } catch (err) {
        // A zone with Cloudflare for SaaS enabled but no fallback origin yet
        // answers NOT_FOUND; that is a legitimate state, not a failure.
        asserts.assert(
          err instanceof CloudflareSaaSError && err.code === 'NOT_FOUND',
        );
      }
      const page = await saas.listCustomHostnames({ per_page: 5 });
      asserts.assert(Array.isArray(page.result));
      asserts.assertExists(page.result_info);
    });

    it('creates, reads, updates, lists and deletes a custom hostname', async () => {
      const saas = live();
      const created = await saas.createCustomHostname({
        hostname: credentials.testHostname!,
        ssl: { method: 'txt', type: 'dv' },
      });
      try {
        asserts.assertEquals(
          created.hostname.toLowerCase(),
          credentials.testHostname!.toLowerCase(),
        );
        asserts.assertExists(created.ownership_verification);

        const fetched = await saas.getCustomHostname({ id: created.id });
        asserts.assertEquals(fetched.id, created.id);

        const listed = await saas.listCustomHostnames({
          hostname: credentials.testHostname!,
        });
        asserts.assertEquals(listed.result[0]?.id, created.id);

        // Re-sending the same ssl asks Cloudflare to retry validation — a
        // no-op change that every plan allows.
        const updated = await saas.updateCustomHostname({
          id: created.id,
          ssl: { method: 'txt', type: 'dv' },
        });
        asserts.assertEquals(updated.id, created.id);
      } finally {
        const deleted = await saas.deleteCustomHostname({ id: created.id });
        asserts.assertEquals(deleted.id, created.id);
      }
    });

    it('reports NOT_FOUND for a custom hostname that does not exist', async () => {
      const err = await asserts.assertRejects(
        () =>
          live().getCustomHostname({
            id: '00000000-0000-0000-0000-000000000000',
          }),
        CloudflareSaaSError,
      );
      asserts.assertEquals(err.code, 'NOT_FOUND');
    });
  },
});
