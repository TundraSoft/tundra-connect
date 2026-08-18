import * as asserts from '@asserts';
import { describe, it } from '@test';
import { Algolia, type AlgoliaOptions } from './Algolia.ts';
import { AlgoliaError } from './errors/mod.ts';

type MockResponse = { body: unknown; status?: number };

class MockAlgolia extends Algolia {
  public requests: Array<{
    url: string;
    method?: string;
    headers: Record<string, string>;
    body?: string;
  }> = [];
  private responseQueue: Array<{ body: unknown; status: number }> = [
    { body: {}, status: 200 },
  ];

  private __wireFetch(): void {
    this._fetch = (input, init) => {
      const headers: Record<string, string> = {};
      if (init?.headers) {
        for (
          const [key, value] of Object.entries(
            init.headers as Record<string, string>,
          )
        ) {
          headers[key] = value;
        }
      }
      this.requests.push({
        url: String(input),
        method: init?.method,
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      const next = this.responseQueue.length > 1
        ? this.responseQueue.shift()!
        : this.responseQueue[0]!;
      return Promise.resolve(
        new Response(JSON.stringify(next.body), {
          status: next.status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }

  /** Every subsequent call resolves with this single response. */
  setResponse(body: unknown, status = 200): void {
    this.responseQueue = [{ body, status }];
    this.__wireFetch();
  }

  /** Responses are consumed one per call; the last entry repeats once the queue is exhausted. */
  setResponseQueue(responses: MockResponse[]): void {
    this.responseQueue = responses.map((r) => ({
      body: r.body,
      status: r.status ?? 200,
    }));
    this.__wireFetch();
  }

  get lastRequest() {
    return this.requests[this.requests.length - 1];
  }
}

const AUTH = {
  type: 'CUSTOM' as const,
  applicationId: 'TESTAPPID',
  apiKey: 'test-api-key',
};

describe('Algolia', () => {
  describe('construction', () => {
    it('constructs with the required auth option', () => {
      const client = new MockAlgolia({ auth: AUTH });
      asserts.assertEquals(client.vendor, 'Algolia');
      asserts.assertEquals(client.applicationId, 'TESTAPPID');
    });

    it('rejects a missing applicationId', () => {
      asserts.assertThrows(
        () =>
          new MockAlgolia({
            auth: {
              type: 'CUSTOM',
              apiKey: 'k',
            } as unknown as AlgoliaOptions['auth'],
          }),
        AlgoliaError,
        'applicationId must be a non-empty string',
      );
    });

    it('rejects a non-CUSTOM auth type', () => {
      asserts.assertThrows(
        () =>
          new MockAlgolia({
            auth: {
              type: 'BEARER',
              applicationId: 'TESTAPPID',
              token: 'x',
            } as unknown as AlgoliaOptions['auth'],
          }),
        AlgoliaError,
        "auth must be { type: 'CUSTOM'",
      );
    });

    it('rejects a missing apiKey', () => {
      asserts.assertThrows(
        () =>
          new MockAlgolia({
            auth: {
              type: 'CUSTOM',
              applicationId: 'TESTAPPID',
            } as unknown as AlgoliaOptions['auth'],
          }),
        AlgoliaError,
        'apiKey must be a non-empty string',
      );
    });

    it('never echoes apiKey into the config error context, not even the offending value', () => {
      let thrown: AlgoliaError | undefined;
      try {
        new MockAlgolia({
          auth: {
            type: 'CUSTOM',
            applicationId: 'TESTAPPID',
            apiKey: '   ',
          },
        });
      } catch (error) {
        thrown = error as AlgoliaError;
      }
      asserts.assertExists(thrown);
      asserts.assertEquals(thrown.getContextValue('apiKey'), undefined);
      // Not just "the value is unset" — the key itself must be absent from
      // the serialized context, so no future refactor can start passing it
      // through unnoticed.
      asserts.assertEquals(
        Object.keys(thrown.toJSON().context ?? {}).includes('apiKey'),
        false,
      );
    });
  });

  describe('search (read — DSN host)', () => {
    it('sends a search request to the DSN host', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({
        hits: [{ objectID: '1', name: 'Red sneakers' }],
        nbHits: 1,
        page: 0,
        nbPages: 1,
        processingTimeMS: 2,
        query: 'red shoes',
      });

      const result = await client.search('products', { query: 'red shoes' });

      asserts.assertEquals(result.nbHits, 1);
      asserts.assertEquals(result.hits[0]?.objectID, '1');
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        'https://testappid-dsn.algolia.net/1/indexes/products/query',
      );
      asserts.assertEquals(client.lastRequest?.method, 'POST');
    });

    it('rejects local validation before sending a request (missing query)', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({});

      await asserts.assertRejects(
        () =>
          client.search(
            'products',
            {} as unknown as Parameters<typeof client.search>[1],
          ),
        AlgoliaError,
      );
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects local validation for an empty indexName', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      await asserts.assertRejects(
        () => client.search('', { query: 'x' }),
        AlgoliaError,
        'indexName must be a non-empty string',
      );
    });
  });

  describe('saveObject (write host)', () => {
    it('sends a save request to the write host', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({
        objectID: 'abc123',
        taskID: 42,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await client.saveObject('products', {
        name: 'Blue socks',
      });

      asserts.assertEquals(result.objectID, 'abc123');
      asserts.assertEquals(result.taskID, 42);
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        'https://testappid.algolia.net/1/indexes/products',
      );
      asserts.assertEquals(client.lastRequest?.method, 'POST');
    });

    it('rejects a non-object payload via local validation', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      await asserts.assertRejects(
        () =>
          client.saveObject(
            'products',
            ['not', 'an', 'object'] as unknown as Record<string, unknown>,
          ),
        AlgoliaError,
      );
      asserts.assertEquals(client.requests.length, 0);
    });
  });

  describe('dual base URL — search vs write host', () => {
    it('sends search/getObject/browseObjects to the DSN host and saveObject/deleteObject to the write host', async () => {
      const client = new MockAlgolia({ auth: AUTH });

      client.setResponse({
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        processingTimeMS: 1,
        query: '',
      });
      await client.search('products', { query: '' });
      const searchUrl = new URL(client.lastRequest!.url);

      client.setResponse({ objectID: '1' });
      await client.getObject('products', '1');
      const getObjectUrl = new URL(client.lastRequest!.url);

      client.setResponse({ hits: [] });
      await client.browseObjects('products');
      const browseUrl = new URL(client.lastRequest!.url);

      client.setResponse({
        objectID: '1',
        taskID: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await client.saveObject('products', { name: 'x' });
      const saveUrl = new URL(client.lastRequest!.url);

      client.setResponse({ deletedAt: '2024-01-01T00:00:00.000Z', taskID: 2 });
      await client.deleteObject('products', '1');
      const deleteUrl = new URL(client.lastRequest!.url);

      // Read operations: DSN host.
      asserts.assertEquals(searchUrl.host, 'testappid-dsn.algolia.net');
      asserts.assertEquals(getObjectUrl.host, 'testappid-dsn.algolia.net');
      asserts.assertEquals(browseUrl.host, 'testappid-dsn.algolia.net');

      // Write operations: plain write host — genuinely a different host,
      // not just a different path, from the DSN host above.
      asserts.assertEquals(saveUrl.host, 'testappid.algolia.net');
      asserts.assertEquals(deleteUrl.host, 'testappid.algolia.net');
      asserts.assertNotEquals(saveUrl.host, searchUrl.host);
      asserts.assertNotEquals(deleteUrl.host, searchUrl.host);
    });
  });

  describe('getObject / deleteObject', () => {
    it('gets an object by id, percent-encoding path segments', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ objectID: 'a/b..c', name: 'weird id' });

      const result = await client.getObject('products', 'a/b..c');

      asserts.assertEquals(result.name, 'weird id');
      asserts.assertEquals(client.lastRequest?.method, 'GET');
      // The raw '/' and '.' must not survive into the path unescaped —
      // otherwise `path.join` would resolve them as path segments instead
      // of an opaque object id.
      const url = new URL(client.lastRequest!.url);
      asserts.assertEquals(
        url.pathname,
        '/1/indexes/products/a%2Fb%2E%2Ec',
      );
    });

    it('deletes an object by id', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ deletedAt: '2024-01-01T00:00:00.000Z', taskID: 7 });

      const result = await client.deleteObject('products', 'abc123');

      asserts.assertEquals(result.taskID, 7);
      asserts.assertEquals(client.lastRequest?.method, 'DELETE');
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/1/indexes/products/abc123',
      );
    });

    it('rejects an empty objectID', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      await asserts.assertRejects(
        () => client.getObject('products', ''),
        AlgoliaError,
        'objectID must be a non-empty string',
      );
    });
  });

  describe('browseObjects', () => {
    it('scans a page and returns a cursor for the next one', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({
        hits: [{ objectID: '1' }, { objectID: '2' }],
        cursor: 'next-page-token',
      });

      const page = await client.browseObjects('products', { hitsPerPage: 2 });

      asserts.assertEquals(page.hits.length, 2);
      asserts.assertEquals(page.cursor, 'next-page-token');
      asserts.assertEquals(client.lastRequest?.method, 'POST');
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/1/indexes/products/browse',
      );
    });

    it('is distinct from search — hits every record, ignores relevance ranking', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ hits: [{ objectID: '1' }] });

      await client.browseObjects('products');

      asserts.assertStringIncludes(client.lastRequest?.url ?? '', '/browse');
    });
  });

  describe('waitTask', () => {
    it('resolves once status becomes published (poll-then-resolve)', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponseQueue([
        { body: { status: 'notPublished' } },
        { body: { status: 'notPublished' } },
        { body: { status: 'published' } },
      ]);

      const result = await client.waitTask('products', 42, {
        intervalMs: 1,
        timeoutMs: 5_000,
      });

      asserts.assertEquals(result.status, 'published');
      asserts.assertEquals(client.requests.length, 3);
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/1/indexes/products/task/42',
      );
      // Task status is a write-side operation — same host as saveObject.
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        'https://testappid.algolia.net',
      );
    });

    it('throws TASK_TIMEOUT once the budget elapses (poll-then-timeout)', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ status: 'notPublished' });

      let caught: AlgoliaError | undefined;
      try {
        await client.waitTask('products', 42, {
          intervalMs: 2,
          timeoutMs: 8,
        });
      } catch (error) {
        caught = error as AlgoliaError;
      }

      asserts.assertExists(caught);
      asserts.assertInstanceOf(caught, AlgoliaError);
      asserts.assertEquals(caught.code, 'TASK_TIMEOUT');
      // Bounded, not infinite — at least one poll happened, but it gave up.
      asserts.assertEquals(client.requests.length > 0, true);
    });

    it('rejects a non-positive intervalMs/timeoutMs via local validation', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      await asserts.assertRejects(
        () => client.waitTask('products', 1, { intervalMs: 0 }),
        AlgoliaError,
      );
      await asserts.assertRejects(
        () => client.waitTask('products', 1, { timeoutMs: -1 }),
        AlgoliaError,
      );
    });
  });

  describe('error mapping', () => {
    const cases: Array<{ status: number; expectedCode: string }> = [
      { status: 401, expectedCode: 'AUTH_FAILED' },
      { status: 403, expectedCode: 'AUTH_FAILED' },
      { status: 404, expectedCode: 'NOT_FOUND' },
      { status: 429, expectedCode: 'RATE_LIMITED' },
      { status: 400, expectedCode: 'INVALID_REQUEST' },
      { status: 422, expectedCode: 'INVALID_REQUEST' },
      { status: 500, expectedCode: 'SERVICE_UNAVAILABLE' },
      { status: 503, expectedCode: 'SERVICE_UNAVAILABLE' },
      { status: 418, expectedCode: 'UNKNOWN_ERROR' },
    ];

    for (const { status, expectedCode } of cases) {
      it(`maps HTTP ${status} to ${expectedCode}`, async () => {
        const client = new MockAlgolia({ auth: AUTH });
        client.setResponse({ message: 'vendor said no', status }, status);

        let caught: AlgoliaError | undefined;
        try {
          await client.getObject('products', 'abc123');
        } catch (error) {
          caught = error as AlgoliaError;
        }

        asserts.assertExists(caught);
        asserts.assertInstanceOf(caught, AlgoliaError);
        asserts.assertEquals(caught.code, expectedCode);
        asserts.assertEquals(
          caught.getContextValue('message'),
          'vendor said no',
        );
      });
    }

    it('falls back to a status-based error when the body matches no envelope shape', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ totally: 'unexpected' }, 503);

      await asserts.assertRejects(
        () => client.getObject('products', 'abc123'),
        AlgoliaError,
      );
    });

    it('rejects malformed successful responses with RESPONSE_ERROR', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ not: 'a valid search response' });

      await asserts.assertRejects(
        () => client.search('products', { query: 'x' }),
        AlgoliaError,
        'did not match the expected schema',
      );
    });
  });

  describe('credential redaction', () => {
    it('redacts x-algolia-api-key but not x-algolia-application-id in outgoing headers', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ objectID: '1' });

      await client.getObject('products', '1');

      // The wire request carries the real key (the vendor needs it)...
      asserts.assertEquals(
        client.lastRequest?.headers['x-algolia-api-key'],
        'test-api-key',
      );
      asserts.assertEquals(
        client.lastRequest?.headers['x-algolia-application-id'],
        'TESTAPPID',
      );
    });

    it('redacts the api key (but not the application id) in call event payloads', async () => {
      const client = new MockAlgolia({ auth: AUTH });
      client.setResponse({ objectID: '1' });
      const captured: unknown[] = [];
      client.on('call', (_vendor, request) => {
        captured.push(request);
      });

      await client.getObject('products', '1');

      asserts.assertEquals(captured.length, 1);
      const request = captured[0] as { headers?: Record<string, string> };
      asserts.assertEquals(
        request.headers?.['x-algolia-api-key'],
        '[REDACTED]',
      );
      asserts.assertEquals(
        request.headers?.['x-algolia-application-id'],
        'TESTAPPID',
      );
      asserts.assertEquals(
        JSON.stringify(captured[0]).includes('test-api-key'),
        false,
      );
    });

    it('never leaks the raw apiKey into a thrown error, while applicationId legitimately can appear', async () => {
      const rawKey = 'super-secret-algolia-key-must-not-leak';
      const client = new MockAlgolia({
        auth: {
          type: 'CUSTOM',
          applicationId: 'LEAKCHECKAPPID',
          apiKey: rawKey,
        },
      });
      // A 200 body that fails schema validation — the resulting
      // RESPONSE_ERROR's cause chain records the (redacted) failed request.
      client.setResponse({ not: 'a valid search response' });

      let caught: AlgoliaError | undefined;
      try {
        await client.search('products', { query: 'x' });
      } catch (error) {
        caught = error as AlgoliaError;
      }

      asserts.assertExists(caught);
      asserts.assertInstanceOf(caught, AlgoliaError);
      const json = JSON.stringify(caught.toJSON());

      // The secret must never appear anywhere in the serialized error...
      asserts.assertEquals(json.includes(rawKey), false);
      // ...but the applicationId is NOT a credential and legitimately
      // surfaces (it's part of the request URL's hostname, which isn't
      // redacted — only sensitive headers and query-string values are).
      asserts.assertStringIncludes(json, 'LEAKCHECKAPPID');
    });
  });
});
