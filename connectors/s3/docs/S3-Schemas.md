# S3 Schemas

The `@tundraconnect/s3/schemas` subpath exports Guardian validators and
inferred types. Client methods validate every header-derived result or
parsed body before returning it.

```ts
import {
  type ObjectMetadataSchema,
  ObjectMetadataSchemaObject,
} from '@tundraconnect/s3/schemas';

const raw: unknown = {
  contentType: 'text/plain',
  contentLength: '1234',
  etag: '"9a0364b9e99bb480dd25e1f0284c8555"',
};

const [error, meta] = ObjectMetadataSchemaObject.safeParse(raw);
if (error || !meta) throw error;

const typedMeta: ObjectMetadataSchema = meta;
console.log(typedMeta.contentLength); // 1234 (coerced from the header string)
```

## Response Schemas

| Schema                                      | Endpoint                                     |
| ------------------------------------------- | -------------------------------------------- |
| `PutObjectResponseSchemaObject`             | `PUT /{bucket}/{key}`                        |
| `DeleteObjectResponseSchemaObject`          | `DELETE /{bucket}/{key}`                     |
| `ListObjectsResponseSchemaObject`           | `GET /{bucket}?list-type=2`                  |
| `S3ErrorEnvelopeSchemaObject`               | Vendor `<Error>` XML envelopes               |
| `InitiateMultipartUploadResultSchemaObject` | `POST /{key}?uploads` (`putObjectStream`)    |
| `CompleteMultipartUploadResultSchemaObject` | `POST /{key}?uploadId=…` (`putObjectStream`) |

`GetObjectStreamResult` (from `getObjectStream`) is likewise a plain type:
`ObjectMetadataSchema` intersected with `{ body: ReadableStream<Uint8Array> }`.

`GetObjectResponseSchema` and `HeadObjectResponseSchema` are plain
TypeScript types (not Guardian schema _objects_) — `getObject`'s body is a
raw `Blob`, which Guardian has no binary validator for, so only the
header-derived metadata half is schema-validated at runtime; the body is
intersected onto that type.

## Component Schemas

| Schema                       | Purpose                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ObjectMetadataSchemaObject` | Header-derived metadata shared by `getObject`/`headObject` (`contentType`, `contentLength`, `etag`, `lastModified`, `versionId`, `metadata`) |
| `S3ObjectSchemaObject`       | One `<Contents>` entry within a `ListObjectsV2` result                                                                                       |

## Common Validators

`bucketGuard`, `keyGuard`, `etagGuard`, and `metadataGuard` are reusable
component validators for bucket names, object keys, ETags, and
`x-amz-meta-*`-derived metadata maps.

## XML parsing quirks handled by `ListObjectsResponseSchemaObject`

RESTler's bundled XML parser (verified empirically, not assumed from the
XML spec) produces two shapes that need normalizing before validation,
handled via `Guardian.preprocess`:

- A single `<Contents>` element parses to a bare object, not a
  one-element array — only two or more produce an array. Normalized to
  always be an array (possibly empty).
- An empty element (e.g. `<Prefix></Prefix>`) parses to `null`, not `''`.
  Normalized to `undefined`.

---

[← Back to S3](../README.md)
