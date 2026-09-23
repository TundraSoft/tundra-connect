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

| Method                  | GCS operation                                           |
| ----------------------- | ------------------------------------------------------- |
| `putObject(options)`    | Simple media upload — `POST {uploadBase}/b/{bucket}/o`  |
| `getObject(options)`    | Metadata `GET` and `GET ...?alt=media`, concurrently    |
| `deleteObject(options)` | `DELETE /b/{bucket}/o/{key}`                            |
| `listObjects(options)`  | `GET /b/{bucket}/o`                                     |
| `headObject(options)`   | Metadata-only `GET` (no real `HEAD` exists — see below) |

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

## Service-account JWT

The RS256 assertion exchanged for an access token is built and signed by `@tundralibs/crypt`'s `issueJWT` directly from the PEM.
