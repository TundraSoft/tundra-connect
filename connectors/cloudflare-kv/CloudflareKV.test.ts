import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  CloudflareKV,
  type CloudflareKVOptions,
  MAX_BULK_WRITE_KEYS,
  MAX_KEY_BYTES,
  MAX_METADATA_BYTES,
  MAX_VALUE_BYTES,
} from './CloudflareKV.ts';
import { CloudflareKVError, CloudflareKVRateLimitError } from './errors/mod.ts';

const ACCOUNT = '023e105f4ecef8ad9ca31a8372d0c353';
const NAMESPACE = '0f2ac74b498b48028cb68387c421e279';
const TOKEN = 'cf-token-secret';
const AUTH = { type: 'BEARER' as const, token: TOKEN };
const BASE = `/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces`;
const NS = `${BASE}/${NAMESPACE}`;

/** Envelope Cloudflare wraps every client/v4 JSON response in. */
function envelope(result: unknown, result_info?: unknown) {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    ...(result_info ? { result_info } : {}),
  };
}

function errorEnvelope(code: number, message: string) {
  return {
    success: false,
    errors: [{ code, message }],
    messages: [],
    result: null,
  };
}

type Reply = {
  /** JSON-serialised unless it is a string or bytes. */
  body?: unknown;
  status?: number;
  headers?: Record<string, string>;
  /** Make `fetch` itself reject with this. */
  throws?: Error;
  /** Never answer; reject when the request's signal aborts. */
  hang?: boolean;
};

type Captured = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

/** A client whose `fetch` answers from a queue and records every request. */
class MockKV extends CloudflareKV {
  public requests: Captured[] = [];
  public replies: Reply[] = [];
  public slept: number[] = [];

  constructor(options: ConstructorParameters<typeof CloudflareKV>[0]) {
    super(options);
    this._fetch = (input, init) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init?.headers ?? {})) {
        headers[k.toLowerCase()] = String(v);
      }
      this.requests.push({
        url: new URL(String(input)),
        method: init?.method ?? 'GET',
        headers,
        body: init?.body,
      });
      const reply = this.replies.shift() ?? { body: envelope({}) };
      if (reply.throws) return Promise.reject(reply.throws);
      if (reply.hang) {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal!.reason),
          );
        });
      }
      const body = reply.body === undefined
        ? null
        : typeof reply.body === 'string' || reply.body instanceof Uint8Array
        ? reply.body
        : JSON.stringify(reply.body);
      return Promise.resolve(
        new Response(body as BodyInit | null, {
          status: reply.status ?? 200,
          headers: reply.headers ??
            (typeof reply.body === 'string' || reply.body instanceof Uint8Array
              ? { 'content-type': 'application/octet-stream' }
              : { 'content-type': 'application/json' }),
        }),
      );
    };
  }

  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  protected override _sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    return Promise.resolve();
  }

  last(): Captured {
    return this.requests[this.requests.length - 1]!;
  }

  json(index = this.requests.length - 1): unknown {
    return JSON.parse(String(this.requests[index]!.body));
  }
}

function client(extra: Partial<CloudflareKVOptions> = {}): MockKV {
  return new MockKV({
    auth: AUTH,
    accountId: ACCOUNT,
    namespaceId: NAMESPACE,
    ...extra,
  });
}

/** Asserts `fn` rejects with a CloudflareKVError of `code`, and returns it. */
async function rejects(
  fn: () => Promise<unknown>,
  code: string,
): Promise<CloudflareKVError> {
  const err = await asserts.assertRejects(fn, CloudflareKVError);
  asserts.assertEquals(err.code, code, err.message);
  return err;
}

describe('CloudflareKV — configuration', () => {
  it('exposes the vendor name, account and namespace', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'CloudflareKV');
    asserts.assertEquals(c.accountId, ACCOUNT);
    asserts.assertEquals(c.namespaceId, NAMESPACE);
  });

  it('works without a default namespace and trims padded ids', () => {
    const c = new MockKV({ auth: AUTH, accountId: `  ${ACCOUNT} ` });
    asserts.assertEquals(c.accountId, ACCOUNT);
    asserts.assertEquals(c.namespaceId, undefined);
    asserts.assertEquals(
      client({ namespaceId: ` ${NAMESPACE}` }).namespaceId,
      NAMESPACE,
    );
  });

  it('rejects a missing, blank or malformed account id', () => {
    for (const accountId of [undefined, '', '  ', 'a/b', 'a'.repeat(33)]) {
      const err = asserts.assertThrows(
        () =>
          new MockKV(
            { auth: AUTH, accountId } as unknown as CloudflareKVOptions,
          ),
        CloudflareKVError,
      );
      asserts.assertEquals(
        err.code,
        'CONFIG_INVALID_ACCOUNT_ID',
        String(accountId),
      );
    }
  });

  it('rejects a blank or malformed namespace id', () => {
    for (const namespaceId of ['', 'ns/1', 'x'.repeat(33)]) {
      const err = asserts.assertThrows(
        () => client({ namespaceId }),
        CloudflareKVError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_NAMESPACE_ID');
    }
  });

  it('rejects missing or incomplete credentials', () => {
    const cases = [
      undefined,
      { type: 'BASIC', username: 'u', password: 'p' },
      { type: 'BEARER', token: '  ' },
      { type: 'CUSTOM', email: 'a@b.c' },
      { type: 'CUSTOM', key: 'k' },
    ];
    for (const auth of cases) {
      const err = asserts.assertThrows(
        () =>
          new MockKV(
            { auth, accountId: ACCOUNT } as unknown as CloudflareKVOptions,
          ),
        CloudflareKVError,
      );
      asserts.assertEquals(
        err.code,
        'CONFIG_INVALID_AUTH',
        JSON.stringify(auth),
      );
    }
  });

  it('rejects an invalid retry policy and RESTler’s own retry knobs', () => {
    const cases: Partial<CloudflareKVOptions>[] = [
      { retry: { retries: -1 } },
      { retry: { retries: 11 } },
      { retry: { retries: 1.5 } },
      { retry: { baseDelayMs: -5 } },
      { retry: { baseDelayMs: 1000, maxDelayMs: 10 } },
      { retry: { maxRetryAfterSeconds: Number.NaN } },
      { retry: 'yes' as never },
      { maxRetryWait: 5 },
      { defaultRetryWait: 5 },
    ];
    for (const extra of cases) {
      const err = asserts.assertThrows(() => client(extra), CloudflareKVError);
      asserts.assertEquals(
        err.code,
        'CONFIG_INVALID_RETRY',
        JSON.stringify(extra),
      );
    }
  });

  it('sends the API token as a Bearer header', async () => {
    const c = client().reply({ body: envelope([]) });
    await c.listNamespaces();
    asserts.assertEquals(c.last().headers['authorization'], `Bearer ${TOKEN}`);
    asserts.assertEquals(c.last().headers['x-auth-key'], undefined);
  });

  it('sends the legacy email + Global API Key pair, and redacts it', async () => {
    const c = client({
      auth: {
        type: 'CUSTOM',
        email: 'ops@example.com',
        key: 'global-key-secret',
      },
    });
    const events: string[] = [];
    c.on('call', (_vendor, request) => events.push(JSON.stringify(request)));
    c.reply({ body: envelope([]) });
    await c.listNamespaces();
    asserts.assertEquals(c.last().headers['x-auth-email'], 'ops@example.com');
    asserts.assertEquals(c.last().headers['x-auth-key'], 'global-key-secret');
    asserts.assertEquals(c.last().headers['authorization'], undefined);
    asserts.assertEquals(events.length, 1);
    asserts.assertEquals(events[0]!.includes('global-key-secret'), false);
    asserts.assertEquals(events[0]!.includes('ops@example.com'), false);
  });
});

describe('CloudflareKV — namespaces', () => {
  it('lists namespaces with paging and ordering, keeping result_info', async () => {
    const c = client().reply({
      body: envelope([{ id: NAMESPACE, title: 'redirects' }], {
        page: 2,
        per_page: 50,
        count: 1,
        total_count: 51,
      }),
    });
    const page = await c.listNamespaces({
      page: 2,
      per_page: 50,
      order: 'title',
      direction: 'desc',
    });
    asserts.assertEquals(c.last().method, 'GET');
    asserts.assertEquals(c.last().url.pathname, BASE);
    asserts.assertEquals(Object.fromEntries(c.last().url.searchParams), {
      page: '2',
      per_page: '50',
      order: 'title',
      direction: 'desc',
    });
    asserts.assertEquals(page.result[0]?.title, 'redirects');
    asserts.assertEquals(page.result_info?.total_count, 51);
  });

  it('rejects an invalid listing query before sending', async () => {
    const c = client();
    const err = await rejects(
      () => c.listNamespaces({ per_page: 0 }),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      'per_page',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('iterates every namespace across pages', async () => {
    const ns = (i: number) => ({ id: `n${i}`, title: `t${i}` });
    const c = client().reply(
      {
        body: envelope([ns(1), ns(2)], {
          page: 1,
          per_page: 2,
          count: 2,
          total_count: 3,
        }),
      },
      {
        body: envelope([ns(3)], {
          page: 2,
          per_page: 2,
          count: 1,
          total_count: 3,
        }),
      },
    );
    const titles: string[] = [];
    for await (const n of c.iterateNamespaces({ per_page: 2 })) {
      titles.push(n.title);
    }
    asserts.assertEquals(titles, ['t1', 't2', 't3']);
    asserts.assertEquals(
      c.requests.map((r) => r.url.searchParams.get('page')),
      ['1', '2'],
    );
  });

  it('stops iterating on an empty page', async () => {
    const c = client().reply({ body: envelope([]) });
    const all = [];
    for await (const n of c.iterateNamespaces()) all.push(n);
    asserts.assertEquals(all, []);
    asserts.assertEquals(c.requests.length, 1);
  });

  it('creates a namespace', async () => {
    const c = client().reply({
      body: envelope({ id: 'new', title: 'staging' }),
    });
    const ns = await c.createNamespace(' staging ');
    asserts.assertEquals(c.last().method, 'POST');
    asserts.assertEquals(c.last().url.pathname, BASE);
    asserts.assertEquals(c.json(), { title: 'staging' });
    asserts.assertEquals(c.last().headers['content-type'], 'application/json');
    asserts.assertEquals(ns.id, 'new');
  });

  it('rejects a blank or over-long title before sending', async () => {
    const c = client();
    await rejects(() => c.createNamespace('  '), 'REQUEST_VALIDATION_ERROR');
    await rejects(
      () => c.renameNamespace('x'.repeat(513)),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('does not retry a namespace create after a 5xx, but does after a 429', async () => {
    const c = client().reply({
      status: 503,
      body: errorEnvelope(10001, 'busy'),
    });
    await rejects(() => c.createNamespace('staging'), 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(c.requests.length, 1);

    const d = client().reply(
      {
        status: 429,
        headers: { 'retry-after': '1' },
        body: errorEnvelope(971, 'slow down'),
      },
      { body: envelope({ id: 'new', title: 'staging' }) },
    );
    asserts.assertEquals((await d.createNamespace('staging')).id, 'new');
    asserts.assertEquals(d.requests.length, 2);
    asserts.assertEquals(d.slept, [1000]);
  });

  it('gets, renames and deletes the default or a named namespace', async () => {
    const c = client().reply(
      { body: envelope({ id: NAMESPACE, title: 'redirects' }) },
      { body: envelope(null) },
      { body: envelope(null) },
    );
    asserts.assertEquals((await c.getNamespace()).title, 'redirects');
    asserts.assertEquals(c.last().method, 'GET');
    asserts.assertEquals(c.last().url.pathname, NS);

    await c.renameNamespace('redirects-v2', { namespaceId: 'other' });
    asserts.assertEquals(c.last().method, 'PUT');
    asserts.assertEquals(c.last().url.pathname, `${BASE}/other`);
    asserts.assertEquals(c.json(), { title: 'redirects-v2' });

    await c.deleteNamespace();
    asserts.assertEquals(c.last().method, 'DELETE');
    asserts.assertEquals(c.last().url.pathname, NS);
  });

  it('requires a namespace id from somewhere', async () => {
    const c = new MockKV({ auth: AUTH, accountId: ACCOUNT });
    const err = await rejects(
      () => c.getNamespace(),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      'namespaceId',
    );
    await rejects(
      () => c.get('k', { namespaceId: 'bad/id' }),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertEquals(c.requests.length, 0);
  });
});

describe('CloudflareKV — keys', () => {
  it('lists one page of keys with prefix, limit and cursor', async () => {
    const c = client().reply({
      body: envelope(
        [{ name: 'r:a', expiration: 1893456000, metadata: { owner: 'a' } }],
        { count: 1, cursor: 'next-page' },
      ),
    });
    const page = await c.listKeys({ prefix: 'r:', limit: 10, cursor: 'abc' });
    asserts.assertEquals(c.last().url.pathname, `${NS}/keys`);
    asserts.assertEquals(Object.fromEntries(c.last().url.searchParams), {
      prefix: 'r:',
      limit: '10',
      cursor: 'abc',
    });
    asserts.assertEquals(page.result[0], {
      name: 'r:a',
      expiration: 1893456000,
      metadata: { owner: 'a' },
    });
    asserts.assertEquals(page.result_info?.cursor, 'next-page');
  });

  it('rejects a limit outside 10–1000 before sending', async () => {
    const c = client();
    await rejects(() => c.listKeys({ limit: 5 }), 'REQUEST_VALIDATION_ERROR');
    await rejects(
      () => c.listKeys({ limit: 1001 }),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('iterates every key, following the cursor until it is empty', async () => {
    const c = client().reply(
      {
        body: envelope([{ name: 'a' }, { name: 'b' }], {
          count: 2,
          cursor: 'c1',
        }),
      },
      { body: envelope([{ name: 'c' }], { count: 1, cursor: 'c2' }) },
      { body: envelope([], { count: 0, cursor: '' }) },
    );
    const names: string[] = [];
    for await (const key of c.iterateKeys({ prefix: 'x' })) {
      names.push(key.name);
    }
    asserts.assertEquals(names, ['a', 'b', 'c']);
    asserts.assertEquals(
      c.requests.map((r) => r.url.searchParams.get('cursor')),
      [null, 'c1', 'c2'],
    );
    asserts.assertEquals(
      c.requests.map((r) => r.url.searchParams.get('prefix')),
      ['x', 'x', 'x'],
    );
  });

  it('refuses to loop on a cursor Cloudflare hands straight back', async () => {
    const c = client().reply(
      { body: envelope([{ name: 'a' }], { cursor: 'same' }) },
      { body: envelope([{ name: 'b' }], { cursor: 'same' }) },
    );
    const names: string[] = [];
    await rejects(async () => {
      for await (const key of c.iterateKeys()) names.push(key.name);
    }, 'RESPONSE_ERROR');
    asserts.assertEquals(names, ['a', 'b']);
  });

  it('reports a malformed listing as RESPONSE_ERROR', async () => {
    const c = client().reply({ body: envelope({ not: 'an array' }) });
    await rejects(() => c.listKeys(), 'RESPONSE_ERROR');
  });
});

describe('CloudflareKV — values', () => {
  it('reads a value as text, percent-encoding the key', async () => {
    const c = client().reply({ body: 'https://acme.example' });
    const key = 'r:a/b c?é%#';
    asserts.assertEquals(await c.get(key), 'https://acme.example');
    asserts.assertEquals(c.last().method, 'GET');
    asserts.assertEquals(
      c.last().url.pathname,
      `${NS}/values/${encodeURIComponent(key)}`,
    );
    asserts.assertEquals(c.last().url.search, '');
  });

  it('keeps a key containing ../ inside the values path', async () => {
    const c = client().reply({ body: 'x' });
    await c.get('../../keys');
    asserts.assertEquals(
      c.last().url.pathname,
      `${NS}/values/..%2F..%2Fkeys`,
    );
  });

  it('returns a stored value verbatim, even one that looks like an envelope', async () => {
    const stored = JSON.stringify(errorEnvelope(10000, 'not really an error'));
    const c = client().reply({
      body: stored,
      headers: { 'content-type': 'application/json' },
    });
    asserts.assertEquals(await c.get('k'), stored);
  });

  it('reads JSON and bytes', async () => {
    const bytes = new Uint8Array([0, 1, 0xfe, 0xff, 0x80]);
    const c = client().reply({ body: '{"target":"x","code":301}' }, {
      body: bytes,
    });
    asserts.assertEquals(
      await c.get<{ target: string; code: number }>('j', { type: 'json' }),
      { target: 'x', code: 301 },
    );
    asserts.assertEquals(await c.get('b', { type: 'bytes' }), bytes);
  });

  it('reads an empty value as an empty string', async () => {
    const c = client().reply({ body: '' });
    asserts.assertEquals(await c.get('empty'), '');
  });

  it('returns null for a missing key', async () => {
    const c = client().reply({
      status: 404,
      body: errorEnvelope(10009, "get: 'key not found'"),
    });
    asserts.assertEquals(await c.get('missing'), null);
    c.reply({
      status: 404,
      body: errorEnvelope(10009, "get: 'key not found'"),
    });
    asserts.assertEquals(await c.get('missing', { type: 'bytes' }), null);
  });

  it('treats an unknown namespace as NOT_FOUND, not as a missing key', async () => {
    const c = client().reply({
      status: 404,
      body: errorEnvelope(10009, 'Unknown namespace.'),
    });
    const err = await rejects(() => c.get('k'), 'NOT_FOUND');
    asserts.assertEquals(err.vendorCode, 10009);
    asserts.assertEquals(err.status, 404);
  });

  it('reports a stored value that is not JSON as RESPONSE_ERROR', async () => {
    const c = client().reply({ body: 'not json' });
    await rejects(() => c.get('k', { type: 'json' }), 'RESPONSE_ERROR');
  });

  it('rejects an unknown read type', async () => {
    const c = client();
    await rejects(
      () => c.get('k', { type: 'stream' } as never),
      'REQUEST_VALIDATION_ERROR',
    );
  });

  it('checks the key before sending', async () => {
    const c = client();
    await rejects(() => c.get(''), 'KEY_INVALID');
    await rejects(() => c.get('.'), 'KEY_INVALID');
    await rejects(() => c.delete('..'), 'KEY_INVALID');
    await rejects(() => c.get(42 as never), 'KEY_INVALID');
    const err = await rejects(
      () => c.put('é'.repeat(MAX_KEY_BYTES / 2) + 'x', 'v'),
      'KEY_TOO_LONG',
    );
    asserts.assertEquals(err.getContextValue('bytes'), MAX_KEY_BYTES + 1);
    asserts.assertEquals(err.getContextValue('limit'), MAX_KEY_BYTES);
    asserts.assertEquals(c.requests.length, 0);
    // Exactly at the limit is fine.
    c.reply({ body: 'ok' });
    asserts.assertEquals(await c.get('é'.repeat(MAX_KEY_BYTES / 2)), 'ok');
  });

  it('reads a key’s metadata, null metadata, and a missing key', async () => {
    const c = client().reply(
      { body: envelope({ owner: 'acme' }) },
      { body: envelope(null) },
      { status: 404, body: errorEnvelope(10009, "metadata: 'key not found'") },
    );
    asserts.assertEquals(await c.getMetadata('r:a'), {
      metadata: { owner: 'acme' },
    });
    asserts.assertEquals(c.last().url.pathname, `${NS}/metadata/r%3Aa`);
    asserts.assertEquals(await c.getMetadata('r:b'), { metadata: null });
    asserts.assertEquals(await c.getMetadata('r:c'), null);
  });

  it('writes text as a raw octet-stream body with an expiration_ttl', async () => {
    const c = client().reply({ body: envelope({}) });
    await c.put('r:a', 'https://acme.example', { expiration_ttl: 3600 });
    const req = c.last();
    asserts.assertEquals(req.method, 'PUT');
    asserts.assertEquals(req.url.pathname, `${NS}/values/r%3Aa`);
    asserts.assertEquals(Object.fromEntries(req.url.searchParams), {
      expiration_ttl: '3600',
    });
    asserts.assertEquals(
      req.headers['content-type'],
      'application/octet-stream',
    );
    asserts.assertInstanceOf(req.body, Blob);
    asserts.assertEquals(
      await (req.body as Blob).text(),
      'https://acme.example',
    );
  });

  it('writes binary as raw bytes with an absolute expiration', async () => {
    const c = client().reply({ body: envelope({}) });
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    await c.put('b', backing.subarray(2, 5), { expiration: 1893456000 });
    asserts.assertEquals(
      c.last().url.searchParams.get('expiration'),
      '1893456000',
    );
    asserts.assertEquals(
      new Uint8Array(await (c.last().body as Blob).arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    );
  });

  it('writes a value with metadata as multipart form data', async () => {
    const c = client().reply({ body: envelope({}) });
    await c.put('r:a', 'https://acme.example', { metadata: { owner: 'acme' } });
    const form = c.last().body;
    asserts.assertInstanceOf(form, FormData);
    asserts.assertEquals(form.get('value'), 'https://acme.example');
    asserts.assertEquals(form.get('metadata'), '{"owner":"acme"}');
    // fetch, not the client, sets multipart/form-data with its boundary.
    asserts.assertEquals(c.last().headers['content-type'], undefined);
    asserts.assertEquals(c.last().url.search, '');
  });

  it('writes binary with metadata as a file part', async () => {
    const c = client().reply({ body: envelope({}) });
    await c.put('img', new Uint8Array([0xff, 0, 0x7f]).buffer, {
      metadata: [],
    });
    const form = c.last().body as FormData;
    const part = form.get('value');
    asserts.assertInstanceOf(part, Blob);
    asserts.assertEquals(
      new Uint8Array(await part.arrayBuffer()),
      new Uint8Array([0xff, 0, 0x7f]),
    );
    asserts.assertEquals(form.get('metadata'), '[]');
  });

  it('writes JSON with putJson', async () => {
    const c = client().reply({ body: envelope({}) });
    await c.putJson('cfg', { target: 'x', code: 301 });
    asserts.assertEquals(
      await (c.last().body as Blob).text(),
      '{"target":"x","code":301}',
    );
    await rejects(
      () => c.putJson('cfg', undefined),
      'REQUEST_VALIDATION_ERROR',
    );
    await rejects(
      () => c.putJson('cfg', { n: 1n }),
      'REQUEST_VALIDATION_ERROR',
    );
  });

  it('checks value, metadata and expiration limits before sending', async () => {
    const c = client();
    const tooBig = await rejects(
      () => c.put('k', new Uint8Array(MAX_VALUE_BYTES + 1)),
      'VALUE_TOO_LARGE',
    );
    asserts.assertEquals(tooBig.getContextValue('bytes'), MAX_VALUE_BYTES + 1);
    await rejects(
      () =>
        c.put('k', 'v', { metadata: { pad: 'x'.repeat(MAX_METADATA_BYTES) } }),
      'METADATA_TOO_LARGE',
    );
    await rejects(
      () => c.put('k', 'v', { metadata: { n: 1n } }),
      'METADATA_INVALID',
    );
    await rejects(
      () => c.put('k', 'v', { metadata: () => 1 }),
      'METADATA_INVALID',
    );
    await rejects(
      () => c.put('k', 'v', { expiration_ttl: 59 }),
      'EXPIRATION_INVALID',
    );
    await rejects(
      () => c.put('k', 'v', { expiration_ttl: 60.5 }),
      'EXPIRATION_INVALID',
    );
    await rejects(
      () => c.put('k', 'v', { expiration: 0 }),
      'EXPIRATION_INVALID',
    );
    await rejects(
      () => c.put('k', 'v', { expiration: 1893456000, expiration_ttl: 60 }),
      'EXPIRATION_INVALID',
    );
    await rejects(() => c.put('k', 42 as never), 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.requests.length, 0);

    // The limits themselves are allowed.
    c.reply({ body: envelope({}) }, { body: envelope({}) });
    await c.put('k', 'v', {
      expiration_ttl: 60,
      metadata: 'x'.repeat(MAX_METADATA_BYTES - 2),
    });
    await c.put('k', new Uint8Array(MAX_VALUE_BYTES));
    asserts.assertEquals(c.requests.length, 2);
  });

  it('deletes a key', async () => {
    const c = client().reply({ body: envelope(null) });
    await c.delete('r:a', { namespaceId: 'other' });
    asserts.assertEquals(c.last().method, 'DELETE');
    asserts.assertEquals(c.last().url.pathname, `${BASE}/other/values/r%3Aa`);
  });
});

describe('CloudflareKV — bulk', () => {
  it('bulk-writes text, binary, metadata and expirations in one request', async () => {
    const c = client().reply({
      body: envelope({ successful_key_count: 4, unsuccessful_keys: [] }),
    });
    const result = await c.bulkPut([
      { key: 'a', value: 'one' },
      { key: 'b', value: new Uint8Array([0xff, 0x00]), metadata: { m: 1 } },
      { key: 'c', value: 'aGk=', base64: true, expiration: 1893456000 },
      { key: 'd', value: 'four', expiration_ttl: 120 },
    ]);
    const req = c.last();
    asserts.assertEquals(req.method, 'PUT');
    asserts.assertEquals(req.url.pathname, `${NS}/bulk`);
    asserts.assertEquals(req.headers['content-type'], 'application/json');
    asserts.assertEquals(c.json(), [
      { key: 'a', value: 'one' },
      { key: 'b', value: '/wA=', base64: true, metadata: { m: 1 } },
      { key: 'c', value: 'aGk=', base64: true, expiration: 1893456000 },
      { key: 'd', value: 'four', expiration_ttl: 120 },
    ]);
    asserts.assertEquals(result, {
      successful_key_count: 4,
      unsuccessful_keys: [],
    });
  });

  it('splits a bulk write above 10,000 pairs and sums the results', async () => {
    const c = client().reply(
      {
        body: envelope({
          successful_key_count: 9_999,
          unsuccessful_keys: ['k7'],
        }),
      },
      { body: envelope({}) },
    );
    const entries = Array.from(
      { length: MAX_BULK_WRITE_KEYS + 1 },
      (_, i) => ({ key: `k${i}`, value: 'v' }),
    );
    const result = await c.bulkPut(entries);
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals((c.json(0) as unknown[]).length, MAX_BULK_WRITE_KEYS);
    asserts.assertEquals(c.json(1), [{
      key: `k${MAX_BULK_WRITE_KEYS}`,
      value: 'v',
    }]);
    // The second answer reported no counts: every pair in it counts as written.
    asserts.assertEquals(result, {
      successful_key_count: 10_000,
      unsuccessful_keys: ['k7'],
    });
  });

  it('splits a bulk write that would exceed 100 MB per request', async () => {
    const c = client();
    const big = 'a'.repeat(25_000_000);
    await c.bulkPut([0, 1, 2, 3].map((i) => ({ key: `big${i}`, value: big })));
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals((c.json(0) as unknown[]).length, 3);
    asserts.assertEquals((c.json(1) as unknown[]).length, 1);
    for (const req of c.requests) {
      asserts.assert(
        new TextEncoder().encode(String(req.body)).byteLength <= 100_000_000,
      );
    }
  });

  it('checks every pair before writing any', async () => {
    const c = client();
    const entries = Array.from(
      { length: 20_000 },
      (_, i) => ({ key: `k${i}`, value: 'v' }),
    );
    entries[15_000] = { key: 'k', value: 'v', expiration_ttl: 1 } as never;
    const err = await rejects(() => c.bulkPut(entries), 'EXPIRATION_INVALID');
    asserts.assertEquals(err.getContextValue('key'), 'k');
    await rejects(() => c.bulkPut([{ key: '..', value: 'v' }]), 'KEY_INVALID');
    await rejects(
      () => c.bulkPut([{ key: 'k', value: 'x'.repeat(MAX_VALUE_BYTES + 1) }]),
      'VALUE_TOO_LARGE',
    );
    await rejects(() => c.bulkPut([null as never]), 'REQUEST_VALIDATION_ERROR');
    await rejects(() => c.bulkPut('nope' as never), 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.requests.length, 0);
  });

  it('sizes a base64 value by its decoded length', async () => {
    const c = client().reply({ body: envelope({}) });
    // 4 base64 chars per 3 bytes: just over the limit once decoded.
    const encoded = 'A'.repeat(Math.ceil((MAX_VALUE_BYTES + 3) / 3) * 4);
    await rejects(
      () => c.bulkPut([{ key: 'k', value: encoded, base64: true }]),
      'VALUE_TOO_LARGE',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('reports how far a split bulk write got when a later request fails', async () => {
    const c = client({ retry: false }).reply(
      {
        body: envelope({ successful_key_count: 10_000, unsuccessful_keys: [] }),
      },
      { status: 400, body: errorEnvelope(10021, 'invalid value') },
    );
    const entries = Array.from(
      { length: 10_005 },
      (_, i) => ({ key: `k${i}`, value: 'v' }),
    );
    const err = await rejects(() => c.bulkPut(entries), 'INVALID_REQUEST');
    asserts.assertEquals(err.getContextValue('bulk'), {
      requestsCompleted: 1,
      requestsTotal: 2,
      keysCompleted: 10_000,
    });
    asserts.assertEquals(err.vendorCode, 10021);
    asserts.assertEquals(err.status, 400);
  });

  it('keeps a rate-limited bulk failure a CloudflareKVRateLimitError', async () => {
    const c = client({ retry: false }).reply({
      status: 429,
      headers: { 'retry-after': '3', 'content-type': 'application/json' },
      body: errorEnvelope(971, 'slow down'),
    });
    const err = await asserts.assertRejects(
      () => c.bulkDelete(['a']),
      CloudflareKVRateLimitError,
    );
    asserts.assertEquals(err.retryAfterSeconds, 3);
    asserts.assertEquals(err.getContextValue('bulk'), {
      requestsCompleted: 0,
      requestsTotal: 1,
      keysCompleted: 0,
    });
  });

  it('bulk-deletes keys, splitting above 10,000', async () => {
    const c = client().reply(
      {
        body: envelope({ successful_key_count: 10_000, unsuccessful_keys: [] }),
      },
      { body: envelope({ successful_key_count: 2, unsuccessful_keys: [] }) },
    );
    const keys = Array.from({ length: 10_002 }, (_, i) => `k${i}`);
    const result = await c.bulkDelete(keys);
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals(c.requests[0]!.method, 'POST');
    asserts.assertEquals(c.requests[0]!.url.pathname, `${NS}/bulk/delete`);
    asserts.assertEquals(
      c.requests[0]!.headers['content-type'],
      'application/json',
    );
    asserts.assertEquals((c.json(0) as string[]).length, 10_000);
    asserts.assertEquals(c.json(1), ['k10000', 'k10001']);
    asserts.assertEquals(result, {
      successful_key_count: 10_002,
      unsuccessful_keys: [],
    });
  });

  it('sends nothing for an empty bulk call', async () => {
    const c = client();
    asserts.assertEquals(await c.bulkDelete([]), {
      successful_key_count: 0,
      unsuccessful_keys: [],
    });
    asserts.assertEquals(await c.bulkPut([]), {
      successful_key_count: 0,
      unsuccessful_keys: [],
    });
    asserts.assertEquals(await c.bulkGet([]), {});
    asserts.assertEquals(c.requests.length, 0);
  });

  it('bulk-reads text values, null for a missing key', async () => {
    const c = client().reply({
      body: envelope({ values: { a: 'one', b: null } }),
    });
    const values = await c.bulkGet(['a', 'b']);
    asserts.assertEquals(c.last().method, 'POST');
    asserts.assertEquals(c.last().url.pathname, `${NS}/bulk/get`);
    asserts.assertEquals(c.json(), {
      keys: ['a', 'b'],
      type: 'text',
      withMetadata: false,
    });
    asserts.assertEquals(values, { a: 'one', b: null });
  });

  it('bulk-reads JSON with metadata', async () => {
    const c = client().reply({
      body: envelope({
        values: {
          a: { value: { n: 1 }, metadata: { m: 1 }, expiration: 1893456000 },
          b: { value: 2 },
          c: null,
        },
      }),
    });
    const values = await c.bulkGet(['a', 'b', 'c'], {
      type: 'json',
      withMetadata: true,
    });
    asserts.assertEquals(c.json(), {
      keys: ['a', 'b', 'c'],
      type: 'json',
      withMetadata: true,
    });
    asserts.assertEquals(values.a, {
      value: { n: 1 },
      metadata: { m: 1 },
      expiration: 1893456000,
    });
    asserts.assertEquals(values.b, { value: 2, metadata: null });
    asserts.assertEquals(values.c, null);
  });

  it('rejects a withMetadata answer without values', async () => {
    const c = client().reply({ body: envelope({ values: { a: 'bare' } }) });
    await rejects(
      () => c.bulkGet(['a'], { withMetadata: true }),
      'RESPONSE_ERROR',
    );
  });

  it('splits a bulk read above 100 keys and merges the answers', async () => {
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}`);
    const first = Object.fromEntries(
      keys.slice(0, 100).map((k) => [k, k.toUpperCase()]),
    );
    const c = client().reply(
      { body: envelope({ values: first }) },
      { body: envelope({ values: { k100: null } }) },
    );
    const values = await c.bulkGet(keys);
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals((c.json(0) as { keys: string[] }).keys.length, 100);
    asserts.assertEquals((c.json(1) as { keys: string[] }).keys, ['k100']);
    asserts.assertEquals(Object.keys(values).length, 101);
    asserts.assertEquals(values.k0, 'K0');
    asserts.assertEquals(values.k100, null);
  });

  it('keeps a key named __proto__ as an ordinary entry', async () => {
    const c = client().reply({
      body:
        '{"success":true,"errors":[],"messages":[],"result":{"values":{"__proto__":"v"}}}',
      headers: { 'content-type': 'application/json' },
    });
    const values = await c.bulkGet(['__proto__']);
    asserts.assertEquals(Object.getPrototypeOf(values), Object.prototype);
    asserts.assertEquals(
      Object.getOwnPropertyDescriptor(values, '__proto__')?.value,
      'v',
    );
  });

  it('checks bulk-read arguments before sending', async () => {
    const c = client();
    await rejects(() => c.bulkGet(['ok', '']), 'KEY_INVALID');
    await rejects(
      () => c.bulkGet(['a'], { type: 'bytes' } as never),
      'REQUEST_VALIDATION_ERROR',
    );
    await rejects(
      () => c.bulkGet(['a'], { withMetadata: 'yes' } as never),
      'REQUEST_VALIDATION_ERROR',
    );
    await rejects(() => c.bulkDelete(['a', '.']), 'KEY_INVALID');
    asserts.assertEquals(c.requests.length, 0);
  });
});

describe('CloudflareKV — errors and retries', () => {
  it('maps failures by vendor code, then by HTTP status', async () => {
    const cases: [Reply, string][] = [
      [
        { status: 401, body: errorEnvelope(10000, 'Authentication error') },
        'AUTH_FAILED',
      ],
      [
        { status: 403, body: errorEnvelope(10000, 'Authentication error') },
        'FORBIDDEN',
      ],
      [
        { status: 400, body: errorEnvelope(9109, 'Invalid access token') },
        'AUTH_FAILED',
      ],
      [
        { status: 404, body: errorEnvelope(7003, 'Could not route') },
        'NOT_FOUND',
      ],
      [
        { status: 400, body: errorEnvelope(10014, 'title exists') },
        'INVALID_REQUEST',
      ],
      [{ status: 409, body: errorEnvelope(10999, 'conflict') }, 'CONFLICT'],
      [{
        status: 200,
        body: {
          success: false,
          errors: [{ code: 10001, message: 'x' }],
          messages: [],
        },
      }, 'UNKNOWN_ERROR'],
      [{
        status: 502,
        body: '<html>bad gateway</html>',
        headers: { 'content-type': 'text/html' },
      }, 'SERVICE_UNAVAILABLE'],
    ];
    for (const [reply, code] of cases) {
      const c = client({ retry: false }).reply(reply);
      const err = await rejects(() => c.listNamespaces(), code);
      asserts.assertEquals(err.status, reply.status);
    }
  });

  it('carries Cloudflare’s code and message in the error', async () => {
    const c = client().reply({
      status: 400,
      body: errorEnvelope(10014, 'title exists'),
    });
    const err = await rejects(
      () => c.createNamespace('dup'),
      'INVALID_REQUEST',
    );
    asserts.assertEquals(err.vendorCode, 10014);
    asserts.assertStringIncludes(err.message, 'title exists (code 10014)');
    asserts.assertEquals(err.transient, false);
    asserts.assertEquals(err.getContextValue('errors'), [{
      code: 10014,
      message: 'title exists',
    }]);
    asserts.assertEquals(JSON.stringify(err.toJSON()).includes(TOKEN), false);
  });

  it('retries a 429, waiting exactly as long as Retry-After asks', async () => {
    const c = client().reply(
      {
        status: 429,
        headers: { 'retry-after': '2', 'content-type': 'application/json' },
        body: errorEnvelope(971, 'slow down'),
      },
      { body: envelope([]) },
    );
    await c.listNamespaces();
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals(c.slept, [2000]);
  });

  it('gives up after the configured retries with a CloudflareKVRateLimitError', async () => {
    const limited: Reply = {
      status: 429,
      headers: { 'retry-after': '1', 'content-type': 'application/json' },
      body: errorEnvelope(971, 'slow down'),
    };
    const c = client({ retry: { retries: 2 } }).reply(
      limited,
      limited,
      limited,
    );
    const err = await asserts.assertRejects(
      () => c.listNamespaces(),
      CloudflareKVRateLimitError,
    );
    asserts.assertEquals(err.retryAfterSeconds, 1);
    asserts.assertEquals(err.status, 429);
    asserts.assertEquals(c.requests.length, 3);
    asserts.assertEquals(c.slept, [1000, 1000]);
  });

  it('does not wait out a Retry-After longer than maxRetryAfterSeconds', async () => {
    const c = client({ retry: { maxRetryAfterSeconds: 10 } }).reply({
      status: 429,
      headers: { 'retry-after': '120', 'content-type': 'application/json' },
      body: errorEnvelope(971, 'slow down'),
    });
    const err = await asserts.assertRejects(
      () => c.listNamespaces(),
      CloudflareKVRateLimitError,
    );
    asserts.assertEquals(err.retryAfterSeconds, 120);
    asserts.assertEquals(c.slept, []);
    asserts.assertEquals(c.requests.length, 1);
  });

  it('retries a 5xx with exponential back-off and jitter', async () => {
    const busy: Reply = { status: 503, body: errorEnvelope(10001, 'busy') };
    const c = client({
      retry: { retries: 3, baseDelayMs: 100, maxDelayMs: 300 },
    })
      .reply(busy, busy, busy, { body: envelope([]) });
    await c.listNamespaces();
    asserts.assertEquals(c.requests.length, 4);
    const [a, b, d] = c.slept as [number, number, number];
    asserts.assert(a >= 50 && a <= 100, `first wait ${a}`);
    asserts.assert(b >= 100 && b <= 200, `second wait ${b}`);
    // Capped at maxDelayMs.
    asserts.assert(d >= 150 && d <= 300, `third wait ${d}`);
  });

  it('retries a raw value read and a network failure', async () => {
    const c = client().reply(
      {
        status: 502,
        body: '<html/>',
        headers: { 'content-type': 'text/html' },
      },
      { throws: new TypeError('connection reset') },
      { body: 'finally' },
    );
    asserts.assertEquals(await c.get('k'), 'finally');
    asserts.assertEquals(c.requests.length, 3);
    asserts.assertEquals(c.slept.length, 2);
  });

  it('surfaces a network failure as NETWORK_ERROR once retries run out', async () => {
    const c = client({ retry: { retries: 1 } }).reply(
      { throws: new TypeError('dns failure') },
      { throws: new TypeError('dns failure') },
    );
    const err = await rejects(() => c.delete('k'), 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(c.requests.length, 2);
  });

  it('never retries with retry: false, on the client or per call', async () => {
    const busy: Reply = { status: 500, body: errorEnvelope(10001, 'busy') };
    const c = client({ retry: false }).reply(busy);
    await rejects(() => c.listNamespaces(), 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(c.requests.length, 1);

    const d = client().reply(busy);
    await rejects(() => d.get('k', { retry: false }), 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(d.requests.length, 1);

    // …and a per-call policy can turn retries back on.
    const e = client({ retry: false }).reply(busy, { body: envelope(null) });
    await e.delete('k', { retry: { retries: 1 } });
    asserts.assertEquals(e.requests.length, 2);
  });

  it('does not retry a definite refusal', async () => {
    const c = client().reply({
      status: 400,
      body: errorEnvelope(10021, 'bad'),
    });
    await rejects(() => c.put('k', 'v'), 'INVALID_REQUEST');
    asserts.assertEquals(c.requests.length, 1);
    asserts.assertEquals(c.slept, []);
  });

  it('applies a per-call timeout and reports TIMEOUT', async () => {
    const c = client({ retry: false }).reply({ hang: true });
    const err = await rejects(() => c.listKeys({ timeout: 1 }), 'TIMEOUT');
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
    asserts.assertEquals(err.transient, true);
  });

  it('rejects an out-of-range per-call timeout before sending', async () => {
    const c = client();
    await rejects(() => c.get('k', { timeout: 0 }), 'REQUEST_VALIDATION_ERROR');
    await rejects(
      () => c.listKeys({ timeout: 121 }),
      'REQUEST_VALIDATION_ERROR',
    );
    await rejects(
      () => c.delete('k', { retry: { retries: 99 } }),
      'CONFIG_INVALID_RETRY',
    );
    asserts.assertEquals(c.requests.length, 0);
  });
});

const env = envArgs();
const credentials = {
  token: env.get('CONNECTOR_CLOUDFLARE_KV_API_TOKEN'),
  accountId: env.get('CONNECTOR_CLOUDFLARE_KV_ACCOUNT_ID'),
  namespaceId: env.get('CONNECTOR_CLOUDFLARE_KV_NAMESPACE_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'CloudflareKV — live',
  // Self-contained: every key it writes sits under a unique
  // `tundra-connect-live-*` prefix and is deleted in a `finally`, so the
  // namespace is left as it was found. It never creates or deletes a
  // namespace.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new CloudflareKV({
        auth: { type: 'BEARER', token: credentials.token! },
        accountId: credentials.accountId!,
        namespaceId: credentials.namespaceId!,
      });

    it('reads the namespace and lists namespaces', async () => {
      const kv = live();
      const ns = await kv.getNamespace();
      asserts.assertEquals(ns.id, credentials.namespaceId);
      const page = await kv.listNamespaces({ per_page: 5 });
      asserts.assert(Array.isArray(page.result));
    });

    it('writes, reads, lists and deletes single values', async () => {
      const kv = live();
      const prefix = `tundra-connect-live-${crypto.randomUUID().slice(0, 8)}:`;
      try {
        await kv.put(`${prefix}text`, 'hello', {
          metadata: { by: 'tundra-connect' },
          expiration_ttl: 300,
        });
        await kv.putJson(`${prefix}json`, { n: 1 }, { expiration_ttl: 300 });
        await kv.put(`${prefix}bytes`, new Uint8Array([0, 255, 128]), {
          expiration_ttl: 300,
        });
        asserts.assertEquals(await kv.get(`${prefix}text`), 'hello');
        asserts.assertEquals(await kv.get(`${prefix}json`, { type: 'json' }), {
          n: 1,
        });
        asserts.assertEquals(
          await kv.get(`${prefix}bytes`, { type: 'bytes' }),
          new Uint8Array([0, 255, 128]),
        );
        asserts.assertEquals(await kv.getMetadata(`${prefix}text`), {
          metadata: { by: 'tundra-connect' },
        });
        asserts.assertEquals(await kv.get(`${prefix}missing`), null);
        asserts.assertEquals(await kv.getMetadata(`${prefix}missing`), null);
      } finally {
        await kv.delete(`${prefix}text`);
        await kv.delete(`${prefix}json`);
        await kv.delete(`${prefix}bytes`);
      }
      asserts.assertEquals(await kv.get(`${prefix}text`), null);
    });

    it('bulk-writes, bulk-reads, iterates and bulk-deletes', async () => {
      const kv = live();
      const prefix = `tundra-connect-live-${crypto.randomUUID().slice(0, 8)}:`;
      const keys = Array.from({ length: 105 }, (_, i) => `${prefix}${i}`);
      try {
        const written = await kv.bulkPut(
          keys.map((key, i) => ({
            key,
            value: `v${i}`,
            metadata: { i },
            expiration_ttl: 300,
          })),
        );
        asserts.assertEquals(written.successful_key_count, 105);
        const values = await kv.bulkGet(keys);
        asserts.assertEquals(values[keys[104]!], 'v104');
        const withMeta = await kv.bulkGet([keys[0]!], { withMetadata: true });
        asserts.assertEquals(withMeta[keys[0]!]?.metadata, { i: 0 });
        const listed: string[] = [];
        for await (const key of kv.iterateKeys({ prefix, limit: 50 })) {
          listed.push(key.name);
        }
        asserts.assertEquals(listed.length, 105);
      } finally {
        const deleted = await kv.bulkDelete(keys);
        asserts.assertEquals(deleted.unsuccessful_keys, []);
      }
    });
  },
});
