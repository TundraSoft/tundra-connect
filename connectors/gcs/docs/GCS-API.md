# GCS API

## Configuration

```ts
import { GCS } from '@tundraconnect/gcs';

// Mode 1 — an already-obtained OAuth2 access token.
const client = new GCS({
  auth: { type: 'BEARER', token: 'ya29....' },
});

// Mode 2 — a service account, signed and exchanged automatically.
const client2 = new GCS({
  auth: {
    type: 'CUSTOM',
    clientEmail: 'svc@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
    scope: 'https://www.googleapis.com/auth/devstorage.read_write', // optional
  },
});

// Anonymous reads against a public bucket.
const publicClient = new GCS({});
```

`auth` is validated at construction time: an unsupported `type`, or a
`CUSTOM` auth missing `clientEmail`/`privateKey`, throws a {@link GCSError}
immediately rather than on the first request.

### Base URLs

GCS's JSON API genuinely splits by function — this connect handles both
transparently:

| Purpose             | Base URL                                           |
| ------------------- | -------------------------------------------------- |
| Metadata operations | `https://storage.googleapis.com/storage/v1`        |
| Uploads             | `https://storage.googleapis.com/upload/storage/v1` |

`putObject` targets the upload base for its `POST`; every other method uses
the metadata base (the client's default `baseURL`).

## Canonical object-storage interface

This connect implements the same five methods, with the same
option-bag parameter names, as this repository's other object-storage
connects. GCS's own field names (`name`, `pageToken`/`nextPageToken`) are
translated internally.

| Method                     | GCS operation                                           |
| -------------------------- | ------------------------------------------------------- |
| `putObject(options)`       | Simple media upload — `POST {uploadBase}/b/{bucket}/o`  |
| `getObject(options)`       | Metadata `GET` and `GET ...?alt=media`, concurrently    |
| `deleteObject(options)`    | `DELETE /b/{bucket}/o/{key}`                            |
| `listObjects(options)`     | `GET /b/{bucket}/o`                                     |
| `headObject(options)`      | Metadata-only `GET` (no real `HEAD` exists — see below) |
| `putObjectStream(options)` | Resumable upload — see [Streaming](#streaming)          |
| `getObjectStream(options)` | Metadata `GET`, then `GET ...?alt=media` left unread    |

```ts
import { GCS } from '@tundraconnect/gcs';

const client = new GCS({ auth: { type: 'BEARER', token: 'ya29....' } });

const object = await client.putObject({
  bucket: 'my-bucket',
  key: 'images/logo.png',
  body: pngBytes,
  contentType: 'image/png',
  metadata: { uploadedBy: 'ci' },
});

const { body, metadata } = await client.getObject({
  bucket: 'my-bucket',
  key: 'images/logo.png',
});

const { objects, nextContinuationToken } = await client.listObjects({
  bucket: 'my-bucket',
  prefix: 'images/',
  maxKeys: 100,
});

await client.deleteObject({ bucket: 'my-bucket', key: 'images/logo.png' });
```

### `putObject` and custom metadata

GCS's simple (`uploadType=media`) upload cannot carry custom object
metadata in the same request. When `options.metadata` is supplied,
`putObject` issues a second `PATCH /storage/v1/b/{bucket}/o/{key}`
immediately after the upload to set it, and returns that `patch` response
(which reflects the merged metadata) instead of the upload response.

If that metadata `PATCH` fails after the upload already succeeded,
`putObject` makes a best-effort compensating `deleteObject` call for the
object it just created — so a metadata failure doesn't silently leave
behind an orphaned object with default metadata — then re-throws the
original `PATCH` error regardless of whether the cleanup itself succeeded.
See [errors/Base.ts](../errors/Base.ts) for how to inspect the thrown
error.

### `getObject`

Issues two requests concurrently: a metadata-only `GET` (the same request
`headObject` makes) and `GET ...?alt=media` for the raw bytes, returned as a
`Blob`. Two requests were chosen over reconstructing metadata from the
media response's headers — GCS's media response headers don't carry every
documented Object field (`kind`, `id`, `selfLink`, `timeCreated`, ...), and
this keeps every method's vendor-error handling uniform (a JSON envelope),
rather than special-casing an error that arrives as a binary body.

Neither request depends on the other's result, so they run concurrently
(`Promise.allSettled`) rather than paying their latency serially. If both
reject, the metadata request's rejection is always the one thrown — it
carries the better-quality vendor error (a parsed JSON envelope), whereas
the media request's own rejection would only carry an opaque/binary body.
The media request's rejection only surfaces when metadata succeeded but
media failed.

### `headObject`

GCS's JSON API has **no genuine HTTP `HEAD` verb** for objects (confirmed
against the live Discovery document). `headObject` is a thin wrapper around
the metadata-only `GET` — the same request `getObject` issues internally
before its `alt=media` fetch.

### `listObjects` pagination

GCS omits `items` entirely (not `[]`) when a bucket/prefix has no matching
objects — `listObjects` normalises that to an empty `objects` array. Pass
the previous page's `nextContinuationToken` back as `continuationToken` to
fetch the next page:

```ts
let page = await client.listObjects({ bucket: 'my-bucket', maxKeys: 100 });
while (page.objects.length > 0) {
  for (const object of page.objects) console.log(object.name);
  if (!page.nextContinuationToken) break;
  page = await client.listObjects({
    bucket: 'my-bucket',
    maxKeys: 100,
    continuationToken: page.nextContinuationToken,
  });
}
```

See [Errors](GCS-Errors.md) for failure handling and
[Schemas](GCS-Schemas.md) for response validation.

---

[← Back to GCS](../README.md)

## Streaming

### `putObjectStream(options)`

Uploads a large object from a `ReadableStream<Uint8Array>` (or a `Blob`)
via GCS's resumable upload protocol, so only one chunk is ever in memory:

1. `POST {uploadBase}/b/{bucket}/o?uploadType=resumable&name={key}` with
   `contentType`/`metadata` as the JSON metadata body (so, unlike
   `putObject`, no follow-up `PATCH` is needed) and
   `X-Upload-Content-Type`. The session URI comes back in `Location`.
2. One `PUT` per chunk to that URI with `Content-Range: bytes a-b/*`. GCS
   answers `308 Resume Incomplete` and echoes what it persisted in `Range`.
3. The last chunk declares the total — `bytes a-b/total`, or `bytes */0`
   for an empty body — and returns the created Object resource.

Why not one streamed `POST`: `fetch` sends a stream body with chunked
transfer encoding and no `Content-Length`, which the upload endpoint
rejects. Resumable upload is GCS's own answer, and each chunk is a bounded
`Blob` that RESTler can also retry on a 429.

| Option          | Type                                 | Required | Description                                                                                                        |
| --------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `bucket`, `key` | `string`                             | yes      | Target bucket and object name.                                                                                     |
| `body`          | `ReadableStream<Uint8Array> \| Blob` | yes      | The data — consumed once.                                                                                          |
| `contentType`   | `string`                             | no       | Stored `Content-Type` (default `application/octet-stream`).                                                        |
| `metadata`      | `Record<string,string>`              | no       | Custom metadata, folded into the session.                                                                          |
| `chunkSize`     | `number`                             | no       | Bytes per chunk. Default 8 MiB (`DEFAULT_CHUNK_SIZE`); must be a multiple of 256 KiB (`RESUMABLE_CHUNK_MULTIPLE`). |

Returns the same `ObjectSchema` as `putObject`. Behaviour worth knowing:

- A `chunkSize` that isn't a positive multiple of 256 KiB is rejected up
  front (`CONFIG_INVALID_CHUNK_SIZE`) — GCS only rejects a mis-sized chunk
  once it arrives.
- The source is consumed as it goes, so a chunk the server reports as only
  partially persisted (its `Range` ends short of what was sent) cannot be
  replayed. That — like a non-`308` answer to an intermediate chunk, or a
  session response with no `Location` — is surfaced as `RESPONSE_ERROR`
  rather than committing a truncated object.
- Any failure after the session was opened triggers a best-effort `DELETE`
  of the session URI so GCS drops it now rather than holding it for a
  week. GCS acknowledges the cancel with `499`, which is treated as
  success; a genuinely failed cancel is attached to the original error as
  `getContextValue('cleanupError')`, which is always what's thrown.

```ts
const file = await Deno.open('backup.tar');
const object = await client.putObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
  body: file.readable,
  contentType: 'application/x-tar',
});
console.log(object.size);
```

### `getObjectStream({ bucket, key })`

Fetches the metadata first (the same request `headObject` makes — so a
missing or forbidden object surfaces its vendor-mapped error before any
stream is opened), then issues `GET ...?alt=media` and hands its body back
as an unread `ReadableStream<Uint8Array>`. Unlike `getObject` the two
requests run serially: a stream opened concurrently would have to be
cancelled whenever the metadata request lost the race, for no latency gain
worth it on a transfer that is, by definition, large.

Nothing is buffered; the vendor-wide `timeout` bounds only the wait for
headers, after which an idle timer that resets on every chunk governs the
transfer. **You own the stream** — consume it or `cancel()` it.

```ts
const { body, metadata } = await client.getObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
});
console.log(metadata.size);
await body.pipeTo((await Deno.create('backup.tar')).writable);
```

## Service-account JWT

The RS256 assertion exchanged for an access token is built and signed by `@tundralibs/crypt`'s `issueJWT` directly from the PEM.
