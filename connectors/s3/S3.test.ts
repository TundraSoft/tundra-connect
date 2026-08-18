import * as asserts from '@asserts';
import { describe, it } from '@test';
import type { RESTlerEndpoint, RESTlerRequest } from '@restler';
import { S3 } from './S3.ts';
import { S3Error } from './errors/mod.ts';
import { canonicalHeaders, canonicalQueryString, signV4 } from './SigV4.ts';

const CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

type CapturedRequest = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
};

/** Test double: queues canned `Response`s and records every outgoing request, so assertions can inspect exactly what `_authInjector`/`_processEndpoint` produced. */
class MockS3 extends S3 {
  public requests: CapturedRequest[] = [];
  private queue: Array<() => Response> = [];

  enqueue(factory: () => Response): void {
    this.queue.push(factory);
  }

  /** Test-only access to the protected override, to verify it forwards `options` (notably `skipAuth`) to `RESTler._processEndpoint` unchanged. */
  callProcessEndpoint(
    endpoint: RESTlerEndpoint,
    options?: { skipAuth?: boolean },
  ): Promise<RESTlerRequest> {
    return this._processEndpoint(endpoint, options);
  }

  override _fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (init?.headers && typeof init.headers === 'object') {
      for (const [key, value] of Object.entries(init.headers)) {
        headers[key] = String(value);
      }
    }
    this.requests.push({
      url: String(input),
      method: init?.method,
      headers,
      body: init?.body,
    });
    const factory = this.queue.shift();
    if (!factory) {
      throw new Error(
        'MockS3: no response queued for request ' + String(input),
      );
    }
    return factory();
  };
}

/** Recomputes the SigV4 signature from a captured request and asserts it matches the `Authorization` header the client actually sent — an end-to-end cross-check beyond SigV4.test.ts's unit-level vectors. */
async function assertValidSignature(
  request: CapturedRequest,
  method: string,
  credentials: typeof CREDENTIALS = CREDENTIALS,
): Promise<void> {
  const url = new URL(request.url);
  const amzDate = request.headers['x-amz-date'];
  asserts.assertExists(amzDate);
  const payloadHash = request.headers['x-amz-content-sha256'];
  asserts.assertExists(payloadHash);

  // Exclude Authorization itself: it didn't exist yet at the moment
  // _authInjector actually computed the signature (it's the LAST header
  // written, after signing) — including it here would sign a header set
  // that never existed on the wire and never match.
  const { Authorization: _authorization, ...signedHeaders } = request.headers;
  const { authorization: recomputed } = await signV4({
    method,
    canonicalUri: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: signedHeaders,
    payloadHash: payloadHash!,
    date: new Date(
      `${amzDate!.slice(0, 4)}-${amzDate!.slice(4, 6)}-${
        amzDate!.slice(6, 8)
      }T${amzDate!.slice(9, 11)}:${amzDate!.slice(11, 13)}:${
        amzDate!.slice(13, 15)
      }Z`,
    ),
    credentials,
  });

  asserts.assertEquals(request.headers['Authorization'], recomputed);
}

function client(overrides?: Record<string, unknown>): MockS3 {
  return new MockS3(
    {
      auth: { type: 'CUSTOM', ...CREDENTIALS },
      ...overrides,
    } as ConstructorParameters<typeof MockS3>[0],
  );
}

describe('S3 — configuration', () => {
  it('rejects a missing auth option', () => {
    // deno-lint-ignore no-explicit-any
    asserts.assertThrows(
      () => new MockS3({} as any),
      S3Error,
      'S3 auth must be',
    );
  });

  it('rejects auth missing required fields', () => {
    asserts.assertThrows(
      () =>
        new MockS3({
          auth: {
            type: 'CUSTOM',
            accessKeyId: 'AKIA',
            secretAccessKey: '',
            region: 'us-east-1',
          },
        }),
      S3Error,
      'S3 auth must be',
    );
  });

  it('defaults to the standard AWS baseURL and virtual-hosted addressing', () => {
    const c = client();
    asserts.assertEquals(c.region, 'us-east-1');
    asserts.assertEquals(c.forcePathStyle, false);
  });

  it('defaults to path-style addressing once a custom baseURL is supplied', () => {
    const c = client({ baseURL: 'https://minio.example.com' });
    asserts.assertEquals(c.forcePathStyle, true);
  });

  it('honors an explicit forcePathStyle override', () => {
    const c = client({
      baseURL: 'https://minio.example.com',
      forcePathStyle: false,
    });
    asserts.assertEquals(c.forcePathStyle, false);
  });
});

describe('S3 — _processEndpoint forwards options to the base class', () => {
  // Regression coverage: S3's override originally took only `(endpoint)`
  // and called `super._processEndpoint(endpoint)`, silently dropping the
  // base's second `options` parameter — so a caller's `skipAuth: true`
  // would still run `_authInjector`. `_authInjector` is what writes the
  // `Authorization` header, so its absence/presence is a direct, black-box
  // signal that `skipAuth` did (or didn't) reach the base class.
  it('honors skipAuth: true — no Authorization header is signed', async () => {
    const c = client();
    const request = await c.callProcessEndpoint(
      { path: '/hello.txt', method: 'GET' },
      { skipAuth: true },
    );
    asserts.assertEquals(request.headers?.['Authorization'], undefined);
  });

  it('still signs when skipAuth is omitted', async () => {
    const c = client();
    const request = await c.callProcessEndpoint({
      path: '/hello.txt',
      method: 'GET',
    });
    asserts.assertExists(request.headers?.['Authorization']);
    asserts.assertMatch(
      request.headers!['Authorization']!,
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/,
    );
  });
});

describe('S3 — putObject', () => {
  it('signs the request and returns the etag/versionId', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(null, {
        status: 200,
        headers: {
          ETag: '"9a0364b9e99bb480dd25e1f0284c8555"',
          'x-amz-version-id': 'v1',
        },
      })
    );

    const result = await c.putObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
      body: 'Hello!',
      contentType: 'text/plain',
      metadata: { Owner: 'ada' },
    });

    asserts.assertEquals(result.etag, '"9a0364b9e99bb480dd25e1f0284c8555"');
    asserts.assertEquals(result.versionId, 'v1');

    const req = c.requests[0]!;
    asserts.assertEquals(req.method, 'PUT');
    asserts.assertEquals(
      req.url,
      'https://examplebucket.s3.us-east-1.amazonaws.com/hello.txt',
    );
    asserts.assertEquals(req.headers['Content-Type'], 'text/plain');
    asserts.assertEquals(req.headers['x-amz-meta-owner'], 'ada');
    asserts.assertMatch(req.headers['x-amz-date']!, /^\d{8}T\d{6}Z$/);
    asserts.assertMatch(
      req.headers['Authorization']!,
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/,
    );
    await assertValidSignature(req, 'PUT');
  });

  it('keeps a double-spaced metadata value intact on the wire while signing validly', async () => {
    // Regression coverage for AWS's canonicalization contract: the header
    // SENT keeps its original spacing (asserted below); only the canonical
    // form collapses 'two  spaces' -> 'two spaces' (asserted directly in
    // SigV4.test.ts) — and the recomputed signature, which applies the
    // same collapsing to the captured wire headers, must still match.
    const c = client();
    c.enqueue(() =>
      new Response(null, { status: 200, headers: { ETag: '"x"' } })
    );

    await c.putObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
      body: 'x',
      metadata: { note: 'two  spaces' },
    });

    const req = c.requests[0]!;
    asserts.assertEquals(req.headers['x-amz-meta-note'], 'two  spaces');
    await assertValidSignature(req, 'PUT');
  });

  it('rejects a non-Blob/string/binary body', async () => {
    const c = client();
    await asserts.assertRejects(
      () =>
        c.putObject({
          bucket: 'b',
          key: 'k',
          // deno-lint-ignore no-explicit-any
          body: 123 as any,
        }),
      S3Error,
      'must be a Blob',
    );
  });

  it('rejects an empty bucket or key', async () => {
    const c = client();
    await asserts.assertRejects(
      () => c.putObject({ bucket: '', key: 'k', body: 'x' }),
      S3Error,
      'Bucket name must be a non-empty string',
    );
    await asserts.assertRejects(
      () => c.putObject({ bucket: 'b', key: '', body: 'x' }),
      S3Error,
      'Object key must be a non-empty string',
    );
  });

  it('rejects a whitespace-only bucket or key', async () => {
    // Matches AzureBlob's stricter `.trim() === ''` guard: a bucket/key
    // that is non-empty but only whitespace is just as invalid as an
    // empty one.
    const c = client();
    await asserts.assertRejects(
      () => c.putObject({ bucket: '   ', key: 'k', body: 'x' }),
      S3Error,
      'Bucket name must be a non-empty string',
    );
    await asserts.assertRejects(
      () => c.putObject({ bucket: 'b', key: '\t\n ', body: 'x' }),
      S3Error,
      'Object key must be a non-empty string',
    );
  });
});

describe('S3 — bucket/key path-segment validation', () => {
  // Regression coverage for a path-traversal hole: `uriEncode` (like
  // `encodeURIComponent`) leaves a literal `.`/`..` *segment* unchanged
  // (dots aren't URI-reserved), and RESTler's `_processEndpoint` resolves
  // the final URL with `path.join(url.pathname, endpoint.path)` — the same
  // collapsing a filesystem path does. For this connect's default
  // virtual-hosted-style addressing, `url.pathname` starts at `/`, so an
  // unvalidated `key: '..'` would build and SIGN `CanonicalUri: '/..'`,
  // which `path.join('/', '/..')` collapses to `/` when the request is
  // actually sent — the bucket root, not the intended object, and
  // diverging from what was signed.
  const badKeys = ['.', '..', 'foo/../bar', 'foo/./bar', '../'];

  for (const badKey of badKeys) {
    it(`rejects a key of ${JSON.stringify(badKey)} before any request is sent`, async () => {
      const c = client();
      // No response queued for any of these — if a request were sent,
      // MockS3's fetch stub would throw "no queued response", which would
      // also fail the assertion below but with the wrong error type,
      // making it obvious a request slipped out.
      const error = await asserts.assertRejects(
        () => c.deleteObject({ bucket: 'examplebucket', key: badKey }),
        S3Error,
      );
      asserts.assertEquals((error as S3Error).getContextValue('field'), 'key');
      asserts.assertEquals(c.requests.length, 0);
    });
  }

  it('rejects the same bad segments in bucket', async () => {
    const c = client();
    const error = await asserts.assertRejects(
      () => c.deleteObject({ bucket: '..', key: 'a.txt' }),
      S3Error,
    );
    asserts.assertEquals(
      (error as S3Error).getContextValue('field'),
      'bucket',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('rejects a bad key across every public method that builds an object path', async () => {
    const c = client();
    await asserts.assertRejects(
      () => c.putObject({ bucket: 'b', key: '..', body: 'x' }),
      S3Error,
    );
    await asserts.assertRejects(
      () => c.getObject({ bucket: 'b', key: '..' }),
      S3Error,
    );
    await asserts.assertRejects(
      () => c.headObject({ bucket: 'b', key: '..' }),
      S3Error,
    );
    await asserts.assertRejects(
      () => c.deleteObject({ bucket: 'b', key: '..' }),
      S3Error,
    );
    // Not one of these four reached the network.
    asserts.assertEquals(c.requests.length, 0);
  });

  it('rejects a bad bucket on listObjects (bucket-only path)', async () => {
    const c = client();
    await asserts.assertRejects(
      () => c.listObjects({ bucket: '..' }),
      S3Error,
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('still accepts a normal key with legitimate dots in a filename', async () => {
    const c = client();
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({ bucket: 'examplebucket', key: 'photo.v2.jpg' });

    asserts.assertEquals(c.requests.length, 1);
    asserts.assertEquals(
      new URL(c.requests[0]!.url).pathname,
      '/photo.v2.jpg',
    );
  });

  it('still accepts a normal hierarchical key containing slashes', async () => {
    const c = client();
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({
      bucket: 'examplebucket',
      key: 'reports/2024/jan.csv',
    });

    asserts.assertEquals(c.requests.length, 1);
    // The key is percent-encoded as a single opaque segment (see
    // `_target`), so the internal `/` comes out as `%2F`, not a literal
    // path separator.
    asserts.assertEquals(
      new URL(c.requests[0]!.url).pathname,
      '/reports%2F2024%2Fjan.csv',
    );
  });
});

describe('S3 — getObject', () => {
  it('returns the body as a Blob plus header-derived metadata', async () => {
    const c = client();
    c.enqueue(() =>
      new Response('Hello!', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': '6',
          ETag: '"abc"',
          'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
          'x-amz-meta-owner': 'ada',
        },
      })
    );

    const result = await c.getObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
    });

    asserts.assertEquals(await result.body.text(), 'Hello!');
    asserts.assertEquals(result.contentType, 'text/plain');
    asserts.assertEquals(result.contentLength, 6);
    asserts.assertEquals(result.etag, '"abc"');
    asserts.assertEquals(result.lastModified instanceof Date, true);
    asserts.assertEquals(result.metadata, { owner: 'ada' });

    const req = c.requests[0]!;
    asserts.assertEquals(req.method, 'GET');
    await assertValidSignature(req, 'GET');
  });

  it('maps a documented vendor error even though the body is read as a Blob', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Resource>/examplebucket/missing.txt</Resource><RequestId>4442587FB7D0A2F9</RequestId></Error>`,
        { status: 404, headers: { 'Content-Type': 'application/xml' } },
      )
    );

    await asserts.assertRejects(
      () => c.getObject({ bucket: 'examplebucket', key: 'missing.txt' }),
      S3Error,
      'does not exist',
    );
  });
});

describe('S3 — deleteObject', () => {
  it('handles a 204 No Content response', async () => {
    const c = client();
    c.enqueue(() => new Response(null, { status: 204 }));

    const result = await c.deleteObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
    });
    asserts.assertEquals(result.versionId, undefined);
    asserts.assertEquals(result.deleteMarker, undefined);

    const req = c.requests[0]!;
    asserts.assertEquals(req.method, 'DELETE');
    await assertValidSignature(req, 'DELETE');
  });

  it('reports versioning headers when present', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(null, {
        status: 204,
        headers: { 'x-amz-version-id': 'v2', 'x-amz-delete-marker': 'true' },
      })
    );

    const result = await c.deleteObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
    });
    asserts.assertEquals(result.versionId, 'v2');
    asserts.assertEquals(result.deleteMarker, true);
  });
});

describe('S3 — listObjects', () => {
  it('signs, encodes the query string exactly, and parses the XML result', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult><Name>examplebucket</Name><IsTruncated>true</IsTruncated><NextContinuationToken>abc123</NextContinuationToken><Contents><Key>my folder/a.txt</Key><LastModified>2023-01-01T00:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>1234</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      )
    );

    const result = await c.listObjects({
      bucket: 'examplebucket',
      prefix: 'my folder/',
      maxKeys: 10,
    });

    asserts.assertEquals(result.isTruncated, true);
    asserts.assertEquals(result.nextContinuationToken, 'abc123');
    asserts.assertEquals(result.contents.length, 1);
    asserts.assertEquals(result.contents[0]?.key, 'my folder/a.txt');
    asserts.assertEquals(result.contents[0]?.size, 1234);

    const req = c.requests[0]!;
    asserts.assertEquals(req.method, 'GET');
    // The space in `prefix` must be sent as %20 — RESTler's default
    // URLSearchParams-based query building would instead send `+`, which
    // S3 does NOT decode back to a space, corrupting both the filter and
    // the signature.
    asserts.assertStringIncludes(req.url, 'prefix=my%20folder%2F');
    asserts.assertStringIncludes(req.url, 'list-type=2');
    asserts.assertStringIncludes(req.url, 'max-keys=10');
    asserts.assertEquals(req.url.includes('+'), false);
    await assertValidSignature(req, 'GET');
  });

  it('signs a bucket-root request (empty query aside from list-type)', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(
        `<ListBucketResult><Name>examplebucket</Name><IsTruncated>false</IsTruncated></ListBucketResult>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      )
    );

    const result = await c.listObjects({ bucket: 'examplebucket' });
    asserts.assertEquals(result.contents, []);
    asserts.assertEquals(result.isTruncated, false);

    const req = c.requests[0]!;
    asserts.assertEquals(new URL(req.url).pathname, '/');
    await assertValidSignature(req, 'GET');
  });
});

describe('S3 — headObject', () => {
  it('returns metadata with no body field', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': '6',
          ETag: '"abc"',
        },
      })
    );

    const result = await c.headObject({
      bucket: 'examplebucket',
      key: 'hello.txt',
    });
    asserts.assertEquals(result.contentType, 'text/plain');
    asserts.assertEquals(result.contentLength, 6);
    asserts.assertEquals('body' in result, false);
  });

  it('maps a bodiless error response by HTTP status alone', async () => {
    const c = client();
    c.enqueue(() => new Response(null, { status: 404 }));

    const error = await asserts.assertRejects(
      () => c.headObject({ bucket: 'examplebucket', key: 'missing.txt' }),
      S3Error,
    );
    asserts.assertEquals((error as S3Error).getContextValue('status'), 404);
  });
});

describe('S3 — addressing styles', () => {
  it('uses path-style addressing for a custom (R2/MinIO) baseURL', async () => {
    const c = client({
      baseURL: 'https://minio.example.com:9000',
      auth: { type: 'CUSTOM', ...CREDENTIALS, region: 'auto' },
    });
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({ bucket: 'examplebucket', key: 'hello.txt' });
    const req = c.requests[0]!;
    asserts.assertEquals(
      req.url,
      'https://minio.example.com:9000/examplebucket/hello.txt',
    );
    asserts.assertEquals(req.headers['host'], 'minio.example.com:9000');
  });

  it('signs a Host that includes a separately-configured port option', async () => {
    // Regression coverage: RESTler applies the separate `port` option onto
    // the final URL AFTER `_authInjector` has run, so the signed Host used
    // to be 'minio.internal' while the wire request carried
    // 'minio.internal:9000' — a guaranteed 403 on every request.
    const c = client({
      baseURL: 'http://minio.internal',
      port: 9000,
    });
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({ bucket: 'examplebucket', key: 'hello.txt' });
    const req = c.requests[0]!;
    asserts.assertEquals(
      req.url,
      'http://minio.internal:9000/examplebucket/hello.txt',
    );
    asserts.assertEquals(req.headers['host'], 'minio.internal:9000');
    await assertValidSignature(req, 'DELETE');
  });

  it('omits a scheme-default port from the signed Host, matching what fetch sends', async () => {
    // `URL.host` drops a port equal to the scheme default (443 here) —
    // and so does the final request URL, so signed and sent stay equal.
    const c = client({
      baseURL: 'https://minio.internal',
      port: 443,
    });
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({ bucket: 'examplebucket', key: 'hello.txt' });
    const req = c.requests[0]!;
    asserts.assertEquals(
      req.url,
      'https://minio.internal/examplebucket/hello.txt',
    );
    asserts.assertEquals(req.headers['host'], 'minio.internal');
    await assertValidSignature(req, 'DELETE');
  });

  it('percent-encodes every internal slash in a key so path.join never sees a double slash', async () => {
    const c = client();
    c.enqueue(() => new Response(null, { status: 204 }));

    await c.deleteObject({ bucket: 'examplebucket', key: 'a//b.txt' });
    const req = c.requests[0]!;
    // If this were a literal double slash, RESTler's `path.join` would
    // silently collapse it to a single `/`, corrupting the key and
    // diverging from what was signed.
    asserts.assertEquals(new URL(req.url).pathname, '/a%2F%2Fb.txt');
    await assertValidSignature(req, 'DELETE');
  });

  it('signs a key containing reserved characters exactly like the AWS PUT Object vector', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(null, { status: 200, headers: { ETag: '"x"' } })
    );

    await c.putObject({
      bucket: 'examplebucket',
      key: 'test$file.text',
      body: 'x',
    });
    const req = c.requests[0]!;
    asserts.assertEquals(new URL(req.url).pathname, '/test%24file.text');
  });
});

describe('S3 — DigitalOcean Spaces', () => {
  const SPACES_CREDENTIALS = {
    accessKeyId: 'DO00EXAMPLE00ACCESSKEY',
    secretAccessKey: 'exampleSpacesSecretKeyExampleSpacesSecretKey12',
    region: 'nyc3', // the literal Spaces region code, not an AWS region
  };

  function spacesClient(overrides?: Record<string, unknown>): MockS3 {
    return new MockS3(
      {
        baseURL: 'https://nyc3.digitaloceanspaces.com',
        forcePathStyle: false,
        auth: { type: 'CUSTOM', ...SPACES_CREDENTIALS },
        ...overrides,
      } as ConstructorParameters<typeof MockS3>[0],
    );
  }

  it('the bare "custom baseURL implies path-style" heuristic guesses wrong for Spaces unless overridden', () => {
    // Documents *why* `forcePathStyle: false` must be passed explicitly:
    // without it, the same heuristic that correctly defaults R2/MinIO to
    // path-style also (wrongly, for Spaces) defaults to path-style here,
    // since a Spaces baseURL is custom too.
    const c = new MockS3(
      {
        baseURL: 'https://nyc3.digitaloceanspaces.com',
        auth: { type: 'CUSTOM', ...SPACES_CREDENTIALS },
      } as ConstructorParameters<typeof MockS3>[0],
    );
    asserts.assertEquals(c.forcePathStyle, true);
  });

  it('addresses a bucket via virtual-hosted-style subdomain, not a path segment', async () => {
    const c = spacesClient();
    c.enqueue(() =>
      new Response('Hello!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '6' },
      })
    );

    await c.getObject({ bucket: 'my-space', key: 'hello.txt' });
    const req = c.requests[0]!;

    asserts.assertEquals(
      req.url,
      'https://my-space.nyc3.digitaloceanspaces.com/hello.txt',
    );
    asserts.assertEquals(
      req.headers['host'],
      'my-space.nyc3.digitaloceanspaces.com',
    );
    await assertValidSignature(req, 'GET', SPACES_CREDENTIALS);
  });

  it('signs a putObject request with the literal Spaces region in the credential scope', async () => {
    const c = spacesClient();
    c.enqueue(() =>
      new Response(null, {
        status: 200,
        headers: { ETag: '"9a0364b9e99bb480dd25e1f0284c8555"' },
      })
    );

    const result = await c.putObject({
      bucket: 'my-space',
      key: 'reports/q1.json',
      body: '{"total":42}',
      contentType: 'application/json',
    });

    asserts.assertEquals(result.etag, '"9a0364b9e99bb480dd25e1f0284c8555"');

    const req = c.requests[0]!;
    asserts.assertEquals(req.method, 'PUT');
    asserts.assertEquals(
      req.url,
      'https://my-space.nyc3.digitaloceanspaces.com/reports%2Fq1.json',
    );
    asserts.assertMatch(
      req.headers['Authorization']!,
      /^AWS4-HMAC-SHA256 Credential=DO00EXAMPLE00ACCESSKEY\/\d{8}\/nyc3\/s3\/aws4_request/,
    );
    await assertValidSignature(req, 'PUT', SPACES_CREDENTIALS);
  });

  it('signs a listObjects request (bucket-root query) against the region endpoint', async () => {
    const c = spacesClient();
    c.enqueue(() =>
      new Response(
        `<ListBucketResult><Name>my-space</Name><IsTruncated>false</IsTruncated></ListBucketResult>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      )
    );

    const result = await c.listObjects({ bucket: 'my-space', prefix: 'logs/' });
    asserts.assertEquals(result.contents, []);

    const req = c.requests[0]!;
    const url = new URL(req.url);
    asserts.assertEquals(url.host, 'my-space.nyc3.digitaloceanspaces.com');
    asserts.assertEquals(url.pathname, '/');
    asserts.assertStringIncludes(req.url, 'prefix=logs%2F');
    await assertValidSignature(req, 'GET', SPACES_CREDENTIALS);
  });
});

describe('S3 — vendor error mapping', () => {
  const cases: Array<{ code: string; status: number; expected: string }> = [
    { code: 'NoSuchBucket', status: 404, expected: 'does not exist' },
    { code: 'AccessDenied', status: 403, expected: 'Access denied' },
    { code: 'InvalidAccessKeyId', status: 403, expected: 'does not exist' },
    {
      code: 'SignatureDoesNotMatch',
      status: 403,
      expected: 'signature did not match',
    },
    { code: 'SlowDown', status: 503, expected: 'Request rate' },
  ];

  for (const { code, status, expected } of cases) {
    it(`maps vendor code ${code} (status ${status})`, async () => {
      const c = client();
      c.enqueue(() =>
        new Response(
          `<Error><Code>${code}</Code><Message>vendor message</Message></Error>`,
          { status, headers: { 'Content-Type': 'application/xml' } },
        )
      );
      await asserts.assertRejects(
        () => c.deleteObject({ bucket: 'b', key: 'k' }),
        S3Error,
        expected,
      );
    });
  }

  it('falls back to UNKNOWN_ERROR for an undocumented vendor code', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(
        `<Error><Code>SomeNewCode</Code><Message>huh</Message></Error>`,
        {
          status: 400,
          headers: { 'Content-Type': 'application/xml' },
        },
      )
    );
    const error = await asserts.assertRejects(
      () => c.deleteObject({ bucket: 'b', key: 'k' }),
      S3Error,
    );
    asserts.assertEquals(
      (error as S3Error).getContextValue('originalCode'),
      'SomeNewCode',
    );
  });

  it('falls back to SERVICE_UNAVAILABLE for an unmapped status with no parseable body', async () => {
    const c = client();
    // 502 is deliberately absent from STATUS_FALLBACK — this exercises
    // the final catch-all, not one of the explicitly mapped statuses.
    c.enqueue(() => new Response('not xml at all', { status: 502 }));
    await asserts.assertRejects(
      () => c.deleteObject({ bucket: 'b', key: 'k' }),
      S3Error,
      'unavailable',
    );
  });

  it('populates the ${key}/${bucket} placeholders in NO_SUCH_KEY/NO_SUCH_BUCKET messages', async () => {
    // Regression coverage: `__toError` used to be called with no knowledge
    // of the calling method's bucket/key, so `NO_SUCH_KEY`/`NO_SUCH_BUCKET`'s
    // `${key}`/`${bucket}` template placeholders rendered as the literal
    // un-substituted text on every real 404, instead of the actual value.
    const keyClient = client();
    keyClient.enqueue(() =>
      new Response(
        `<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>`,
        { status: 404, headers: { 'Content-Type': 'application/xml' } },
      )
    );
    const keyError = await asserts.assertRejects(
      () =>
        keyClient.deleteObject({
          bucket: 'examplebucket',
          key: 'missing.txt',
        }),
      S3Error,
    );
    asserts.assertStringIncludes(
      keyError.message,
      'The specified key missing.txt does not exist.',
    );
    asserts.assertEquals(
      (keyError as S3Error).getContextValue('key'),
      'missing.txt',
    );

    const bucketClient = client();
    bucketClient.enqueue(() =>
      new Response(
        `<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message></Error>`,
        { status: 404, headers: { 'Content-Type': 'application/xml' } },
      )
    );
    const bucketError = await asserts.assertRejects(
      () =>
        bucketClient.deleteObject({
          bucket: 'missing-bucket',
          key: 'a.txt',
        }),
      S3Error,
    );
    asserts.assertStringIncludes(
      bucketError.message,
      'The specified bucket missing-bucket does not exist.',
    );
    asserts.assertEquals(
      (bucketError as S3Error).getContextValue('bucket'),
      'missing-bucket',
    );
  });

  it('populates ${key}/${bucket} for a bodiless HEAD 404 too (status-fallback path)', async () => {
    // headObject's error mapping goes purely by HTTP status (S3 sends no
    // body on a HEAD error) — a separate code path through `__toError`
    // from the XML-envelope one above, so it gets its own regression test.
    const c = client();
    c.enqueue(() => new Response(null, { status: 404 }));
    const error = await asserts.assertRejects(
      () => c.headObject({ bucket: 'examplebucket', key: 'missing.txt' }),
      S3Error,
    );
    asserts.assertStringIncludes(
      error.message,
      'The specified key missing.txt does not exist.',
    );
  });

  it('populates the ${bucket} placeholder for a listObjects NO_SUCH_BUCKET', async () => {
    const c = client();
    c.enqueue(() =>
      new Response(
        `<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message></Error>`,
        { status: 404, headers: { 'Content-Type': 'application/xml' } },
      )
    );
    const error = await asserts.assertRejects(
      () => c.listObjects({ bucket: 'missing-bucket' }),
      S3Error,
    );
    asserts.assertStringIncludes(
      error.message,
      'The specified bucket missing-bucket does not exist.',
    );
  });
});

describe('S3 — canonical header/query building matches SigV4 directly', () => {
  it('sanity: canonicalHeaders/canonicalQueryString are the exact functions used to sign', () => {
    const { signedHeaders } = canonicalHeaders({
      host: 'x',
      'x-amz-date': '20130524T000000Z',
      'x-amz-content-sha256': 'y',
    });
    asserts.assertEquals(signedHeaders, 'host;x-amz-content-sha256;x-amz-date');
    asserts.assertEquals(canonicalQueryString({ b: '2', a: 'J' }), 'a=J&b=2');
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises a real AWS S3 (or S3-compatible) bucket over the
// network. Skipped entirely unless CONNECTOR_S3_ACCESS_KEY_ID/
// CONNECTOR_S3_SECRET_ACCESS_KEY/CONNECTOR_S3_REGION/CONNECTOR_S3_TEST_BUCKET
// are all set (via env or a `.env` file — see `envArgs`), which is never the
// case in CI/sandboxed environments, so this never runs unattended.
//
// This is the "mutating operation, self-cleaning, but needs a
// pre-existing external resource" pattern: unlike a resource this suite
// could safely create-then-delete itself (e.g. a throwaway object), a
// *bucket* is provisioned out-of-band and just referenced by name here —
// creating/deleting a real bucket on every test run is unsafe (propagation
// delays, accidental collisions with other buckets, IAM policies scoped to
// a fixed bucket name, etc). Only the object this test itself creates is
// cleaned up, in a `finally`, so nothing lingers in the bucket even if the
// `putObject`/`getObject` call or the assertion in between throws.
// ---------------------------------------------------------------------------
import { envArgs } from '@utils';

const env = envArgs();
const credentials = {
  accessKeyId: env.get('CONNECTOR_S3_ACCESS_KEY_ID'),
  secretAccessKey: env.get('CONNECTOR_S3_SECRET_ACCESS_KEY'),
  region: env.get('CONNECTOR_S3_REGION'),
  testBucket: env.get('CONNECTOR_S3_TEST_BUCKET'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'S3 — live',
  // Deno only: Bun/Node each get their own connect-wide live-test job
  // (see the repo's CI matrix), so this suite only registers on Deno —
  // it must not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('puts and gets a real object against the live bucket, then cleans up', async () => {
      const client = new S3({
        auth: {
          type: 'CUSTOM',
          accessKeyId: credentials.accessKeyId!,
          secretAccessKey: credentials.secretAccessKey!,
          region: credentials.region!,
        },
      });
      const key = `tundra-connect-live-test-${Date.now()}.txt`;
      try {
        await client.putObject({
          bucket: credentials.testBucket!,
          key,
          body: new TextEncoder().encode('live test'),
        });
        const object = await client.getObject({
          bucket: credentials.testBucket!,
          key,
        });
        asserts.assertEquals(await object.body.text(), 'live test');
      } finally {
        // Runs even if putObject/getObject/the assertion above threw, so a
        // failed assertion never leaves a stray object in the real bucket.
        await client.deleteObject({ bucket: credentials.testBucket!, key });
      }
    });
  },
});
