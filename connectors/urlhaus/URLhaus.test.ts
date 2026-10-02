import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { URLhaus, type URLhausOptions } from './URLhaus.ts';
import { URLhausError } from './errors/mod.ts';

const AUTH_KEY = 'urlhaus-auth-key-do-not-leak';
const AUTH = { type: 'CUSTOM' as const, authKey: AUTH_KEY };

type Captured = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
};

class MockURLhaus extends URLhaus {
  public request?: Captured;

  setResponse(
    body: unknown,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    this._fetch = (input, init) => {
      this.capture(input, init);
      return Promise.resolve(new Response(text, { status, headers }));
    };
  }

  /** A transport that never answers on its own — only the abort ends it. */
  hang(): void {
    this._fetch = (input, init) => {
      this.capture(input, init);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal!.reason);
        });
      });
    };
  }

  /** A transport that fails the way `fetch` does on a DNS/socket error. */
  failNetwork(): void {
    this._fetch = (input, init) => {
      this.capture(input, init);
      return Promise.reject(new TypeError('error sending request'));
    };
  }

  /** The captured form body, decoded. */
  form(): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(this.request?.body ?? ''));
  }

  private capture(input: RequestInfo | URL, init?: RequestInit): void {
    this.request = {
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
  }
}

function client(overrides: Partial<URLhausOptions> = {}): MockURLhaus {
  const c = new MockURLhaus({ auth: AUTH, ...overrides });
  c.setResponse({ query_status: 'no_results' });
  return c;
}

/** Abridged from the `/v1/url/` example in URLhaus's API documentation. */
const URL_OK = {
  query_status: 'ok',
  id: '105821',
  urlhaus_reference: 'https://urlhaus.abuse.ch/url/105821/',
  url: 'http://sskymedia.com/VMYB-ht_JAQo-gi/INV/99401FORPO/',
  url_status: 'online',
  host: 'sskymedia.com',
  date_added: '2019-01-19 01:33:26 UTC',
  last_online: null,
  threat: 'malware_download',
  blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'listed' },
  reporter: 'Cryptolaemus1',
  larted: 'true',
  takedown_time_seconds: null,
  tags: ['emotet', 'epoch2', 'heodo'],
  payloads: [{
    firstseen: '2019-01-19',
    filename: '5616769081079106.doc',
    file_type: 'doc',
    response_size: '179664',
    response_md5: 'fedfa8ad9ee7846b88c5da79b32f6551',
    response_sha256:
      'dc9f3b226bccb2f1fd4810cde541e5a10d59a1fe683f4a9462293b6ade8d8403',
    urlhaus_download:
      'https://urlhaus-api.abuse.ch/v1/download/dc9f3b226bccb2f1fd4810cde541e5a10d59a1fe683f4a9462293b6ade8d8403/',
    signature: null,
    virustotal: {
      result: '16 / 58',
      percent: '27.59',
      link: 'https://www.virustotal.com/file/dc9f/analysis/1547871259/',
    },
  }],
};

/** Abridged from the `/v1/host/` example. */
const HOST_OK = {
  query_status: 'ok',
  urlhaus_reference: 'https://urlhaus.abuse.ch/host/vektorex.com/',
  host: 'vektorex.com',
  firstseen: '2019-01-15 07:09:01 UTC',
  url_count: '120',
  blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'not listed' },
  urls: [{
    id: '121319',
    urlhaus_reference: 'https://urlhaus.abuse.ch/url/121319/',
    url: 'http://vektorex.com/source/Z/5016223.exe',
    url_status: 'online',
    date_added: '2019-02-11 07:45:05 UTC',
    threat: 'malware_download',
    reporter: 'abuse_ch',
    larted: 'false',
    takedown_time_seconds: null,
    tags: ['AZORult', 'exe'],
  }],
};

const MD5 = '12c8aec5766ac3e6f26f2505e2f4a8f2';
const SHA256 =
  '35e304d10d53834e3e41035d12122773c9a4d183a24e03f980ad3e6b2ecde7fa';

describe('URLhaus — configuration', () => {
  it('constructs with an Auth-Key and names its vendor', () => {
    asserts.assertEquals(client().vendor, 'URLhaus');
  });

  it('rejects a missing auth', () => {
    const err = asserts.assertThrows(
      () => new MockURLhaus({} as unknown as URLhausOptions),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });

  it('rejects a blank Auth-Key', () => {
    const err = asserts.assertThrows(
      () => new MockURLhaus({ auth: { type: 'CUSTOM', authKey: ' ' } }),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });

  it('rejects a non-CUSTOM auth', () => {
    const err = asserts.assertThrows(
      () =>
        new MockURLhaus({
          auth: { type: 'BEARER', token: 't' },
        } as unknown as URLhausOptions),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });
});

describe('URLhaus — requests', () => {
  const cases: Array<{
    name: string;
    call: (c: MockURLhaus) => Promise<unknown>;
    method: string;
    path: string;
    form?: Record<string, string>;
  }> = [
    {
      name: 'lookupUrl',
      call: (c) => c.lookupUrl({ url: 'http://bad.example/a b?x=1&y=2' }),
      method: 'POST',
      path: '/v1/url/',
      form: { url: 'http://bad.example/a b?x=1&y=2' },
    },
    {
      name: 'lookupUrlId (sends both documented field names)',
      call: (c) => c.lookupUrlId({ id: 105821 }),
      method: 'POST',
      path: '/v1/urlid/',
      form: { urlid: '105821', id: '105821' },
    },
    {
      name: 'lookupHost',
      call: (c) => c.lookupHost({ host: 'vektorex.com' }),
      method: 'POST',
      path: '/v1/host/',
      form: { host: 'vektorex.com' },
    },
    {
      name: 'lookupPayload by md5',
      call: (c) => c.lookupPayload({ md5_hash: MD5 }),
      method: 'POST',
      path: '/v1/payload/',
      form: { md5_hash: MD5 },
    },
    {
      name: 'lookupPayload by sha256',
      call: (c) => c.lookupPayload({ sha256_hash: SHA256 }),
      method: 'POST',
      path: '/v1/payload/',
      form: { sha256_hash: SHA256 },
    },
    {
      name: 'lookupTag',
      call: (c) => c.lookupTag({ tag: 'Retefe' }),
      method: 'POST',
      path: '/v1/tag/',
      form: { tag: 'Retefe' },
    },
    {
      name: 'lookupSignature',
      call: (c) => c.lookupSignature({ signature: 'Heodo' }),
      method: 'POST',
      path: '/v1/signature/',
      form: { signature: 'Heodo' },
    },
    {
      name: 'recentUrls',
      call: (c) => c.recentUrls(),
      method: 'GET',
      path: '/v1/urls/recent/',
    },
    {
      name: 'recentUrls with a limit',
      call: (c) => c.recentUrls({ limit: 3 }),
      method: 'GET',
      path: '/v1/urls/recent/limit/3/',
    },
    {
      name: 'recentPayloads',
      call: (c) => c.recentPayloads(),
      method: 'GET',
      path: '/v1/payloads/recent/',
    },
    {
      name: 'recentPayloads with a limit',
      call: (c) => c.recentPayloads({ limit: 1000 }),
      method: 'GET',
      path: '/v1/payloads/recent/limit/1000/',
    },
  ];

  for (const tc of cases) {
    it(`${tc.name}: ${tc.method} ${tc.path}`, async () => {
      const c = client();
      await tc.call(c);
      const url = new URL(c.request!.url);
      asserts.assertEquals(url.origin, 'https://urlhaus-api.abuse.ch');
      asserts.assertEquals(url.pathname, tc.path);
      asserts.assertEquals(url.search, '');
      asserts.assertEquals(c.request!.method, tc.method);
      asserts.assertEquals(c.request!.headers['auth-key'], AUTH_KEY);
      if (tc.form) {
        asserts.assertEquals(
          c.request!.headers['content-type'],
          'application/x-www-form-urlencoded',
        );
        asserts.assertEquals(c.form(), tc.form);
      } else {
        asserts.assertEquals(c.request!.body, undefined);
      }
    });
  }

  it('keeps the Auth-Key out of the `call` event payload', async () => {
    const c = client();
    const seen: string[] = [];
    c.on('call', (_vendor, request, response) => {
      seen.push(JSON.stringify(request), JSON.stringify(response));
    });
    await c.lookupUrl({ url: 'http://bad.example/' });
    asserts.assertEquals(seen.length, 2);
    for (const payload of seen) {
      asserts.assertEquals(payload.includes(AUTH_KEY), false);
    }
  });
});

describe('URLhaus — results', () => {
  it('lookupUrl: no_results → listed: false', async () => {
    const c = client();
    asserts.assertEquals(await c.lookupUrl({ url: 'http://ok.example/' }), {
      listed: false,
    });
  });

  it('lookupUrl: ok → listed: true with the parsed entry', async () => {
    const c = client();
    c.setResponse(URL_OK);
    const verdict = await c.lookupUrl({ url: URL_OK.url });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.entry.url_status, 'online');
    asserts.assertEquals(verdict.entry.threat, 'malware_download');
    asserts.assertEquals(verdict.entry.tags, ['emotet', 'epoch2', 'heodo']);
    asserts.assertEquals(verdict.entry.last_online, null);
    asserts.assertEquals(verdict.entry.blacklists?.surbl, 'listed');
    asserts.assertEquals(verdict.entry.payloads?.[0]?.response_size, '179664');
    asserts.assertEquals(
      verdict.entry.payloads?.[0]?.virustotal?.result,
      '16 / 58',
    );
  });

  it('lookupUrl: tolerates null tags and a numeric takedown time', async () => {
    const c = client();
    c.setResponse({
      query_status: 'ok',
      url: 'http://x.example/',
      tags: null,
      takedown_time_seconds: 3600,
      payloads: null,
    });
    const verdict = await c.lookupUrl({ url: 'http://x.example/' });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.entry.tags, null);
    asserts.assertEquals(verdict.entry.takedown_time_seconds, '3600');
  });

  it('lookupUrl: a JSON body labelled octet-stream still parses', async () => {
    const c = client();
    c.setResponse(URL_OK, 200, { 'content-type': 'application/octet-stream' });
    asserts.assert((await c.lookupUrl({ url: URL_OK.url })).listed);
  });

  it('lookupHost: ok → listed: true; no_results → listed: false', async () => {
    const c = client();
    c.setResponse(HOST_OK);
    const verdict = await c.lookupHost({ host: 'vektorex.com' });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.entry.url_count, '120');
    asserts.assertEquals(verdict.entry.urls?.[0]?.tags, ['AZORult', 'exe']);
    c.setResponse({ query_status: 'no_results' });
    asserts.assertEquals(await c.lookupHost({ host: 'ok.example' }), {
      listed: false,
    });
  });

  it('lookupPayload / lookupTag / lookupSignature / lookupUrlId: found vs not found', async () => {
    const c = client();
    asserts.assertEquals(await c.lookupPayload({ md5_hash: MD5 }), {
      found: false,
    });
    asserts.assertEquals(await c.lookupTag({ tag: 'x' }), { found: false });
    asserts.assertEquals(await c.lookupSignature({ signature: 'x' }), {
      found: false,
    });
    asserts.assertEquals(await c.lookupUrlId({ id: '1' }), { found: false });

    c.setResponse({
      query_status: 'ok',
      md5_hash: MD5,
      signature: 'Heodo',
      virustotal: null,
      urls: [{ url_id: '105243', url: 'http://x.example/', lastseen: null }],
    });
    const payload = await c.lookupPayload({ md5_hash: MD5 });
    asserts.assert(payload.found);
    asserts.assertEquals(payload.entry.signature, 'Heodo');
    asserts.assertEquals(payload.entry.urls?.[0]?.url_id, '105243');

    c.setResponse({ query_status: 'ok', url_count: '2', urls: [] });
    const tag = await c.lookupTag({ tag: 'Retefe' });
    asserts.assert(tag.found);
    asserts.assertEquals(tag.entry.url_count, '2');

    c.setResponse({ query_status: 'ok', payload_count: '4', urls: [] });
    const signature = await c.lookupSignature({ signature: 'Heodo' });
    asserts.assert(signature.found);
    asserts.assertEquals(signature.entry.payload_count, '4');

    c.setResponse(URL_OK);
    const byId = await c.lookupUrlId({ id: 105821 });
    asserts.assert(byId.found);
    asserts.assertEquals(byId.entry.id, '105821');
  });

  it('recentUrls / recentPayloads: arrays, [] on no_results', async () => {
    const c = client();
    asserts.assertEquals(await c.recentUrls(), []);
    asserts.assertEquals(await c.recentPayloads(), []);
    c.setResponse({
      query_status: 'ok',
      urls: [{ id: '223622', url: 'http://45.61.49.78/r.mips', tags: ['elf'] }],
    });
    const urls = await c.recentUrls({ limit: 1 });
    asserts.assertEquals(urls.length, 1);
    asserts.assertEquals(urls[0]?.tags, ['elf']);
    c.setResponse({
      query_status: 'ok',
      payloads: [{ sha256_hash: SHA256, file_size: '241664' }],
    });
    const payloads = await c.recentPayloads({ limit: 1 });
    asserts.assertEquals(payloads[0]?.file_size, '241664');
  });

  it('rejects an ok body of the wrong shape as RESPONSE_ERROR', async () => {
    const c = client();
    c.setResponse({ query_status: 'ok', tags: 'not-an-array' });
    const err = await asserts.assertRejects(
      () => c.lookupUrl({ url: 'http://x.example/' }),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertEquals(err.transient, false);
  });

  it('rejects a body with no query_status as RESPONSE_ERROR', async () => {
    const c = client();
    c.setResponse('<html>maintenance</html>', 200, {
      'content-type': 'text/html',
    });
    const err = await asserts.assertRejects(
      () => c.lookupUrl({ url: 'http://x.example/' }),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('URLhaus — local validation', () => {
  const cases: Array<[string, (c: MockURLhaus) => Promise<unknown>]> = [
    ['a blank url', (c) => c.lookupUrl({ url: '  ' })],
    ['a non-numeric url id', (c) => c.lookupUrlId({ id: 'abc' })],
    ['a zero url id', (c) => c.lookupUrlId({ id: 0 })],
    ['a blank host', (c) => c.lookupHost({ host: '' })],
    ['a malformed md5', (c) => c.lookupPayload({ md5_hash: 'abc' })],
    ['a malformed sha256', (c) => c.lookupPayload({ sha256_hash: MD5 })],
    [
      'both hashes',
      (c) =>
        c.lookupPayload(
          { md5_hash: MD5, sha256_hash: SHA256 } as unknown as {
            md5_hash: string;
          },
        ),
    ],
    [
      'no hash',
      (c) => c.lookupPayload({} as unknown as { md5_hash: string }),
    ],
    ['a blank tag', (c) => c.lookupTag({ tag: '' })],
    ['a blank signature', (c) => c.lookupSignature({ signature: '' })],
    ['a zero limit', (c) => c.recentUrls({ limit: 0 })],
    ['a limit over 1000', (c) => c.recentPayloads({ limit: 1001 })],
    ['a fractional limit', (c) => c.recentUrls({ limit: 2.5 })],
    ['a sub-second timeout', (c) => c.lookupUrl({ url: 'x', timeout: 0.5 })],
  ];
  for (const [label, call] of cases) {
    it(`rejects ${label} without sending anything`, async () => {
      const c = client();
      const err = await asserts.assertRejects(() => call(c), URLhausError);
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertEquals(c.request, undefined);
    });
  }
});

describe('URLhaus — query_status and HTTP errors', () => {
  const cases: Array<{
    name: string;
    body: unknown;
    status: number;
    headers?: Record<string, string>;
    code: string;
    transient: boolean;
  }> = [
    {
      name: '200 invalid_url',
      body: { query_status: 'invalid_url' },
      status: 200,
      code: 'INVALID_URL',
      transient: false,
    },
    {
      name: '200 invalid_host',
      body: { query_status: 'invalid_host' },
      status: 200,
      code: 'INVALID_HOST',
      transient: false,
    },
    {
      name: '200 invalid_sha256',
      body: { query_status: 'invalid_sha256' },
      status: 200,
      code: 'INVALID_HASH',
      transient: false,
    },
    {
      name: '403 unknown_auth_key (a wrong key, as observed live)',
      body: { query_status: 'unknown_auth_key' },
      status: 403,
      code: 'AUTH_FAILED',
      transient: false,
    },
    {
      name: '401 octet-stream Unauthorized (no key, as observed live)',
      body: '{"error": "Unauthorized"}',
      status: 401,
      headers: { 'content-type': 'application/octet-stream' },
      code: 'AUTH_FAILED',
      transient: false,
    },
    {
      name: '405 http_post_expected',
      body: { query_status: 'http_post_expected' },
      status: 405,
      code: 'INVALID_REQUEST',
      transient: false,
    },
    {
      name: '400 HTML',
      body: '<html>bad request</html>',
      status: 400,
      headers: { 'content-type': 'text/html' },
      code: 'INVALID_REQUEST',
      transient: false,
    },
    {
      name: '429',
      body: '',
      status: 429,
      headers: { 'retry-after': '5' },
      code: 'RATE_LIMITED',
      transient: true,
    },
    {
      name: '502 HTML',
      body: '<html>bad gateway</html>',
      status: 502,
      headers: { 'content-type': 'text/html' },
      code: 'SERVICE_UNAVAILABLE',
      transient: true,
    },
    {
      name: '200 with an undocumented query_status',
      body: { query_status: 'brand_new_status' },
      status: 200,
      code: 'UNKNOWN_ERROR',
      transient: false,
    },
  ];

  for (const tc of cases) {
    it(`maps ${tc.name} → ${tc.code}`, async () => {
      const c = client();
      c.setResponse(tc.body, tc.status, tc.headers);
      const err = await asserts.assertRejects(
        () => c.lookupUrl({ url: 'http://x.example/' }),
        URLhausError,
      );
      asserts.assertEquals(err.code, tc.code);
      asserts.assertEquals(err.transient, tc.transient);
      asserts.assertEquals(err.getContextValue('status'), tc.status);
      asserts.assertEquals(err.message.includes('${'), false);
      asserts.assertEquals(
        (JSON.stringify(err.toJSON()) + err.message).includes(AUTH_KEY),
        false,
      );
    });
  }

  it('carries the retry hint on RATE_LIMITED', async () => {
    const c = client();
    c.setResponse('', 429, { 'retry-after': '5' });
    const err = await asserts.assertRejects(
      () => c.lookupUrl({ url: 'http://x.example/' }),
      URLhausError,
    );
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 5);
  });

  it('records the query_status as vendorStatus', async () => {
    const c = client();
    c.setResponse({ query_status: 'invalid_url' });
    const err = await asserts.assertRejects(
      () => c.lookupUrl({ url: 'nope' }),
      URLhausError,
    );
    asserts.assertEquals(err.getContextValue('vendorStatus'), 'invalid_url');
  });
});

describe('URLhaus — transport failures', () => {
  it('throws a transient TIMEOUT once a fractional per-call deadline passes', async () => {
    const c = client();
    c.hang();
    const started = performance.now();
    const err = await asserts.assertRejects(
      () => c.lookupUrl({ url: 'http://x.example/', timeout: 1.2 }),
      URLhausError,
    );
    const elapsed = performance.now() - started;
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1.2);
    asserts.assert(elapsed >= 1150 && elapsed < 2000, `took ${elapsed}ms`);
  });

  it('applies the client-level timeout when the call sets none', async () => {
    const c = client({ timeout: 1 });
    c.hang();
    const err = await asserts.assertRejects(
      () => c.recentUrls(),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c.failNetwork();
    const err = await asserts.assertRejects(
      () => c.lookupHost({ host: 'x.example' }),
      URLhausError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('keeps the Auth-Key out of transport failures', async () => {
    for (const fail of ['hang', 'failNetwork'] as const) {
      const c = client({ timeout: 1 });
      c[fail]();
      const err = await asserts.assertRejects(
        () => c.lookupUrl({ url: 'http://x.example/' }),
        URLhausError,
      );
      const serialized = JSON.stringify(err.toJSON()) + err.message +
        String(err.stack) + String((err.cause as Error | undefined)?.message);
      asserts.assertEquals(serialized.includes(AUTH_KEY), false, fail);
    }
  });
});

const env = envArgs();
const credentials = { authKey: env.get('CONNECTOR_URLHAUS_AUTH_KEY') };
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'URLhaus — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new URLhaus({
        auth: { type: 'CUSTOM', authKey: credentials.authKey! },
        timeout: 10,
      });

    it('reports a URL URLhaus has never seen as not listed', async () => {
      const verdict = await live().lookupUrl({
        url: 'https://www.example.com/tundra-connect-live-test',
      });
      asserts.assertEquals(verdict.listed, false);
    });

    it('finds a URL from the recent feed when looked up', async () => {
      const client = live();
      const [recent] = await client.recentUrls({ limit: 1 });
      asserts.assertExists(recent?.url);
      const verdict = await client.lookupUrl({ url: recent.url });
      asserts.assert(verdict.listed);
      asserts.assertEquals(verdict.entry.url, recent.url);
    });
  },
});
