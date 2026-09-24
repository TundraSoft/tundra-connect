import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GCS, type GCSServiceAccountAuth } from './GCS.ts';
import { GCSError, GCSErrorCodes } from './errors/mod.ts';

// Generated solely for these tests — a throwaway PKCS8 RSA key, not tied to
// any real Google Cloud service account. Exercises the real Web Crypto
// (`crypto.subtle`) signing path end to end.
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDI9qL5wbAEBZno
eLflk1gJrIJAuXGBO30l2LQBjkcI2PjYUaaNArCWdqHNlY8Oj6ivBUSm/kZwsouB
IbaHw27Xnq9GCa8xLzxvfs7SkLl7EX1FJDMkhfWK5Z4ACCiUPBnsYx0/13qlXTKk
QQlipEr3OLvBcS5AHRlHpwMABQ5IVFN77hUHBcKCNuucH1970gRppy+5OkPUU2LH
+fV1bH9clcurI8CEonoXewrOcoDXElMQzqNwSMGJoCkesD0W/7MNW2W3PS4SQLrE
FCHKVILCXwfdkYda838cIBBXIyMf85/Q5nV1eotWps8k8V5be9riyu930RNRM7/R
JAcgSf3hAgMBAAECggEAALEmDdlxOLeoOFkKERFOe/dgb3FJXG+PARgGQ/xwbthd
wFOaUOFR0wLPkHypBHIm24tsxBfGDadKZwRts3lPIruaJjyW94K5IOJ9OykNFR5n
TFtROG6kUiPI79PCCANOTOET0woekv6HfnH24qRm2a5pVG4xAZQtZ8YXHY3m5wWE
aq9ngVeBPyRz6EfYnQRIc2pvroEyad/VAUp/2/Lr7xZRYbwtlM5UaB9vsQTE4iBT
eY77t+nAarvmOrmJdL0wh3XcL0VPcs2JscQXSQDgLgZfYdw1kka0cK0ifgl3VpTX
S3G3gDyvT6TQmR8E7+6MgepH4H1uiRdslBYGu89s0QKBgQDpiommhFhEkJp+Tovw
MDGCBn+mR9H+/vuXxsVw5NHE5vHahxEP889uFwluH35wAUz8EFflYyPlEF91jaT+
DIAs7Sa0Z++hGe1l4Jq4lBOKvFQzFmguBBIehUTq8y2QnQ0I8Rgm55WpyW+BouQ4
EmMZjv5pykptRaB3c3oLzXdQDQKBgQDcShRtqf4fzynLYkZqKDMTLZY4lppGpKmb
mQXWHMOzQ9GK+7u8ry0uRvSopVsH4OCj5RimWJ3ekdnjo3WtJP3lb40znodYqI3B
03UxhLljJlBTML9b0FPlo9Efhgnxv5Pq4CvE9s5TwUGdvvzSxbWQBWLhEcK+aKSs
Xz8sSfIcJQKBgDN8RzxekNcMygJubotVFJUFub5+ttzweabMO1rYFybBgzAZ9rj9
lw0+JuYQK1+l6cLoF3iKkq89HM5dm7ImL1u4LIA5KarqfFupWHK4slYzjpx0pCMA
4r23w6nIUpM/DFCcVia9h1EXB24c6xMxeod37r6DykSsxOOQoadYdKVBAoGBALnW
CMvGx6ogAtsf6dUuWoAISh0s97M2wBqSifjpxTKauNAts1/mzA+pLkaDUHsh+4Bo
CVZzlaKomg7O27wYY9RFOfJc/0MM1qG3+LqwhBCfxs2XZydWZSBqBUY5tnPpsShI
usPrjX3cn7Uq5HAO+C8qTBMg/4/QCXOc2ldLfmK9AoGAcV6yF51/9QMdX5liHvmr
DMr8xAq5u8ZBU/Uj01anGy2k7gEBj0VgzONpu1ypcc/wWfqTS6G8xRYYt8JIqNaZ
lSoKtwuiZak8CXW248b9WXe4SHjVAYFt9+XrcESNbvYvK35YoaQMXVHrT8htp89G
5v4C7ULsQDbju4a+7xU5Uyc=
-----END PRIVATE KEY-----`;

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return atob(padded + '='.repeat(padLength));
}

function decodeJWTPayload(jwt: string): Record<string, unknown> {
  const payloadSegment = jwt.split('.')[1] ?? '';
  return JSON.parse(base64UrlDecode(payloadSegment));
}

type RequestLog = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
};

type QueueEntry = {
  factory: (init?: RequestInit) => Response | Promise<Response>;
  /**
   * Optional URL predicate. `getObject` fires its metadata and `alt=media`
   * requests concurrently (`Promise.allSettled`), so a strict FIFO queue
   * can no longer assume the two requests reach `fetch` in the same order
   * they were queued — a test that needs to pair a specific queued
   * response with a specific one of the two requests passes `match` to
   * pick it out by URL regardless of arrival order. Entries with no
   * `match` behave exactly as before: consumed in strict queue order,
   * against whichever request arrives.
   */
  match?: (url: string) => boolean;
};

class MockGCS extends GCS {
  public requests: RequestLog[] = [];
  private queue: QueueEntry[] = [];

  constructor(options: ConstructorParameters<typeof GCS>[0]) {
    super(options);
    this._fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      const headers: Record<string, string> = {};
      if (init?.headers) {
        for (const [name, value] of new Headers(init.headers as HeadersInit)) {
          headers[name] = value;
        }
      }
      this.requests.push({
        url,
        method: init?.method,
        headers,
        body: init?.body,
      });
      // Prefer an entry whose predicate explicitly claims this URL; fall
      // back to the oldest un-predicated (plain FIFO) entry otherwise —
      // see `QueueEntry.match`'s doc comment.
      let index = this.queue.findIndex((entry) => entry.match?.(url));
      if (index === -1) {
        index = this.queue.findIndex((entry) => !entry.match);
      }
      if (index === -1) {
        throw new Error(
          `MockGCS: no queued response for ${init?.method ?? 'GET'} ${url}`,
        );
      }
      const [entry] = this.queue.splice(index, 1);
      return entry!.factory(init);
    }) as typeof globalThis.fetch;
  }

  queueResponse(
    factory: (init?: RequestInit) => Response | Promise<Response>,
    match?: (url: string) => boolean,
  ): void {
    this.queue.push({ factory, match });
  }

  queueJSON(
    body: unknown,
    status = 200,
    match?: (url: string) => boolean,
  ): void {
    this.queueResponse(
      () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      match,
    );
  }

  queueBlob(
    data: string,
    status = 200,
    contentType = 'application/octet-stream',
    match?: (url: string) => boolean,
  ): void {
    this.queueResponse(
      () =>
        new Response(data, {
          status,
          headers: { 'Content-Type': contentType },
        }),
      match,
    );
  }

  queueEmpty(status = 204): void {
    this.queueResponse(() => new Response(null, { status }));
  }

  /**
   * Queues a "response" that never settles on its own — it only
   * rejects when the request's `AbortSignal` fires, mirroring real
   * `fetch`'s abort semantics. Used to simulate a hung endpoint for
   * timeout tests.
   */
  queueHang(): void {
    this.queueResponse((init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(
            init.signal?.reason ?? new DOMException('Aborted', 'AbortError'),
          );
        });
      })
    );
  }
}

describe('GCS', () => {
  describe('configuration', () => {
    it('allows auth to be omitted for anonymous public-bucket reads', () => {
      const client = new MockGCS({});
      asserts.assertEquals(client.vendor, 'GCS');
    });

    it('rejects an auth type other than BEARER/CUSTOM', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new MockGCS({
            auth: { type: 'BASIC', username: 'a', password: 'b' } as any,
          }),
        GCSError,
        'must be { type: "BEARER" }',
      );
    });

    it('rejects a CUSTOM auth missing clientEmail', () => {
      asserts.assertThrows(
        () =>
          new MockGCS({
            auth: { type: 'CUSTOM', clientEmail: '', privateKey: 'x' },
          }),
        GCSError,
        'non-empty clientEmail',
      );
    });

    it('rejects a CUSTOM auth missing privateKey', () => {
      asserts.assertThrows(
        () =>
          new MockGCS({
            auth: {
              type: 'CUSTOM',
              clientEmail: 'svc@x.iam.gserviceaccount.com',
              privateKey: '   ',
            },
          }),
        GCSError,
        'non-empty privateKey',
      );
    });
  });

  describe('putObject', () => {
    it('uploads via simple media upload with BEARER auth', async () => {
      const client = new MockGCS({
        auth: { type: 'BEARER', token: 'access-token' },
      });
      client.queueJSON({
        kind: 'storage#object',
        name: 'reports/2024-01.csv',
        bucket: 'my-bucket',
        contentType: 'text/csv',
        size: '12',
      });

      const object = await client.putObject({
        bucket: 'my-bucket',
        key: 'reports/2024-01.csv',
        body: 'a,b,c\n1,2,3',
        contentType: 'text/csv',
      });

      asserts.assertEquals(object.name, 'reports/2024-01.csv');
      asserts.assertEquals(client.requests.length, 1);
      const req = client.requests[0]!;
      asserts.assertEquals(req.method, 'POST');
      asserts.assertStringIncludes(req.url, '/upload/storage/v1/b/my-bucket/o');
      asserts.assertStringIncludes(req.url, 'uploadType=media');
      asserts.assertStringIncludes(req.url, 'name=reports%2F2024-01.csv');
      asserts.assertEquals(req.headers['content-type'], 'text/csv');
      asserts.assertEquals(req.headers['authorization'], 'BEARER access-token');
    });

    it('uploads a Uint8Array body via a zero-copy Blob cast, preserving the exact bytes', async () => {
      const client = new MockGCS({
        auth: { type: 'BEARER', token: 'access-token' },
      });
      client.queueJSON({
        name: 'a.bin',
        bucket: 'my-bucket',
        contentType: 'application/octet-stream',
        size: '4',
      });

      const bytes = new Uint8Array([1, 2, 3, 4]);
      await client.putObject({
        bucket: 'my-bucket',
        key: 'a.bin',
        body: bytes,
        contentType: 'application/octet-stream',
      });

      const sentBody = client.requests[0]?.body;
      asserts.assert(sentBody instanceof Blob);
      const sentBytes = new Uint8Array(await (sentBody as Blob).arrayBuffer());
      asserts.assertEquals(Array.from(sentBytes), [1, 2, 3, 4]);
    });

    it('applies metadata via a follow-up PATCH after the upload', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ name: 'a.txt', bucket: 'b', size: '3' });
      client.queueJSON({
        name: 'a.txt',
        bucket: 'b',
        size: '3',
        metadata: { owner: 'ci' },
      });

      const object = await client.putObject({
        bucket: 'b',
        key: 'a.txt',
        body: 'abc',
        metadata: { owner: 'ci' },
      });

      asserts.assertEquals(object.metadata?.owner, 'ci');
      asserts.assertEquals(client.requests.length, 2);
      asserts.assertEquals(client.requests[1]?.method, 'PATCH');
      asserts.assertStringIncludes(
        client.requests[1]?.url ?? '',
        '/storage/v1/b/b/o/a.txt',
      );
    });

    it('skips the PATCH when no metadata is supplied', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ name: 'a.txt', bucket: 'b' });
      await client.putObject({ bucket: 'b', key: 'a.txt', body: 'abc' });
      asserts.assertEquals(client.requests.length, 1);
    });

    it('compensates a failed metadata PATCH with a best-effort delete, and re-throws the original PATCH error', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ name: 'a.txt', bucket: 'b', size: '3' }); // upload succeeds
      client.queueJSON({
        error: {
          code: 403,
          message: 'vendor message',
          errors: [
            {
              domain: 'global',
              reason: 'forbidden',
              message: 'vendor message',
            },
          ],
        },
      }, 403); // metadata PATCH fails
      client.queueEmpty(204); // compensating DELETE succeeds

      const error = await asserts.assertRejects(
        () =>
          client.putObject({
            bucket: 'b',
            key: 'a.txt',
            body: 'abc',
            metadata: { owner: 'ci' },
          }),
        GCSError,
      );

      // The caller's primary signal is still the PATCH failure — not a
      // different error standing in for it.
      asserts.assertEquals((error as GCSError).code, 'FORBIDDEN');

      // Upload, PATCH, and the compensating DELETE — in that order.
      asserts.assertEquals(client.requests.length, 3);
      asserts.assertEquals(client.requests[0]?.method, 'POST');
      asserts.assertEquals(client.requests[1]?.method, 'PATCH');
      asserts.assertEquals(client.requests[2]?.method, 'DELETE');
      asserts.assertStringIncludes(
        client.requests[2]?.url ?? '',
        '/storage/v1/b/b/o/a.txt',
      );
    });

    it('still surfaces the original PATCH error when the compensating delete also fails', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ name: 'a.txt', bucket: 'b', size: '3' }); // upload succeeds
      client.queueJSON({
        error: {
          code: 500,
          message: 'patch failed',
          errors: [
            {
              domain: 'global',
              reason: 'backendError',
              message: 'patch failed',
            },
          ],
        },
      }, 500); // metadata PATCH fails
      client.queueJSON({
        error: {
          code: 404,
          message: 'already gone',
          errors: [
            { domain: 'global', reason: 'notFound', message: 'already gone' },
          ],
        },
      }, 404); // compensating DELETE also fails

      const error = await asserts.assertRejects(
        () =>
          client.putObject({
            bucket: 'b',
            key: 'a.txt',
            body: 'abc',
            metadata: { owner: 'ci' },
          }),
        GCSError,
      );

      // The DELETE's own failure must not replace or hide the PATCH
      // failure that's the caller's actual signal.
      asserts.assertEquals((error as GCSError).code, 'BACKEND_ERROR');
      asserts.assertEquals(client.requests.length, 3);
      asserts.assertEquals(client.requests[2]?.method, 'DELETE');
    });

    it('rejects a missing bucket or key with a connect-specific code', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      const bucketError = await asserts.assertRejects(
        () => client.putObject({ bucket: '', key: 'a', body: 'x' }),
        GCSError,
      );
      // A connect-specific code, not the generic vendor-mapped
      // `INVALID_REQUEST` — an empty bucket is a local validation failure,
      // not something GCS itself ever responded about.
      asserts.assertEquals((bucketError as GCSError).code, 'INVALID_BUCKET');

      const keyError = await asserts.assertRejects(
        () => client.putObject({ bucket: 'b', key: '', body: 'x' }),
        GCSError,
      );
      asserts.assertEquals((keyError as GCSError).code, 'INVALID_KEY');
    });
  });

  describe('getObject / headObject', () => {
    it('fetches metadata and media bytes concurrently, using both bodies', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      // `getObject` now fires both requests via `Promise.allSettled`, so
      // the mock can't assume which one reaches `fetch` first — each
      // queued response is matched to its request by URL instead of by
      // queue position.
      client.queueJSON(
        { name: 'a.txt', bucket: 'b', contentType: 'text/plain', size: '5' },
        200,
        (url) => !url.includes('alt=media'),
      );
      client.queueBlob(
        'hello',
        200,
        'text/plain',
        (url) => url.includes('alt=media'),
      );

      const { body, metadata } = await client.getObject({
        bucket: 'b',
        key: 'a.txt',
      });

      asserts.assertEquals(metadata.size, '5');
      asserts.assertEquals(await body.text(), 'hello');
      asserts.assertEquals(client.requests.length, 2);
      const metadataRequest = client.requests.find((r) =>
        !r.url.includes('alt=media')
      );
      const mediaRequest = client.requests.find((r) =>
        r.url.includes('alt=media')
      );
      asserts.assertEquals(metadataRequest?.method, 'GET');
      asserts.assertEquals(mediaRequest?.method, 'GET');
    });

    it('issues the metadata and media requests concurrently, not sequentially', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      let releaseMetadata: (() => void) | undefined;
      let releaseMedia: (() => void) | undefined;

      client.queueResponse(
        () =>
          new Promise<Response>((resolve) => {
            releaseMetadata = () =>
              resolve(
                new Response(
                  JSON.stringify({ name: 'a.txt', bucket: 'b', size: '5' }),
                  {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  },
                ),
              );
          }),
        (url) => !url.includes('alt=media'),
      );
      client.queueResponse(
        () =>
          new Promise<Response>((resolve) => {
            releaseMedia = () =>
              resolve(
                new Response('hello', {
                  status: 200,
                  headers: { 'Content-Type': 'text/plain' },
                }),
              );
          }),
        (url) => url.includes('alt=media'),
      );

      const pending = client.getObject({ bucket: 'b', key: 'a.txt' });

      // Yield to the event loop so both request chains have a chance to
      // reach `fetch` before either response is released. Under the old
      // sequential implementation, the media request would never have
      // been dispatched at this point — it only started once the
      // metadata request (still stuck pending, since it's not released
      // yet) had already resolved.
      await new Promise((resolve) => setTimeout(resolve, 0));
      asserts.assertEquals(client.requests.length, 2);

      releaseMetadata?.();
      releaseMedia?.();

      const { body, metadata } = await pending;
      asserts.assertEquals(metadata.size, '5');
      asserts.assertEquals(await body.text(), 'hello');
    });

    it('surfaces the metadata rejection when both metadata and media requests fail', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON(
        {
          error: {
            code: 403,
            message: 'no access',
            errors: [
              { domain: 'global', reason: 'forbidden', message: 'no access' },
            ],
          },
        },
        403,
        (url) => !url.includes('alt=media'),
      );
      client.queueResponse(
        () =>
          new Response('service unavailable', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          }),
        (url) => url.includes('alt=media'),
      );

      const error = await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: 'a.txt' }),
        GCSError,
      );

      // Metadata's vendor-mapped JSON-envelope error wins the race over
      // media's opaque binary-body error, even though media's is a 500
      // (BACKEND_ERROR territory) and would sort differently if the wrong
      // one won.
      asserts.assertEquals((error as GCSError).code, 'FORBIDDEN');
    });

    it('headObject issues only the metadata-only GET', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ name: 'a.txt', bucket: 'b', size: '5' });

      const metadata = await client.headObject({ bucket: 'b', key: 'a.txt' });

      asserts.assertEquals(metadata.size, '5');
      asserts.assertEquals(client.requests.length, 1);
      asserts.assertEquals(client.requests[0]?.method, 'GET');
    });

    it('rejects a missing bucket or key with a connect-specific code', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      const keyError = await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: '' }),
        GCSError,
      );
      asserts.assertEquals((keyError as GCSError).code, 'INVALID_KEY');

      const bucketError = await asserts.assertRejects(
        () => client.headObject({ bucket: '', key: 'a' }),
        GCSError,
      );
      asserts.assertEquals((bucketError as GCSError).code, 'INVALID_BUCKET');
    });
  });

  describe('deleteObject', () => {
    it('deletes an object with an empty success body', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueEmpty(204);

      await client.deleteObject({ bucket: 'b', key: 'tmp/scratch.csv' });

      asserts.assertEquals(client.requests.length, 1);
      asserts.assertEquals(client.requests[0]?.method, 'DELETE');
      asserts.assertStringIncludes(
        client.requests[0]?.url ?? '',
        '/storage/v1/b/b/o/tmp%2Fscratch.csv',
      );
    });
  });

  describe('listObjects', () => {
    it('lists objects and translates pagination params', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({
        kind: 'storage#objects',
        items: [
          { name: 'a.txt', bucket: 'b' },
          { name: 'c.txt', bucket: 'b' },
        ],
        nextPageToken: 'CgJhLnR4dA==',
      });

      const result = await client.listObjects({
        bucket: 'b',
        prefix: 'reports/',
        maxKeys: 50,
        continuationToken: 'prev-token',
      });

      asserts.assertEquals(result.objects.length, 2);
      asserts.assertEquals(result.nextContinuationToken, 'CgJhLnR4dA==');
      const url = client.requests[0]?.url ?? '';
      asserts.assertStringIncludes(url, 'prefix=reports%2F');
      asserts.assertStringIncludes(url, 'maxResults=50');
      asserts.assertStringIncludes(url, 'pageToken=prev-token');
    });

    it('normalises an omitted items array to an empty list', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ kind: 'storage#objects' });

      const result = await client.listObjects({ bucket: 'b' });

      asserts.assertEquals(result.objects, []);
      asserts.assertEquals(result.nextContinuationToken, undefined);
    });

    it('rejects a missing bucket with a connect-specific code', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      const error = await asserts.assertRejects(
        () => client.listObjects({ bucket: '' }),
        GCSError,
      );
      asserts.assertEquals((error as GCSError).code, 'INVALID_BUCKET');
    });
  });

  describe('bucket/key path-segment validation', () => {
    // Regression coverage for a path-traversal hole: `encodeURIComponent`
    // leaves a literal `.`/`..` *segment* unchanged (dots aren't
    // URI-reserved), and RESTler's `_processEndpoint` resolves the final
    // URL with `path.join(url.pathname, endpoint.path)` — the same
    // collapsing a filesystem path does. Direct reproduction confirms the
    // consequence: `path.join('/storage/v1', '/b/mybucket/o/..')` resolves
    // to `/storage/v1/b/mybucket` — GCS's *Delete Bucket* endpoint — and
    // `.../o/.` resolves to `/storage/v1/b/mybucket` 's List Objects
    // endpoint. So an unvalidated `key: '..'` on `deleteObject` would
    // actually call Delete Bucket, not Delete Object.
    const badKeys = ['.', '..', 'foo/../bar', 'foo/./bar', '../'];

    for (const badKey of badKeys) {
      it(`rejects a key of ${JSON.stringify(badKey)} before any request is sent`, async () => {
        const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
        // No response queued for any of these — if a request were sent,
        // MockGCS's fetch stub would throw "no queued response", which
        // would also fail the assertion below but with the wrong error
        // type, making it obvious a request slipped out.
        const error = await asserts.assertRejects(
          () => client.deleteObject({ bucket: 'b', key: badKey }),
          GCSError,
        );
        asserts.assertEquals(
          (error as GCSError).getContextValue('field'),
          'key',
        );
        asserts.assertEquals(client.requests.length, 0);
      });
    }

    it('rejects the same bad segments in bucket', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      await asserts.assertRejects(
        () => client.deleteObject({ bucket: '..', key: 'a.txt' }),
        GCSError,
      );
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects a bad key across every public method that builds an object path', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      await asserts.assertRejects(
        () => client.putObject({ bucket: 'b', key: '..', body: 'x' }),
        GCSError,
      );
      await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: '..' }),
        GCSError,
      );
      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: '..' }),
        GCSError,
      );
      await asserts.assertRejects(
        () => client.deleteObject({ bucket: 'b', key: '..' }),
        GCSError,
      );
      // Not one of these four reached the network.
      asserts.assertEquals(client.requests.length, 0);
    });

    it('still accepts a normal key with legitimate dots in a filename', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueEmpty(204);

      await client.deleteObject({ bucket: 'b', key: 'photo.v2.jpg' });

      asserts.assertEquals(client.requests.length, 1);
      asserts.assertStringIncludes(
        client.requests[0]?.url ?? '',
        '/storage/v1/b/b/o/photo.v2.jpg',
      );
    });

    it('still accepts a normal hierarchical key containing slashes', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueEmpty(204);

      await client.deleteObject({ bucket: 'b', key: 'reports/2024/jan.csv' });

      asserts.assertEquals(client.requests.length, 1);
      asserts.assertStringIncludes(
        client.requests[0]?.url ?? '',
        '/storage/v1/b/b/o/reports%2F2024%2Fjan.csv',
      );
    });
  });

  describe('bucket/key required-value validation', () => {
    // Regression coverage: the guard used to reject only `value.length ===
    // 0`, so a whitespace-only bucket/key (`'   '`) slipped past it and
    // reached the request path unvalidated. `AzureBlob`'s equivalent guard
    // already rejects via `.trim() === ''`; this brings GCS up to the same
    // standard.
    it('rejects a whitespace-only bucket', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      const error = await asserts.assertRejects(
        () => client.deleteObject({ bucket: '   ', key: 'a.txt' }),
        GCSError,
      );
      asserts.assertEquals((error as GCSError).code, 'INVALID_BUCKET');
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects a whitespace-only key', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      const error = await asserts.assertRejects(
        () => client.deleteObject({ bucket: 'b', key: '   ' }),
        GCSError,
      );
      asserts.assertEquals((error as GCSError).code, 'INVALID_KEY');
      asserts.assertEquals(client.requests.length, 0);
    });

    it('throws the connect-specific INVALID_BUCKET/INVALID_KEY codes instead of the generic vendor-mapped INVALID_REQUEST', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });

      const emptyBucket = await asserts.assertRejects(
        () => client.headObject({ bucket: '', key: 'a' }),
        GCSError,
      );
      asserts.assertEquals((emptyBucket as GCSError).code, 'INVALID_BUCKET');
      asserts.assertNotEquals(
        (emptyBucket as GCSError).code,
        'INVALID_REQUEST',
      );

      const emptyKey = await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: '' }),
        GCSError,
      );
      asserts.assertEquals((emptyKey as GCSError).code, 'INVALID_KEY');
      asserts.assertNotEquals((emptyKey as GCSError).code, 'INVALID_REQUEST');
    });
  });

  describe('error mapping', () => {
    it('maps documented vendor error reasons to GCS error codes', async () => {
      const cases: Array<{ reason: string; status: number }> = [
        { reason: 'notFound', status: 404 },
        { reason: 'forbidden', status: 403 },
        { reason: 'authError', status: 401 },
        { reason: 'usageLimits.rateLimitExceeded', status: 429 },
        { reason: 'backendError', status: 500 },
        { reason: 'invalidParameter', status: 400 },
        { reason: 'conflict', status: 409 },
      ];

      for (const testCase of cases) {
        const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
        client.queueJSON({
          error: {
            code: testCase.status,
            message: 'vendor message',
            errors: [
              {
                domain: 'global',
                reason: testCase.reason,
                message: 'vendor message',
              },
            ],
          },
        }, testCase.status);

        const error = await asserts.assertRejects(
          () => client.headObject({ bucket: 'b', key: 'a' }),
          GCSError,
        );
        asserts.assertEquals(
          (error as GCSError).getContextValue('reason'),
          testCase.reason,
        );
      }
    });

    it('falls back to a status-code mapping for a non-envelope error body', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ message: 'not the documented envelope shape' }, 404);

      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: 'a' }),
        GCSError,
        GCSErrorCodes.NOT_FOUND,
      );
    });

    it('falls back to a status-code mapping for a binary (Blob) error body', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      // metadata GET succeeds; media GET fails with a body that arrives as
      // a Blob, not JSON — matched by URL since `getObject` now issues
      // both requests concurrently (see `QueueEntry.match`).
      client.queueJSON(
        { name: 'a.txt', bucket: 'b' },
        200,
        (url) => !url.includes('alt=media'),
      );
      client.queueResponse(
        () =>
          new Response('service unavailable', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          }),
        (url) => url.includes('alt=media'),
      );

      await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: 'a.txt' }),
        GCSError,
        GCSErrorCodes.BACKEND_ERROR,
      );
    });

    it('supplies a fallback vendorMessage for a 400 with a non-JSON error body', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      // metadata GET succeeds; media GET fails with a body that arrives as
      // a Blob, not JSON — matched by URL, as above.
      client.queueJSON(
        { name: 'a.txt', bucket: 'b' },
        200,
        (url) => !url.includes('alt=media'),
      );
      client.queueResponse(
        () =>
          new Response('bad request', {
            status: 400,
            headers: { 'Content-Type': 'text/plain' },
          }),
        (url) => url.includes('alt=media'),
      );

      const error = await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: 'a.txt' }),
        GCSError,
        'no vendor error detail was available (non-JSON error body)',
      );
      asserts.assertEquals(error.message.includes('${'), false);
    });

    it('throws RESPONSE_ERROR for a malformed successful body', async () => {
      const client = new MockGCS({ auth: { type: 'BEARER', token: 't' } });
      client.queueJSON({ bucket: 'b' }); // missing the required `name` field

      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: 'a' }),
        GCSError,
        'did not match the expected schema',
      );
    });
  });

  describe('service-account (CUSTOM) auth', () => {
    it('signs and exchanges a JWT, caching the resulting token', async () => {
      const client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@my-project.iam.gserviceaccount.com',
          privateKey: TEST_PRIVATE_KEY_PEM,
        },
      });
      client.queueJSON({
        access_token: 'exchanged-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
      client.queueJSON({ name: 'a.txt', bucket: 'b', size: '1' });
      client.queueJSON({ name: 'c.txt', bucket: 'b', size: '2' });

      await client.headObject({ bucket: 'b', key: 'a.txt' });
      await client.headObject({ bucket: 'b', key: 'c.txt' });

      // Token endpoint hit once; both API calls reused the cached token.
      asserts.assertEquals(client.requests.length, 3);

      const tokenRequest = client.requests[0]!;
      asserts.assertStringIncludes(
        tokenRequest.url,
        'oauth2.googleapis.com/token',
      );
      asserts.assertEquals(tokenRequest.method, 'POST');
      asserts.assertEquals(
        tokenRequest.headers['content-type'],
        'application/x-www-form-urlencoded',
      );

      const params = new URLSearchParams(String(tokenRequest.body));
      asserts.assertEquals(
        params.get('grant_type'),
        'urn:ietf:params:oauth:grant-type:jwt-bearer',
      );
      const jwt = params.get('assertion') ?? '';
      const payload = decodeJWTPayload(jwt);
      asserts.assertEquals(
        payload.iss,
        'svc@my-project.iam.gserviceaccount.com',
      );
      asserts.assertEquals(payload.aud, 'https://oauth2.googleapis.com/token');
      asserts.assertEquals(
        payload.scope,
        'https://www.googleapis.com/auth/devstorage.full_control',
      );

      asserts.assertEquals(
        client.requests[1]?.headers['authorization'],
        'Bearer exchanged-token',
      );
      asserts.assertEquals(
        client.requests[2]?.headers['authorization'],
        'Bearer exchanged-token',
      );
    });

    it('honours a custom OAuth scope', async () => {
      const client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@x.iam.gserviceaccount.com',
          privateKey: TEST_PRIVATE_KEY_PEM,
          scope: 'https://www.googleapis.com/auth/devstorage.read_only',
        },
      });
      client.queueJSON({ access_token: 'tok', expires_in: 3600 });
      client.queueJSON({ name: 'a.txt', bucket: 'b' });

      await client.headObject({ bucket: 'b', key: 'a.txt' });

      const params = new URLSearchParams(String(client.requests[0]?.body));
      const payload = decodeJWTPayload(params.get('assertion') ?? '');
      asserts.assertEquals(
        payload.scope,
        'https://www.googleapis.com/auth/devstorage.read_only',
      );
    });

    it('throws TOKEN_EXCHANGE_FAILED when the token endpoint rejects the assertion', async () => {
      const client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@x.iam.gserviceaccount.com',
          privateKey: TEST_PRIVATE_KEY_PEM,
        },
      });
      client.queueJSON(
        { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' },
        400,
      );

      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: 'a' }),
        GCSError,
        'Failed to exchange the signed JWT',
      );
    });

    it('throws JWT_SIGNING_FAILED for a malformed private key', async () => {
      const client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@x.iam.gserviceaccount.com',
          privateKey:
            '-----BEGIN PRIVATE KEY-----\nbm90LWEta2V5\n-----END PRIVATE KEY-----',
        },
      });

      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: 'a' }),
        GCSError,
        'Failed to sign the service-account JWT',
      );
    });
  });

  describe('service-account token cache', () => {
    // `_authInjector` resolves `auth` per-request
    // (`endpoint.auth ?? this._getOption('auth')` — the standard RESTler
    // per-call override pattern) and hands it to the private
    // `__getAccessToken`. This connect's own public methods never supply a
    // per-call `auth` override today, so the cache-identity mixup this
    // guards against isn't reachable through them — but the cache itself
    // must still key on the resolved identity, not just "the last token
    // exchanged", so calling the private method directly with two
    // different identities exercises that contract.
    // deno-lint-ignore no-explicit-any
    const getAccessToken = (client: MockGCS, auth: GCSServiceAccountAuth) =>
      (client as any).__getAccessToken(auth) as Promise<string>;

    it('does not reuse a cached token across different service-account identities', async () => {
      const client = new MockGCS({});
      client.queueJSON({ access_token: 'token-a', expires_in: 3600 });
      client.queueJSON({ access_token: 'token-b', expires_in: 3600 });

      const authA: GCSServiceAccountAuth = {
        type: 'CUSTOM',
        clientEmail: 'svc-a@x.iam.gserviceaccount.com',
        privateKey: TEST_PRIVATE_KEY_PEM,
      };
      const authB: GCSServiceAccountAuth = {
        type: 'CUSTOM',
        clientEmail: 'svc-b@x.iam.gserviceaccount.com',
        privateKey: TEST_PRIVATE_KEY_PEM,
      };

      const tokenA = await getAccessToken(client, authA);
      const tokenB = await getAccessToken(client, authB);

      asserts.assertEquals(tokenA, 'token-a');
      asserts.assertEquals(tokenB, 'token-b');
      // Two distinct identities → two distinct token-exchange requests —
      // the bug this guards against would have reused identity A's token
      // for identity B instead of exchanging a new one.
      asserts.assertEquals(client.requests.length, 2);
    });

    it('still reuses the cached token for a repeat call with the same identity', async () => {
      const client = new MockGCS({});
      client.queueJSON({ access_token: 'token-a', expires_in: 3600 });

      const authA: GCSServiceAccountAuth = {
        type: 'CUSTOM',
        clientEmail: 'svc-a@x.iam.gserviceaccount.com',
        privateKey: TEST_PRIVATE_KEY_PEM,
      };

      const first = await getAccessToken(client, authA);
      const second = await getAccessToken(client, authA);

      asserts.assertEquals(first, 'token-a');
      asserts.assertEquals(second, 'token-a');
      asserts.assertEquals(client.requests.length, 1);
    });

    it('single-flights N concurrent token exchanges for the same identity into one network round-trip', async () => {
      const client = new MockGCS({});
      const N = 5;
      // Queue N distinct responses — not just one — so a single-flight
      // regression (each concurrent caller redoing its own exchange)
      // surfaces as a clean `client.requests.length` mismatch below rather
      // than an unrelated "no queued response" throw from the mock.
      for (let i = 0; i < N; i++) {
        client.queueJSON({ access_token: `token-${i}`, expires_in: 3600 });
      }

      const auth: GCSServiceAccountAuth = {
        type: 'CUSTOM',
        clientEmail: 'svc-concurrent@x.iam.gserviceaccount.com',
        privateKey: TEST_PRIVATE_KEY_PEM,
      };

      const tokens = await Promise.all(
        Array.from({ length: N }, () => getAccessToken(client, auth)),
      );

      // Every concurrent caller resolves to the SAME exchanged token...
      asserts.assertEquals(new Set(tokens).size, 1);
      asserts.assertEquals(tokens[0], 'token-0');
      // ...obtained from exactly one token-exchange request, not five —
      // this is the assertion a missing single-flight guard would fail
      // (it would be N, not 1).
      asserts.assertEquals(client.requests.length, 1);
    });

    it('does not reuse a cached token across different requested scopes for the same identity', async () => {
      const client = new MockGCS({});
      client.queueJSON({ access_token: 'token-default', expires_in: 3600 });
      client.queueJSON({ access_token: 'token-read-only', expires_in: 3600 });

      const base: GCSServiceAccountAuth = {
        type: 'CUSTOM',
        clientEmail: 'svc@x.iam.gserviceaccount.com',
        privateKey: TEST_PRIVATE_KEY_PEM,
      };
      const readOnly: GCSServiceAccountAuth = {
        ...base,
        scope: 'https://www.googleapis.com/auth/devstorage.read_only',
      };

      const tokenDefault = await getAccessToken(client, base);
      const tokenReadOnly = await getAccessToken(client, readOnly);

      asserts.assertEquals(tokenDefault, 'token-default');
      asserts.assertEquals(tokenReadOnly, 'token-read-only');
      asserts.assertEquals(client.requests.length, 2);
    });
  });

  describe('service-account token exchange timeout', () => {
    it('times out the raw token-exchange fetch instead of hanging forever', async () => {
      const client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@x.iam.gserviceaccount.com',
          privateKey: TEST_PRIVATE_KEY_PEM,
        },
        // Minimum RESTler allows (1..120s) — keeps the test fast while
        // still exercising the real timer/AbortController path.
        timeout: 1,
      });
      client.queueHang();

      const start = performance.now();
      const error = await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: 'a' }),
        GCSError,
        'Failed to exchange the signed JWT for an OAuth2 access token',
      );
      const elapsed = performance.now() - start;

      asserts.assertEquals(
        (error as GCSError).getContextValue('reason'),
        'timeout',
      );
      // Comfortably below what an actually-hung (never aborted) request
      // would take — proves the timeout fired rather than the promise
      // eventually settling some other way.
      asserts.assert(elapsed < 5000, `expected < 5000ms, got ${elapsed}ms`);
    });
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises a real GCS bucket over the network. Skipped
// entirely unless CONNECTOR_GCS_CLIENT_EMAIL/CONNECTOR_GCS_PRIVATE_KEY/
// CONNECTOR_GCS_TEST_BUCKET are all set (via env or a `.env` file — see
// `envArgs`), which is never the case in CI/sandboxed environments, so this
// never runs unattended.
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

/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('GCS — credential custody', () => {
  it('never leaks a bearer access token from a runtime failure', async () => {
    const client = new MockGCS({
      auth: { type: 'BEARER', token: 'ya29-SECRETMARKER' },
    });
    client.queueResponse(() =>
      new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
    const err = await asserts.assertRejects(
      () =>
        client.putObject({
          bucket: 'my-bucket',
          key: 'k.txt',
          body: 'x',
          contentType: 'text/plain',
        }),
      GCSError,
    );
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });

  it('never echoes a malformed service-account private key, whether it fails at construction or on first use', async () => {
    let err: unknown;
    let client: MockGCS | undefined;
    try {
      client = new MockGCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: 'svc@x.iam.gserviceaccount.com',
          privateKey: 'garbage-SECRETMARKER',
        },
      });
    } catch (e) {
      err = e;
    }
    if (client) {
      client.queueResponse(() => new Response('{}', { status: 500 }));
      err = await asserts.assertRejects(() =>
        client!.putObject({
          bucket: 'b',
          key: 'k',
          body: 'x',
          contentType: 'text/plain',
        })
      );
    }
    asserts.assertExists(err);
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });
});

const env = envArgs();
describe('GCS — streaming', () => {
  const KIB = 1024;
  const CHUNK = 256 * KIB;
  const SESSION =
    'https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o?uploadType=resumable&upload_id=SESSION-1';
  const client = () =>
    new MockGCS({ auth: { type: 'BEARER', token: 'access-token' } });
  /** A byte stream delivered in awkward, non-chunk-aligned pieces. */
  const stream = (pieces: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const size of pieces) c.enqueue(new Uint8Array(size));
        c.close();
      },
    });
  const isSession = (url: string) => url.includes('upload_id=SESSION-1');
  const queueSession = (c: MockGCS) =>
    c.queueResponse(() =>
      new Response(null, { status: 200, headers: { Location: SESSION } })
    );
  const queue308 = (c: MockGCS, persistedEnd: number) =>
    c.queueResponse(
      () =>
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${persistedEnd}` },
        }),
      isSession,
    );
  const OBJECT = {
    kind: 'storage#object',
    name: 'big.bin',
    bucket: 'my-bucket',
    contentType: 'application/x-tar',
    size: String(700 * KIB),
    metadata: { owner: 'ops' },
  };

  it('opens a resumable session, PUTs 256 KiB-multiple chunks, and declares the total on the last one', async () => {
    const c = client();
    queueSession(c);
    queue308(c, CHUNK - 1);
    queue308(c, 2 * CHUNK - 1);
    c.queueJSON(OBJECT, 200, isSession);

    const object = await c.putObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
      body: stream([100 * KIB, 300 * KIB, 300 * KIB]), // 700 KiB → 256 + 256 + 188
      chunkSize: CHUNK,
      contentType: 'application/x-tar',
      metadata: { owner: 'ops' },
    });
    asserts.assertEquals(object.name, 'big.bin');
    asserts.assertEquals(object.metadata?.owner, 'ops');

    asserts.assertEquals(c.requests.length, 4);
    const [open, c1, c2, c3] = c.requests as [
      RequestLog,
      RequestLog,
      RequestLog,
      RequestLog,
    ];
    asserts.assertEquals(open.method, 'POST');
    asserts.assertStringIncludes(
      open.url,
      '/upload/storage/v1/b/my-bucket/o?uploadType=resumable&name=big.bin',
    );
    asserts.assertEquals(
      open.headers['x-upload-content-type'],
      'application/x-tar',
    );
    asserts.assertEquals(open.headers['authorization'], 'BEARER access-token');
    asserts.assertEquals(
      JSON.parse(String(open.body)),
      { contentType: 'application/x-tar', metadata: { owner: 'ops' } },
    );

    const chunks = [c1, c2, c3];
    const sizes = await Promise.all(chunks.map((r) => (r.body as Blob).size));
    asserts.assertEquals(sizes, [CHUNK, CHUNK, 188 * KIB]);
    for (const chunk of chunks) {
      asserts.assertEquals(chunk.method, 'PUT');
      asserts.assertEquals(chunk.url, SESSION);
      asserts.assertEquals(
        chunk.headers['authorization'],
        'BEARER access-token',
      );
    }
    asserts.assertEquals(
      chunks.map((r) => r.headers['content-range']),
      [
        `bytes 0-${CHUNK - 1}/*`,
        `bytes ${CHUNK}-${2 * CHUNK - 1}/*`,
        `bytes ${2 * CHUNK}-${700 * KIB - 1}/${700 * KIB}`,
      ],
    );
  });

  it('finalises an empty stream with "bytes */0", and accepts a Blob body', async () => {
    const c = client();
    queueSession(c);
    c.queueJSON({ ...OBJECT, size: '0' }, 200, isSession);
    await c.putObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
      body: stream([]),
    });
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertEquals(c.requests[1]!.headers['content-range'], 'bytes */0');
    asserts.assertEquals((c.requests[1]!.body as Blob).size, 0);
    // No contentType/metadata → an empty metadata resource, default upload type.
    asserts.assertEquals(JSON.parse(String(c.requests[0]!.body)), {});
    asserts.assertEquals(
      c.requests[0]!.headers['x-upload-content-type'],
      'application/octet-stream',
    );

    const c2 = client();
    queueSession(c2);
    c2.queueJSON({ ...OBJECT, size: '10' }, 200, isSession);
    await c2.putObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
      body: new Blob([new Uint8Array(10)]),
    });
    asserts.assertEquals(
      c2.requests[1]!.headers['content-range'],
      'bytes 0-9/10',
    );
  });

  it('rejects a chunkSize that is not a positive multiple of 256 KiB before any request', async () => {
    const c = client();
    for (const chunkSize of [0, 1000, CHUNK + 1, -CHUNK, 1.5 * CHUNK]) {
      const err = await asserts.assertRejects(
        () =>
          c.putObjectStream({
            bucket: 'my-bucket',
            key: 'k',
            body: stream([10]),
            chunkSize,
          }),
        GCSError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_CHUNK_SIZE');
    }
    asserts.assertEquals(c.requests.length, 0);
  });

  it('fails RESPONSE_ERROR when the session response has no Location header', async () => {
    const c = client();
    c.queueResponse(() => new Response(null, { status: 200 }));
    const err = await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-bucket',
          key: 'k',
          body: stream([10]),
        }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertEquals(c.requests.length, 1);
  });

  it('cancels the session when a chunk fails, treating the 499 acknowledgement as success', async () => {
    const c = client();
    queueSession(c);
    c.queueJSON(
      {
        error: {
          code: 403,
          message: 'Forbidden',
          errors: [{ reason: 'forbidden', message: 'Forbidden' }],
        },
      },
      403,
      isSession,
    );
    c.queueResponse(() => new Response(null, { status: 499 }), isSession);
    const err = await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-bucket',
          key: 'k',
          body: stream([2 * CHUNK]),
          chunkSize: CHUNK,
        }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'FORBIDDEN');
    asserts.assertEquals(err.context.cleanupError, undefined);
    asserts.assertEquals(c.requests.length, 3);
    asserts.assertEquals(c.requests[2]!.method, 'DELETE');
    asserts.assertEquals(c.requests[2]!.url, SESSION);
  });

  it('attaches a genuinely failed cancel as cleanupError without masking the original error', async () => {
    const c = client();
    queueSession(c);
    // A non-308 on an intermediate chunk: GCS thinks the upload is done.
    c.queueJSON(OBJECT, 200, isSession);
    c.queueJSON(
      {
        error: {
          code: 500,
          message: 'boom',
          errors: [{ reason: 'backendError' }],
        },
      },
      500,
      isSession,
    );
    const err = await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-bucket',
          key: 'k',
          body: stream([2 * CHUNK]),
          chunkSize: CHUNK,
        }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertStringIncludes(String(err.context.reason), '308');
    asserts.assert(err.context.cleanupError instanceof GCSError);
    asserts.assertEquals(
      (err.context.cleanupError as GCSError).code,
      'BACKEND_ERROR',
    );
  });

  it('refuses to continue when the server persisted fewer bytes than were sent', async () => {
    const c = client();
    queueSession(c);
    queue308(c, CHUNK - 1000); // short of the chunk actually sent
    c.queueResponse(() => new Response(null, { status: 499 }), isSession);
    const err = await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-bucket',
          key: 'k',
          body: stream([2 * CHUNK]),
          chunkSize: CHUNK,
        }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertStringIncludes(String(err.context.reason), 'persisted');
    asserts.assertEquals(c.requests[2]!.method, 'DELETE');
  });

  it('streams a download after fetching metadata first, without buffering the body', async () => {
    const c = client();
    c.queueJSON(OBJECT, 200, (url) => !url.includes('alt=media'));
    const bytes = new TextEncoder().encode('streamed body');
    c.queueResponse(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(ctrl) {
              ctrl.enqueue(bytes.subarray(0, 4));
              ctrl.enqueue(bytes.subarray(4));
              ctrl.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/x-tar' } },
        ),
      (url) => url.includes('alt=media'),
    );
    const { body, metadata } = await c.getObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
    });
    asserts.assertEquals(metadata.name, 'big.bin');
    asserts.assert(body instanceof ReadableStream);
    asserts.assertEquals(await new Response(body).text(), 'streamed body');
    asserts.assertEquals(c.requests.length, 2);
    asserts.assertStringIncludes(
      c.requests[0]!.url,
      '/storage/v1/b/my-bucket/o/big.bin',
    );
    asserts.assertEquals(c.requests[0]!.url.includes('alt=media'), false);
    asserts.assertStringIncludes(c.requests[1]!.url, 'alt=media');
  });

  it('surfaces NOT_FOUND from the metadata request and never opens the media stream', async () => {
    const c = client();
    c.queueJSON(
      {
        error: {
          code: 404,
          message: 'No such object',
          errors: [{ reason: 'notFound' }],
        },
      },
      404,
    );
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-bucket', key: 'missing.bin' }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
    asserts.assertEquals(c.requests.length, 1);
  });

  it('maps a media-stream error from its JSON body', async () => {
    const c = client();
    c.queueJSON(OBJECT, 200, (url) => !url.includes('alt=media'));
    c.queueJSON(
      {
        error: {
          code: 403,
          message: 'nope',
          errors: [{ reason: 'forbidden' }],
        },
      },
      403,
      (url) => url.includes('alt=media'),
    );
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-bucket', key: 'big.bin' }),
      GCSError,
    );
    asserts.assertEquals(err.code, 'FORBIDDEN');
  });
  /** A source stream that records whether it was cancelled — what a file-backed stream's close hook would see. */
  const cancellable = (pieces: number[]) => {
    const state = { cancelled: false, reason: undefined as unknown };
    // Pull-based, like a file stream: pieces are produced on demand and the
    // stream only closes once the last one has been handed over. (An
    // eagerly filled-and-closed stream is already "closed" by the time an
    // upload fails, and cancelling a closed stream never reaches the sink.)
    let next = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (next < pieces.length) c.enqueue(new Uint8Array(pieces[next++]!));
        else c.close();
      },
      cancel(reason) {
        state.cancelled = true;
        state.reason = reason;
      },
    });
    return { stream, state };
  };

  it('cancels the source stream when a chunk fails, and leaves it unlocked', async () => {
    const c = client();
    queueSession(c);
    queue308(c, CHUNK - 1);
    c.queueJSON(
      {
        error: {
          code: 500,
          message: 'boom',
          errors: [{ reason: 'backendError' }],
        },
      },
      500,
      isSession,
    );
    c.queueResponse(() => new Response(null, { status: 499 }), isSession);
    const { stream, state } = cancellable([CHUNK, CHUNK, CHUNK, CHUNK]);
    await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-bucket',
          key: 'k',
          body: stream,
          chunkSize: CHUNK,
        }),
      GCSError,
    );
    asserts.assertEquals(state.cancelled, true);
    asserts.assertEquals(stream.locked, false);
  });

  it('does not cancel a source it fully consumed', async () => {
    const c = client();
    queueSession(c);
    queue308(c, CHUNK - 1);
    c.queueJSON(OBJECT, 200, isSession);
    const { stream, state } = cancellable([CHUNK + 10]);
    await c.putObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
      body: stream,
      chunkSize: CHUNK,
    });
    asserts.assertEquals(state.cancelled, false);
    asserts.assertEquals(stream.locked, false);
  });

  it('passes idleTimeout through to the media stream request', async () => {
    class Spy extends MockGCS {
      public seen: unknown[] = [];
      protected override _makeStreamRequest(
        ...args: Parameters<GCS['_makeStreamRequest']>
      ): ReturnType<GCS['_makeStreamRequest']> {
        this.seen.push(args[1]);
        return super._makeStreamRequest(...args);
      }
    }
    const c = new Spy({ auth: { type: 'BEARER', token: 't' } });
    c.queueJSON(OBJECT, 200, (url) => !url.includes('alt=media'));
    c.queueResponse(
      () => new Response('x', { status: 200 }),
      (url) => url.includes('alt=media'),
    );
    const { body } = await c.getObjectStream({
      bucket: 'my-bucket',
      key: 'big.bin',
      idleTimeout: 600,
    });
    await body.cancel();
    asserts.assertEquals(
      (c.seen[0] as { idleTimeout?: number }).idleTimeout,
      600,
    );
  });
});

const credentials = {
  clientEmail: env.get('CONNECTOR_GCS_CLIENT_EMAIL'),
  privateKey: env.get('CONNECTOR_GCS_PRIVATE_KEY'),
  testBucket: env.get('CONNECTOR_GCS_TEST_BUCKET'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'GCS — live',
  // Deno only: Bun/Node each get their own connect-wide live-test job
  // (see the repo's CI matrix), so this suite only registers on Deno —
  // it must not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('puts and gets a real object against the live bucket, then cleans up', async () => {
      const client = new GCS({
        auth: {
          type: 'CUSTOM',
          clientEmail: credentials.clientEmail!,
          privateKey: credentials.privateKey!,
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
        asserts.assertEquals(object.metadata.name, key);
      } finally {
        // Runs even if putObject/getObject/the assertion above threw, so a
        // failed assertion never leaves a stray object in the real bucket.
        await client.deleteObject({ bucket: credentials.testBucket!, key });
      }
    });
  },
});
