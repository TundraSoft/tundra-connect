import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AzureBlob } from './AzureBlob.ts';
import { AzureBlobError } from './errors/mod.ts';
import { signSharedKey } from './AzureBlobSigner.ts';

const ACCOUNT = 'devstoreaccount1';
const ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

type CapturedRequest = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
};

class MockAzureBlob extends AzureBlob {
  public lastRequest?: CapturedRequest;
  private responseFactory: (req: CapturedRequest) => Response = () =>
    new Response(null, { status: 200 });

  setResponseFactory(factory: (req: CapturedRequest) => Response): void {
    this.responseFactory = factory;
  }

  setResponse(
    body: BodyInit | null,
    status: number,
    headers?: Record<string, string>,
  ): void {
    this.responseFactory = () => new Response(body, { status, headers });
  }

  constructor(options: ConstructorParameters<typeof AzureBlob>[0]) {
    super(options);
    this._fetch = async (input, init) => {
      // Build a real `Request` from the exact (url, init) pair RESTler
      // hands to fetch, and capture ITS headers — the true wire headers.
      // Capturing `init.headers` directly would miss anything the fetch
      // machinery itself adds at `Request` construction — most importantly
      // the `Content-Type` it auto-appends from a typed `Blob` body's
      // `.type`, the exact signed-vs-sent divergence this suite must be
      // able to observe. Header names come back lowercased (`Headers`
      // normalization), so assertions use lowercase names throughout.
      const wire = new Request(String(input), init);
      const request: CapturedRequest = {
        url: String(input),
        method: init?.method,
        headers: Object.fromEntries(wire.headers.entries()),
        body: init?.body,
      };
      this.lastRequest = request;
      return this.responseFactory(request);
    };
  }
}

const LIST_BLOBS_XML = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://devstoreaccount1.blob.core.windows.net/" ContainerName="my-container">
  <Blobs>
    <Blob>
      <Name>photos/cat.png</Name>
      <Properties>
        <Last-Modified>Tue, 01 Jan 2019 12:00:00 GMT</Last-Modified>
        <Etag>"0x8D1234567890ABC"</Etag>
        <Content-Length>12345</Content-Length>
        <Content-Type>image/png</Content-Type>
      </Properties>
    </Blob>
    <Blob>
      <Name>photos/dog.png</Name>
      <Properties>
        <Last-Modified>Tue, 01 Jan 2019 13:00:00 GMT</Last-Modified>
        <Etag>"0x8D1234567890ABD"</Etag>
        <Content-Length>54321</Content-Length>
        <Content-Type>image/png</Content-Type>
      </Properties>
    </Blob>
  </Blobs>
  <NextMarker>continue-here</NextMarker>
</EnumerationResults>`;

const NOT_FOUND_ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<Error>
  <Code>BlobNotFound</Code>
  <Message>The specified blob does not exist.
RequestId:abc123
Time:2026-08-16T00:00:00.0000000Z</Message>
</Error>`;

describe('AzureBlob', () => {
  describe('configuration', () => {
    it('derives baseURL from auth.account', () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      asserts.assertEquals(client.vendor, 'AzureBlob');
      asserts.assertEquals(client.account, ACCOUNT);
      asserts.assertEquals(client.apiVersion, '2021-08-06');
    });

    it('accepts an explicit baseURL override (e.g. for Azurite)', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
        baseURL: 'http://127.0.0.1:10000/devstoreaccount1',
      });
      client.setResponse(null, 202);
      await client.deleteObject({ bucket: 'my-container', key: 'a.txt' });
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        'http://127.0.0.1:10000/devstoreaccount1/',
      );
    });

    it('accepts a configurable apiVersion', () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
        apiVersion: '2020-10-02',
      });
      asserts.assertEquals(client.apiVersion, '2020-10-02');
    });

    it('rejects a missing/empty account', () => {
      asserts.assertThrows(
        () =>
          new MockAzureBlob({
            auth: { type: 'CUSTOM', account: '', accountKey: ACCOUNT_KEY },
          }),
        AzureBlobError,
        'account',
      );
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockAzureBlob({} as any),
        AzureBlobError,
      );
    });

    it('rejects when neither accountKey nor sasToken is supplied', () => {
      asserts.assertThrows(
        () =>
          new MockAzureBlob({
            auth: { type: 'CUSTOM', account: ACCOUNT },
          }),
        AzureBlobError,
        'accountKey',
      );
    });

    it('rejects an empty apiVersion', () => {
      asserts.assertThrows(
        () =>
          new MockAzureBlob({
            auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
            apiVersion: '',
          }),
        AzureBlobError,
      );
    });

    it('prefers sasToken over accountKey when both are supplied', async () => {
      const client = new MockAzureBlob({
        auth: {
          type: 'CUSTOM',
          account: ACCOUNT,
          accountKey: ACCOUNT_KEY,
          sasToken: 'sv=2021-08-06&sig=abc123%3D%3D',
        },
      });
      client.setResponse(null, 202);
      await client.deleteObject({ bucket: 'my-container', key: 'a.txt' });
      asserts.assertEquals(
        client.lastRequest?.headers['authorization'],
        undefined,
      );
      asserts.assertStringIncludes(client.lastRequest?.url ?? '', 'sig=abc123');
    });
  });

  describe('input validation', () => {
    const client = new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });

    it('rejects an empty bucket', async () => {
      await asserts.assertRejects(
        () => client.getObject({ bucket: '', key: 'a.txt' }),
        AzureBlobError,
      );
    });

    it('rejects an empty key', async () => {
      await asserts.assertRejects(
        () => client.getObject({ bucket: 'my-container', key: '' }),
        AzureBlobError,
      );
    });
  });

  describe('bucket/key path-segment validation', () => {
    // Regression coverage for a path-traversal hole identical to
    // `s3/S3.ts`'s: `encodeURIComponent` leaves a literal `.`/`..`
    // *segment* unchanged (dots aren't URI-reserved), and RESTler's
    // `_processEndpoint` resolves the final URL with
    // `path.join(url.pathname, endpoint.path)` — the same collapsing a
    // filesystem path does. An unvalidated `key: '..'` on `deleteObject`
    // would build and sign `/{bucket}/..`, which `path.join` collapses to
    // `/{bucket}` — the container, not the blob — at actual-send time, so
    // the signed `CanonicalizedResource` and the sent request diverge.
    // This is worse under SAS-token auth, where `_authInjector` skips
    // client-side signing entirely.
    const badKeys = ['.', '..', 'foo/../bar', 'foo/./bar', '../'];

    for (const badKey of badKeys) {
      it(`rejects a key of ${JSON.stringify(badKey)} before any request is sent`, async () => {
        const client = new MockAzureBlob({
          auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
        });
        const error = await asserts.assertRejects(
          () => client.deleteObject({ bucket: 'my-container', key: badKey }),
          AzureBlobError,
        );
        asserts.assertEquals(
          (error as AzureBlobError).getContextValue('field'),
          'key',
        );
        asserts.assertEquals(client.lastRequest, undefined);
      });
    }

    it('rejects the same bad segments in bucket', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      const error = await asserts.assertRejects(
        () => client.deleteObject({ bucket: '..', key: 'a.txt' }),
        AzureBlobError,
      );
      asserts.assertEquals(
        (error as AzureBlobError).getContextValue('field'),
        'bucket',
      );
      asserts.assertEquals(client.lastRequest, undefined);
    });

    it('rejects a bad key across every public method that builds a blob path', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      await asserts.assertRejects(
        () => client.putObject({ bucket: 'b', key: '..', body: 'x' }),
        AzureBlobError,
      );
      await asserts.assertRejects(
        () => client.getObject({ bucket: 'b', key: '..' }),
        AzureBlobError,
      );
      await asserts.assertRejects(
        () => client.headObject({ bucket: 'b', key: '..' }),
        AzureBlobError,
      );
      await asserts.assertRejects(
        () => client.deleteObject({ bucket: 'b', key: '..' }),
        AzureBlobError,
      );
      // Not one of these four reached the network.
      asserts.assertEquals(client.lastRequest, undefined);
    });

    it('rejects a bad bucket on listObjects (container-only path)', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      await asserts.assertRejects(
        () => client.listObjects({ bucket: '..' }),
        AzureBlobError,
      );
      asserts.assertEquals(client.lastRequest, undefined);
    });

    it('still accepts a normal key with legitimate dots in a filename', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 202);

      await client.deleteObject({
        bucket: 'my-container',
        key: 'photo.v2.jpg',
      });

      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/my-container/photo.v2.jpg',
      );
    });

    it('still accepts a normal hierarchical key containing slashes', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 202);

      await client.deleteObject({
        bucket: 'my-container',
        key: 'reports/2024/jan.csv',
      });

      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/my-container/reports%2F2024%2Fjan.csv',
      );
    });
  });

  describe('putObject', () => {
    it('signs with Shared Key and sets Content-Type/x-ms-blob-type/x-ms-meta-* before signing', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 201, {
        ETag: '"0x8D1234567890ABC"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });

      const result = await client.putObject({
        bucket: 'my-container',
        key: 'hello.txt',
        body: 'hello world',
        contentType: 'text/plain; charset=UTF-8',
        metadata: { author: 'ada' },
      });

      asserts.assertEquals(result.etag, '"0x8D1234567890ABC"');
      asserts.assert(result.lastModified instanceof Date);

      const req = client.lastRequest;
      asserts.assertEquals(req?.method, 'PUT');
      asserts.assertStringIncludes(req?.url ?? '', '/my-container/hello.txt');
      asserts.assertEquals(req?.headers['x-ms-blob-type'], 'BlockBlob');
      asserts.assertEquals(
        req?.headers['content-type'],
        'text/plain; charset=UTF-8',
      );
      asserts.assertEquals(req?.headers['x-ms-meta-author'], 'ada');
      asserts.assertExists(req?.headers['x-ms-date']);
      asserts.assertEquals(req?.headers['x-ms-version'], '2021-08-06');
      asserts.assertStringIncludes(
        req?.headers['authorization'] ?? '',
        `SharedKey ${ACCOUNT}:`,
      );
    });

    it('omits Content-Type from both the signature and the wire for an untyped body with no contentType', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 201, {
        ETag: '"abc"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });
      await client.putObject({
        bucket: 'my-container',
        key: 'hello.bin',
        body: new Uint8Array([1, 2, 3]),
      });
      const req = client.lastRequest!;
      // Absent from the wire: a non-Blob body is wrapped in an UNTYPED
      // Blob, which triggers no Content-Type auto-append at `Request`
      // construction (the mock captures real wire headers, so this
      // assertion would catch one).
      asserts.assertEquals(req.headers['content-type'], undefined);
      // Absent from the signature too: a signature recomputed from the
      // exact wire headers/path — whose string-to-sign Content-Type line
      // is empty — matches the Authorization actually sent.
      const { authorizationHeader, stringToSign } = await signSharedKey({
        method: 'PUT',
        path: new URL(req.url).pathname,
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 3,
        headers: req.headers,
      });
      asserts.assertEquals(req.headers['authorization'], authorizationHeader);
      asserts.assertEquals(stringToSign.split('\n')[5], '');
    });

    it("promotes a typed Blob body's own type to a Content-Type that is both signed and sent", async () => {
      // Regression coverage: `fetch` auto-appends `Content-Type` from a
      // typed `Blob`'s `.type` at `Request` construction — AFTER signing.
      // putObject used to sign an EMPTY Content-Type line in that case,
      // guaranteeing a 403 AuthenticationFailed on every typed-Blob upload
      // with no explicit `contentType`.
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 201, {
        ETag: '"abc"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });

      const body = new Blob(['png-bytes'], { type: 'image/png' });
      await client.putObject({ bucket: 'my-container', key: 'cat.png', body });

      const req = client.lastRequest!;
      // Sent: the wire request carries the Blob's own type...
      asserts.assertEquals(req.headers['content-type'], 'image/png');
      // ...and signed: a signature recomputed from the exact wire
      // headers/path only matches the Authorization actually sent if the
      // client's own signature covered this same Content-Type line.
      const { authorizationHeader, stringToSign } = await signSharedKey({
        method: 'PUT',
        path: new URL(req.url).pathname,
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: body.size,
        headers: req.headers,
      });
      asserts.assertEquals(req.headers['authorization'], authorizationHeader);
      asserts.assertEquals(stringToSign.split('\n')[5], 'image/png');
    });

    it("lets an explicit contentType win over a typed Blob body's own type", async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 201, {
        ETag: '"abc"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });

      const body = new Blob(['x'], { type: 'image/png' });
      await client.putObject({
        bucket: 'my-container',
        key: 'x.bin',
        body,
        contentType: 'application/octet-stream',
      });

      const req = client.lastRequest!;
      // An explicit header suppresses fetch's auto-append, so the explicit
      // value is what goes on the wire — and what was signed.
      asserts.assertEquals(
        req.headers['content-type'],
        'application/octet-stream',
      );
      const { authorizationHeader, stringToSign } = await signSharedKey({
        method: 'PUT',
        path: new URL(req.url).pathname,
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: body.size,
        headers: req.headers,
      });
      asserts.assertEquals(req.headers['authorization'], authorizationHeader);
      asserts.assertEquals(
        stringToSign.split('\n')[5],
        'application/octet-stream',
      );
    });

    it('rejects an empty bucket/key before sending a request', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      await asserts.assertRejects(
        () => client.putObject({ bucket: '', key: 'a.txt', body: 'x' }),
        AzureBlobError,
      );
      asserts.assertEquals(client.lastRequest, undefined);
    });
  });

  describe('getObject', () => {
    it('requests a BLOB response and returns body + properties + metadata', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse('hello world', 200, {
        'Content-Type': 'text/plain',
        'Content-Length': '11',
        ETag: '"0x8D1234567890ABC"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
        'x-ms-meta-author': 'ada',
      });

      const result = await client.getObject({
        bucket: 'my-container',
        key: 'hello.txt',
      });

      asserts.assertEquals(await result.body.text(), 'hello world');
      asserts.assertEquals(result.contentType, 'text/plain');
      asserts.assertEquals(result.contentLength, 11);
      asserts.assertEquals(result.etag, '"0x8D1234567890ABC"');
      asserts.assert(result.lastModified instanceof Date);
      asserts.assertEquals(result.metadata, { author: 'ada' });
      asserts.assertEquals(client.lastRequest?.method, 'GET');
    });
  });

  describe('headObject', () => {
    it('sends HEAD and returns properties without a body', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 200, {
        'Content-Type': 'text/plain',
        'Content-Length': '11',
        ETag: '"abc"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });

      const result = await client.headObject({
        bucket: 'my-container',
        key: 'hello.txt',
      });
      asserts.assertEquals(result.contentLength, 11);
      asserts.assertEquals(client.lastRequest?.method, 'HEAD');
    });
  });

  describe('deleteObject', () => {
    it('succeeds on a 202 Accepted response with no body', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 202);
      await client.deleteObject({ bucket: 'my-container', key: 'hello.txt' });
      asserts.assertEquals(client.lastRequest?.method, 'DELETE');
      asserts.assertStringIncludes(
        client.lastRequest?.url ?? '',
        '/my-container/hello.txt',
      );
    });
  });

  describe('blob key encoding', () => {
    it('percent-encodes every internal slash in a key so path.join never collapses a literal "//"', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(null, 202);

      // 'a//b.txt' is a legal Azure blob name (a literal double slash, not
      // a two-level virtual directory). RESTler's `path.join` would
      // silently collapse a literal `//` to a single `/`, corrupting the
      // key on the wire while the Shared-Key signer (which runs before
      // `path.join`) would still sign the pre-collapse path — a signature
      // mismatch. Encoding every internal `/` as `%2F` removes the hazard.
      await client.deleteObject({ bucket: 'my-container', key: 'a//b.txt' });

      const req = client.lastRequest!;
      const url = new URL(req.url);
      asserts.assertEquals(url.pathname, '/my-container/a%2F%2Fb.txt');

      // Recompute the signature independently, from the exact path/headers
      // actually sent, and confirm it matches the Authorization header
      // that was actually sent — proving signing and sending used the
      // SAME (collapse-immune) path string.
      const { authorizationHeader } = await signSharedKey({
        method: 'DELETE',
        path: url.pathname,
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: req.headers,
      });
      asserts.assertEquals(req.headers['authorization'], authorizationHeader);
    });
  });

  describe('listObjects', () => {
    it('parses a real List Blobs XML response end-to-end', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(LIST_BLOBS_XML, 200, {
        'Content-Type': 'application/xml',
      });

      const result = await client.listObjects({ bucket: 'my-container' });

      asserts.assertEquals(result.objects.length, 2);
      asserts.assertEquals(result.objects[0]?.key, 'photos/cat.png');
      asserts.assertEquals(result.objects[0]?.size, 12345);
      asserts.assertEquals(result.objects[0]?.contentType, 'image/png');
      asserts.assert(result.objects[0]?.lastModified instanceof Date);
      asserts.assertEquals(result.continuationToken, 'continue-here');
      asserts.assertEquals(result.isTruncated, true);

      const req = client.lastRequest;
      asserts.assertEquals(req?.method, 'GET');
      asserts.assertStringIncludes(req?.url ?? '', 'restype=container');
      asserts.assertStringIncludes(req?.url ?? '', 'comp=list');
    });

    it('applies prefix/maxKeys/continuationToken as query params', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(
        `<?xml version="1.0" encoding="utf-8"?><EnumerationResults><Blobs/><NextMarker/></EnumerationResults>`,
        200,
        { 'Content-Type': 'application/xml' },
      );

      const result = await client.listObjects({
        bucket: 'my-container',
        prefix: 'photos/',
        maxKeys: 10,
        continuationToken: 'prev-token',
      });

      asserts.assertEquals(result.objects.length, 0);
      asserts.assertEquals(result.continuationToken, undefined);
      asserts.assertEquals(result.isTruncated, false);

      const url = new URL(client.lastRequest?.url ?? '');
      asserts.assertEquals(url.searchParams.get('prefix'), 'photos/');
      asserts.assertEquals(url.searchParams.get('maxresults'), '10');
      asserts.assertEquals(url.searchParams.get('marker'), 'prev-token');
    });
  });

  describe('SAS token authentication', () => {
    it('appends the SAS token as query params and skips Shared Key signing', async () => {
      const client = new MockAzureBlob({
        auth: {
          type: 'CUSTOM',
          account: ACCOUNT,
          sasToken:
            'sv=2021-08-06&ss=b&srt=co&sp=rwdlacx&se=2030-01-01T00%3A00%3A00Z&spr=https&sig=abcDEF123%3D%3D',
        },
      });
      client.setResponse('hello world', 200, {
        'Content-Type': 'text/plain',
        ETag: '"abc"',
        'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
      });

      await client.getObject({ bucket: 'my-container', key: 'hello.txt' });

      const req = client.lastRequest;
      asserts.assertEquals(req?.headers['authorization'], undefined);
      asserts.assertEquals(req?.headers['x-ms-date'], undefined);
      const url = new URL(req?.url ?? '');
      asserts.assertEquals(url.searchParams.get('sv'), '2021-08-06');
      asserts.assertEquals(url.searchParams.get('sig'), 'abcDEF123==');
    });

    it('accepts a SAS token with a leading "?"', async () => {
      const client = new MockAzureBlob({
        auth: {
          type: 'CUSTOM',
          account: ACCOUNT,
          sasToken: '?sv=2021-08-06&sig=abc123%3D%3D',
        },
      });
      client.setResponse(null, 202);
      await client.deleteObject({ bucket: 'my-container', key: 'a.txt' });
      const url = new URL(client.lastRequest?.url ?? '');
      asserts.assertEquals(url.searchParams.get('sv'), '2021-08-06');
    });
  });

  describe('error mapping', () => {
    it('maps a documented vendor code from the x-ms-error-code header', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(NOT_FOUND_ERROR_XML, 404, {
        'Content-Type': 'application/xml',
        'x-ms-error-code': 'BlobNotFound',
      });

      const error = await asserts.assertRejects(
        () => client.getObject({ bucket: 'my-container', key: 'missing.txt' }),
        AzureBlobError,
      );
      asserts.assertEquals(
        (error as AzureBlobError).getContextValue('vendorCode'),
        'BlobNotFound',
      );
    });

    it('maps a documented vendor code from the XML body when the header is absent', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(NOT_FOUND_ERROR_XML, 404, {
        'Content-Type': 'application/xml',
      });

      const error = await asserts.assertRejects(
        () => client.getObject({ bucket: 'my-container', key: 'missing.txt' }),
        AzureBlobError,
      );
      asserts.assertEquals(
        (error as AzureBlobError).getContextValue('vendorCode'),
        'BlobNotFound',
      );
    });

    it('falls back to RESPONSE_ERROR for an unrecognised vendor code', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      client.setResponse(
        `<?xml version="1.0" encoding="utf-8"?><Error><Code>SomeNewCode</Code><Message>???</Message></Error>`,
        409,
        { 'Content-Type': 'application/xml' },
      );

      await asserts.assertRejects(
        () => client.getObject({ bucket: 'my-container', key: 'x.txt' }),
        AzureBlobError,
      );
    });

    it('populates the ${key}/${bucket} placeholders in BLOB_NOT_FOUND/CONTAINER_NOT_FOUND messages', async () => {
      // Regression coverage: `__toError` used to be called with no
      // knowledge of the calling method's bucket/key, so
      // `BLOB_NOT_FOUND`/`CONTAINER_NOT_FOUND`'s `${key}`/`${bucket}`
      // template placeholders rendered as the literal un-substituted text
      // on every real 404, instead of the actual value.
      const blobClient = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      blobClient.setResponse(NOT_FOUND_ERROR_XML, 404, {
        'Content-Type': 'application/xml',
        'x-ms-error-code': 'BlobNotFound',
      });
      const blobError = await asserts.assertRejects(
        () =>
          blobClient.getObject({
            bucket: 'my-container',
            key: 'missing.txt',
          }),
        AzureBlobError,
      );
      asserts.assertStringIncludes(blobError.message, 'missing.txt');
      asserts.assertStringIncludes(blobError.message, 'my-container');
      asserts.assertEquals(
        (blobError as AzureBlobError).getContextValue('key'),
        'missing.txt',
      );
      asserts.assertEquals(
        (blobError as AzureBlobError).getContextValue('bucket'),
        'my-container',
      );

      const containerClient = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      containerClient.setResponse(
        `<?xml version="1.0" encoding="utf-8"?><Error><Code>ContainerNotFound</Code><Message>The specified container does not exist.</Message></Error>`,
        404,
        {
          'Content-Type': 'application/xml',
          'x-ms-error-code': 'ContainerNotFound',
        },
      );
      const containerError = await asserts.assertRejects(
        () => containerClient.listObjects({ bucket: 'missing-container' }),
        AzureBlobError,
      );
      asserts.assertStringIncludes(containerError.message, 'missing-container');
      asserts.assertEquals(
        (containerError as AzureBlobError).getContextValue('bucket'),
        'missing-container',
      );
    });

    it('surfaces RESPONSE_ERROR when a successful response fails schema validation', async () => {
      const client = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      // 200 OK but missing the required ETag/Last-Modified headers.
      client.setResponse(null, 200, {});
      await asserts.assertRejects(
        () => client.headObject({ bucket: 'my-container', key: 'x.txt' }),
        AzureBlobError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises a real Azure Blob Storage container over the
// network. Skipped entirely unless CONNECTOR_AZURE_BLOB_ACCOUNT/
// CONNECTOR_AZURE_BLOB_ACCOUNT_KEY/CONNECTOR_AZURE_BLOB_TEST_CONTAINER are
// all set (via env or a `.env` file — see `envArgs`), which is never the
// case in CI/sandboxed environments, so this never runs unattended.
//
// This is the "mutating operation, self-cleaning, but needs a
// pre-existing external resource" pattern: unlike a resource this suite
// could safely create-then-delete itself (e.g. a throwaway blob), a
// *container* is provisioned out-of-band and just referenced by name here
// — creating/deleting a real container on every test run is unsafe
// (propagation delays, accidental collisions with other containers, etc).
// Only the blob this test itself creates is cleaned up, in a `finally`, so
// nothing lingers in the container even if the putObject/getObject call or
// the assertion in between throws.
// ---------------------------------------------------------------------------
import { envArgs } from '@utils';

/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('AzureBlob — credential custody', () => {
  it('never leaks the shared account key from a runtime failure', async () => {
    const client = new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    client.setResponse(null, 500);
    const err = await asserts.assertRejects(
      () => client.deleteObject({ bucket: 'my-container', key: 'a.txt' }),
      AzureBlobError,
    );
    asserts.assert(!dumpError(err).includes(ACCOUNT_KEY));
  });
});

describe('AzureBlob — streaming', () => {
  const client = () =>
    new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
  /** A byte stream delivered in awkward, non-block-aligned pieces. */
  const stream = (pieces: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        let n = 0;
        for (const size of pieces) {
          const b = new Uint8Array(size);
          for (let i = 0; i < size; i++) b[i] = (n++) & 0xff;
          c.enqueue(b);
        }
        c.close();
      },
    });
  const recorder = (c: MockAzureBlob, status = 201) => {
    const seen: CapturedRequest[] = [];
    c.setResponseFactory((req) => {
      seen.push(req);
      return new Response(null, {
        status,
        headers: {
          etag: '"blk-etag"',
          'last-modified': 'Wed, 24 Sep 2026 10:00:00 GMT',
        },
      });
    });
    return seen;
  };

  it('uploads a stream as Put Block per chunk then one Put Block List, holding one block at a time', async () => {
    const c = client();
    const seen = recorder(c);
    const result = await c.putObjectStream({
      bucket: 'my-container',
      key: 'big.bin',
      body: stream([700, 900, 900]),
      blockSize: 1024,
      contentType: 'application/x-tar',
      metadata: { owner: 'ops' },
    });
    const blocks = seen.filter((r) =>
      decodeURIComponent(r.url).includes('comp=block&')
    );
    const commit = seen.filter((r) =>
      decodeURIComponent(r.url).includes('comp=blocklist')
    );
    asserts.assertEquals(blocks.length, 3);
    asserts.assertEquals(commit.length, 1);
    asserts.assertEquals(seen.indexOf(commit[0]!), 3); // commit is last
    const sizes = await Promise.all(blocks.map((r) => (r.body as Blob).size));
    asserts.assertEquals(sizes, [1024, 1024, 452]);
    const ids = blocks.map((r) => new URL(r.url).searchParams.get('blockid'));
    asserts.assertEquals(ids, [btoa('000000'), btoa('000001'), btoa('000002')]);
    const xml = String(commit[0]!.body);
    asserts.assertEquals(
      xml,
      `<?xml version="1.0" encoding="utf-8"?><BlockList>${
        ids.map((i) => `<Latest>${i}</Latest>`).join('')
      }</BlockList>`,
    );
    asserts.assertEquals(
      commit[0]!.headers['x-ms-blob-content-type'],
      'application/x-tar',
    );
    asserts.assertEquals(commit[0]!.headers['x-ms-meta-owner'], 'ops');
    asserts.assertEquals(commit[0]!.method, 'PUT');
    asserts.assertEquals(result.etag, '"blk-etag"');
  });

  it('commits an empty blob for an empty stream, and accepts a Blob body', async () => {
    const c = client();
    const seen = recorder(c);
    await c.putObjectStream({
      bucket: 'my-container',
      key: 'empty.bin',
      body: stream([]),
    });
    asserts.assertEquals(seen.length, 1);
    asserts.assertStringIncludes(
      String(seen[0]!.body),
      '<BlockList></BlockList>',
    );
    const c2 = client();
    const seen2 = recorder(c2);
    await c2.putObjectStream({
      bucket: 'my-container',
      key: 'blob.bin',
      body: new Blob([new Uint8Array(10)]),
      blockSize: 4,
    });
    asserts.assertEquals(
      seen2.filter((r) => decodeURIComponent(r.url).includes('comp=block&'))
        .length,
      3,
    );
  });

  it('stops at the first failed block and never commits', async () => {
    const c = client();
    const seen: CapturedRequest[] = [];
    c.setResponseFactory((req) => {
      seen.push(req);
      return new Response(null, {
        status: 403,
        headers: { 'x-ms-error-code': 'AuthenticationFailed' },
      });
    });
    await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-container',
          key: 'k',
          body: stream([10]),
          blockSize: 4,
        }),
      AzureBlobError,
    );
    asserts.assertEquals(seen.length, 1);
    asserts.assert(!seen.some((r) => r.url.includes('comp=blocklist')));
  });

  it('rejects a blank key before sending anything', async () => {
    const c = client();
    const seen = recorder(c);
    await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-container',
          key: '',
          body: stream([1]),
        }),
      AzureBlobError,
    );
    asserts.assertEquals(seen.length, 0);
  });

  it('downloads a blob as an unread stream with its headers', async () => {
    const c = client();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    c.setResponseFactory(() =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(ctl) {
            ctl.enqueue(bytes);
            ctl.close();
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': '5',
            etag: '"get-etag"',
          },
        },
      )
    );
    const result = await c.getObjectStream({
      bucket: 'my-container',
      key: 'big.bin',
    });
    asserts.assertEquals(result.contentType, 'application/octet-stream');
    asserts.assertEquals(result.contentLength, 5);
    asserts.assertEquals(result.etag, '"get-etag"');
    asserts.assertEquals(
      new Uint8Array(await new Response(result.body).arrayBuffer()),
      bytes,
    );
    asserts.assertEquals(c.lastRequest?.method, 'GET');
  });

  it('maps a failed streamed download to the vendor code', async () => {
    const c = client();
    c.setResponseFactory(() =>
      new Response(null, {
        status: 404,
        headers: { 'x-ms-error-code': 'BlobNotFound' },
      })
    );
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-container', key: 'missing' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'BLOB_NOT_FOUND');
  });
  /** A source stream that records whether it was cancelled — what a file-backed stream's close hook would see. */
  const cancellable = (pieces: number[]) => {
    const state = { cancelled: false, reason: undefined as unknown };
    // Pull-based, like a file stream: pieces are produced on demand and the
    // stream only closes once the last one has been handed over. A stream
    // filled-and-close()d in start() is NOT closed while chunks are still
    // queued — it becomes closed the moment the reader sees `done`, and
    // from then on cancel() resolves without ever reaching the sink. The
    // chunker reads ahead and drains such a source before the failing
    // upload, so an eager fixture would let the leak through undetected.
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

  it('cancels the source stream when a block fails, and leaves it unlocked', async () => {
    const c = client();
    let n = 0;
    c.setResponseFactory(() =>
      new Response(null, {
        status: ++n === 2 ? 500 : 201,
        headers: { etag: '"e"' },
      })
    );
    const { stream, state } = cancellable([1000, 1000, 1000, 1000, 1000]);
    await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-container',
          key: 'k',
          body: stream,
          blockSize: 1024,
        }),
      AzureBlobError,
    );
    asserts.assertEquals(state.cancelled, true);
    asserts.assertEquals(stream.locked, false);
  });

  it('does not cancel a source it fully consumed', async () => {
    const c = client();
    recorder(c);
    const { stream, state } = cancellable([3000]);
    await c.putObjectStream({
      bucket: 'my-container',
      key: 'k',
      body: stream,
      blockSize: 1024,
    });
    asserts.assertEquals(state.cancelled, false);
    asserts.assertEquals(stream.locked, false);
  });

  it('passes idleTimeout through to the stream request', async () => {
    class Spy extends MockAzureBlob {
      public seen: unknown[] = [];
      protected override _makeStreamRequest(
        ...args: Parameters<AzureBlob['_makeStreamRequest']>
      ): ReturnType<AzureBlob['_makeStreamRequest']> {
        this.seen.push(args[1]);
        return super._makeStreamRequest(...args);
      }
    }
    const c = new Spy({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    c.setResponseFactory(() => new Response('x', { status: 200 }));
    const { body } = await c.getObjectStream({
      bucket: 'my-container',
      key: 'k',
      idleTimeout: 600,
    });
    await body.cancel();
    asserts.assertEquals(
      (c.seen[0] as { idleTimeout?: number }).idleTimeout,
      600,
    );
  });
});

const env = envArgs();
const credentials = {
  account: env.get('CONNECTOR_AZURE_BLOB_ACCOUNT'),
  accountKey: env.get('CONNECTOR_AZURE_BLOB_ACCOUNT_KEY'),
  testContainer: env.get('CONNECTOR_AZURE_BLOB_TEST_CONTAINER'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe('AzureBlob — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      maxRetryWait,
    });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
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

  it('waits the hinted time, retries once, then surfaces SERVER_BUSY with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.listObjects({ bucket: 'my-container' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'SERVER_BUSY');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws SERVER_BUSY immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.listObjects({ bucket: 'my-container' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'SERVER_BUSY');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
  it('rewraps the rate-limit error on every direct-request path, not only __requestAndValidate', async () => {
    // These methods read their result from response headers (or have no
    // body), so they call `_makeRequest` directly — the path that used to
    // leak the raw RESTlerRateLimitError.
    type Client = ReturnType<typeof throttled>['c'];
    const paths: Array<(c: Client) => Promise<unknown>> = [
      (c) => c.putObject({ bucket: 'my-container', key: 'k', body: 'x' }),
      (c) => c.getObject({ bucket: 'my-container', key: 'k' }),
      (c) => c.headObject({ bucket: 'my-container', key: 'k' }),
      (c) => c.deleteObject({ bucket: 'my-container', key: 'k' }),
      (c) =>
        c.putObjectStream({
          bucket: 'my-container',
          key: 'k',
          body: new Blob(['x']),
        }),
    ];
    for (const path of paths) {
      const { c } = throttled(5, '120');
      const err = await asserts.assertRejects(() => path(c), AzureBlobError);
      asserts.assertEquals(err.code, 'SERVER_BUSY');
      asserts.assertEquals(err.getContextValue('retried'), false);
    }
  });
  it('retries a throttled streamed download once, then surfaces SERVER_BUSY with retried: true', async () => {
    // restler >= 1.3.1 applies maxRetryWait to the stream path too.
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-container', key: 'k' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'SERVER_BUSY');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws SERVER_BUSY from a streamed download immediately when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-container', key: 'k' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'SERVER_BUSY');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('AzureBlob — config, validation and guards', () => {
  it('rejects a blank account as CONFIG_INVALID_ACCOUNT', () => {
    const err = asserts.assertThrows(
      () =>
        new MockAzureBlob({
          auth: { type: 'CUSTOM', account: '   ', accountKey: ACCOUNT_KEY },
        }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_ACCOUNT');
  });

  it('maps a throttle with no x-ms-error-code by status (429 and 503 -> SERVER_BUSY)', async () => {
    for (const status of [429, 503]) {
      const c = new MockAzureBlob({
        auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
      });
      c.setResponseFactory(() => new Response(null, { status }));
      const err = await asserts.assertRejects(
        () => c.headObject({ bucket: 'my-container', key: 'k' }),
        AzureBlobError,
      );
      asserts.assertEquals(err.code, 'SERVER_BUSY');
    }
  });

  it('fails RESPONSE_ERROR instead of returning an empty listing for a body with no EnumerationResults root', async () => {
    const c = new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    c.setResponseFactory(() =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const err = await asserts.assertRejects(
      () => c.listObjects({ bucket: 'my-container' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('fails RESPONSE_ERROR when a listed blob is missing its required Name', async () => {
    const c = new MockAzureBlob({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    c.setResponseFactory(() =>
      new Response(
        JSON.stringify({
          EnumerationResults: { Blobs: { Blob: [{ Properties: {} }] } },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    );
    const err = await asserts.assertRejects(
      () => c.listObjects({ bucket: 'my-container' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('fails RESPONSE_ERROR when a streamed download settles with no body', async () => {
    class NoBody extends MockAzureBlob {
      protected override _makeStreamRequest(): ReturnType<
        AzureBlob['_makeStreamRequest']
      > {
        return Promise.resolve({
          url: '',
          status: 200,
          statusText: 'OK',
          headers: {},
          timeTaken: 0,
        });
      }
    }
    const c = new NoBody({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    const err = await asserts.assertRejects(
      () => c.getObjectStream({ bucket: 'my-container', key: 'k' }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('stops before exceeding the block cap with REQUEST_BODY_TOO_LARGE, never committing', async () => {
    class SmallCap extends MockAzureBlob {
      protected override readonly _maxBlocks = 2;
    }
    const c = new SmallCap({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    const seen: string[] = [];
    c.setResponseFactory((req) => {
      seen.push(decodeURIComponent(req.url));
      return new Response(null, { status: 201 });
    });
    const err = await asserts.assertRejects(
      () =>
        c.putObjectStream({
          bucket: 'my-container',
          key: 'k',
          body: new Blob([new Uint8Array(30)]),
          blockSize: 10, // 3 blocks > cap of 2
        }),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'REQUEST_BODY_TOO_LARGE');
    asserts.assertEquals(
      seen.filter((u) => u.includes('comp=block&')).length,
      2,
    );
    asserts.assertEquals(seen.some((u) => u.includes('comp=blocklist')), false);
  });
});

describe('AzureBlob — reconfiguration', () => {
  it('re-validates auth set after construction (a subclass calling _setOption)', () => {
    class Reconfigurable extends MockAzureBlob {
      reconfigure(account: string): void {
        this._setOption('auth', {
          type: 'CUSTOM',
          account,
          accountKey: ACCOUNT_KEY,
        });
      }
    }
    const c = new Reconfigurable({
      auth: { type: 'CUSTOM', account: ACCOUNT, accountKey: ACCOUNT_KEY },
    });
    const err = asserts.assertThrows(
      () => c.reconfigure('   '),
      AzureBlobError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_ACCOUNT');
  });
});

describe({
  name: 'AzureBlob — live',
  // Deno only: Bun/Node each get their own connect-wide live-test job
  // (see the repo's CI matrix), so this suite only registers on Deno —
  // it must not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('puts and gets a real blob against the live container, then cleans up', async () => {
      const client = new AzureBlob({
        auth: {
          type: 'CUSTOM',
          account: credentials.account!,
          accountKey: credentials.accountKey!,
        },
      });
      const key = `tundra-connect-live-test-${Date.now()}.txt`;
      try {
        await client.putObject({
          bucket: credentials.testContainer!,
          key,
          body: new TextEncoder().encode('live test'),
        });
        const object = await client.getObject({
          bucket: credentials.testContainer!,
          key,
        });
        asserts.assertEquals(await object.body.text(), 'live test');
      } finally {
        // Runs even if putObject/getObject/the assertion above threw, so a
        // failed assertion never leaves a stray blob in the real container.
        await client.deleteObject({
          bucket: credentials.testContainer!,
          key,
        });
      }
    });
  },
});
