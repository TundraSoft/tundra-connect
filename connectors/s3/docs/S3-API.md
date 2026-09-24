# S3 API

## Configuration

```ts
import { S3 } from '@tundraconnect/s3';

const client = new S3({
  auth: {
    type: 'CUSTOM',
    accessKeyId: 'AKIA...',
    secretAccessKey: '...',
    region: 'us-east-1',
    sessionToken: undefined, // set for STS / temporary credentials
  },
  baseURL: undefined, // defaults to https://s3.{region}.amazonaws.com
  forcePathStyle: undefined, // see below
  timeout: 30, // seconds
});
```

- `auth.region` is also the SigV4 signing region — pass `'auto'` for
  Cloudflare R2, or the literal Spaces region code (e.g. `nyc3`) for
  DigitalOcean Spaces.
- `baseURL` defaults to the standard AWS endpoint for `auth.region`.
  Supply a custom endpoint for R2 (`https://{account}.r2.cloudflarestorage.com`),
  MinIO, DigitalOcean Spaces (`https://{region}.digitaloceanspaces.com`), or
  any other S3-compatible host.
- `forcePathStyle` selects `https://s3.region.amazonaws.com/{bucket}/{key}`
  (path-style) over the default `https://{bucket}.s3.region.amazonaws.com/{key}`
  (virtual-hosted-style). It defaults to `false` against the standard AWS
  `baseURL` (matching AWS's own default) and to `true` whenever a custom
  `baseURL` is supplied, since a bucket subdomain won't resolve against
  most non-AWS endpoints (R2, MinIO). Set it explicitly to override either
  default — DigitalOcean Spaces is virtual-hosted-style like AWS despite
  needing a custom `baseURL`, so it needs `forcePathStyle: false` set
  explicitly (see [README](../README.md#digitalocean-spaces-virtual-hosted-style-addressing)).

## Endpoints

| Method                     | HTTP request                                   | Result                                        |
| -------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `putObject(options)`       | `PUT /{key}` (or `/{bucket}/{key}`)            | `{ etag, versionId? }`                        |
| `getObject(options)`       | `GET /{key}`                                   | `{ body: Blob, contentType?, ... }`           |
| `deleteObject(options)`    | `DELETE /{key}`                                | `{ versionId?, deleteMarker? }`               |
| `listObjects(options)`     | `GET /?list-type=2&...`                        | `{ contents, isTruncated, ... }`              |
| `headObject(options)`      | `HEAD /{key}`                                  | Same metadata shape as `getObject`, no body   |
| `putObjectStream(options)` | Multipart upload — see [Streaming](#streaming) | Same result shape as `putObject`              |
| `getObjectStream(options)` | `GET /{key}`, body left unread                 | `{ body: ReadableStream, contentType?, ... }` |

```ts
import { S3 } from '@tundraconnect/s3';

const client = new S3({
  auth: {
    type: 'CUSTOM',
    accessKeyId: 'AKIA...',
    secretAccessKey: '...',
    region: 'us-east-1',
  },
});

await client.putObject({
  bucket: 'my-bucket',
  key: 'reports/q1.json',
  body: JSON.stringify({ total: 42 }),
  contentType: 'application/json',
  metadata: { owner: 'ada' }, // sent as x-amz-meta-owner
});

const obj = await client.getObject({
  bucket: 'my-bucket',
  key: 'reports/q1.json',
});
console.log(obj.contentType, await obj.body.text());

await client.deleteObject({ bucket: 'my-bucket', key: 'reports/q1.json' });

const meta = await client.headObject({ bucket: 'my-bucket', key: 'hello.txt' });
console.log(meta.contentLength);
```

### Listing objects (pagination)

`listObjects` uses ListObjectsV2. Page through a truncated result with
`nextContinuationToken`:

```ts
let token: string | undefined;
do {
  const page = await client.listObjects({
    bucket: 'my-bucket',
    prefix: 'logs/',
    maxKeys: 1000,
    continuationToken: token,
  });
  for (const object of page.contents) {
    console.log(object.key, object.size, object.lastModified);
  }
  token = page.nextContinuationToken;
} while (token);
```

## Streaming

### `putObjectStream(options)`

Uploads a large object from a `ReadableStream<Uint8Array>` (or a `Blob`)
as an S3 multipart upload — `POST ?uploads` (CreateMultipartUpload), one
`PUT ?partNumber=N&uploadId=…` per part, then `POST ?uploadId=…`
(CompleteMultipartUpload) with the collected part ETags — so only one part
is ever in memory. Works unchanged against DigitalOcean Spaces, Cloudflare
R2 and MinIO, which implement the same multipart API.

Why not a single streamed `PUT`: `fetch` sends a stream body with chunked
transfer encoding and no `Content-Length`, and SigV4 needs the payload
hash before the first byte goes out — S3 rejects such a request.
Multipart is S3's own answer, and each part is a bounded `Blob` that
RESTler can also retry on a 429 like any other request.

| Option          | Type                                 | Required | Description                                                                                                    |
| --------------- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `bucket`, `key` | `string`                             | yes      | Target bucket and object key.                                                                                  |
| `body`          | `ReadableStream<Uint8Array> \| Blob` | yes      | The data — consumed once.                                                                                      |
| `contentType`   | `string`                             | no       | `Content-Type` stored on the object (default `application/octet-stream`).                                      |
| `metadata`      | `Record<string,string>`              | no       | `x-amz-meta-*` on the object.                                                                                  |
| `partSize`      | `number`                             | no       | Bytes per part. Default 8 MiB (`DEFAULT_PART_SIZE`); minimum 5 MiB (`MIN_PART_SIZE`); S3 caps at 10,000 parts. |

Returns the same `{ etag, versionId? }` as `putObject`. Note that a
multipart object's ETag carries a `-N` suffix and is **not** an MD5 of the
content.

Behaviour worth knowing:

- A body that fits in one part (including an empty one) is sent as a plain
  `putObject` — one request, no upload to initiate or complete — so the
  method is safe to use for any size.
- `partSize` below 5 MiB is rejected up front (`CONFIG_INVALID_PART_SIZE`):
  S3 only reports `EntityTooSmall` at CompleteMultipartUpload, after every
  byte has already been sent.
- Any failure after CreateMultipartUpload succeeded triggers a best-effort
  `DELETE ?uploadId=…` (AbortMultipartUpload) so S3 stops storing — and
  billing for — the parts that landed. The original error is re-thrown; if
  the abort itself failed, that error is attached as
  `getContextValue('cleanupError')`.
- On any failure the source stream is **cancelled** (best-effort), not just
  unlocked — a partially consumed file stream would otherwise keep its
  handle open until GC. A fully consumed source is never cancelled.
- S3 can fail CompleteMultipartUpload _after_ sending a `200 OK` header, in
  which case the body is an `<Error>` document. That is detected and mapped
  (`INTERNAL_ERROR`, `NO_SUCH_UPLOAD`, `INVALID_PART`, ...) exactly like an
  error status — a 200 is never trusted on its own here.

```ts
const file = await Deno.open('backup.tar');
const { etag } = await client.putObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
  body: file.readable,
  contentType: 'application/x-tar',
});
```

### `getObjectStream({ bucket, key, idleTimeout? })`

Downloads an object as an unread `ReadableStream<Uint8Array>` plus the
same header-derived metadata `getObject` returns (`contentType`,
`contentLength`, `etag`, `lastModified`, `versionId`, `metadata`). The
body is never buffered; the vendor-wide `timeout` bounds only the wait
for headers, after which an idle timer that resets on every chunk governs
the transfer — `idleTimeout` (seconds, default 60) sets how long a stall
is tolerated; raise it for very slow or bursty links. An error response's small XML body is read and mapped
exactly as for `getObject`. **You own the stream** — consume it or
`cancel()` it.

```ts
const { body, contentLength } = await client.getObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
});
await body.pipeTo((await Deno.create('backup.tar')).writable);
```

## Request signing

Every request is signed with AWS Signature Version 4 — see the inline
documentation on `SigV4.ts` (`signV4`, `uriEncode`, `canonicalQueryString`,
`canonicalHeaders`) for the exact canonicalization rules, and
`SigV4.test.ts` for byte-for-byte verification against AWS's own published
worked examples (GET Object, PUT Object, GET Bucket Lifecycle, GET Bucket
List Objects).

See [Errors](S3-Errors.md) for failure handling and [Schemas](S3-Schemas.md)
for response validation.

---

[← Back to S3](../README.md)
