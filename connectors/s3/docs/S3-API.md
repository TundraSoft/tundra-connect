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

| Method                  | HTTP request                        | Result                                      |
| ----------------------- | ----------------------------------- | ------------------------------------------- |
| `putObject(options)`    | `PUT /{key}` (or `/{bucket}/{key}`) | `{ etag, versionId? }`                      |
| `getObject(options)`    | `GET /{key}`                        | `{ body: Blob, contentType?, ... }`         |
| `deleteObject(options)` | `DELETE /{key}`                     | `{ versionId?, deleteMarker? }`             |
| `listObjects(options)`  | `GET /?list-type=2&...`             | `{ contents, isTruncated, ... }`            |
| `headObject(options)`   | `HEAD /{key}`                       | Same metadata shape as `getObject`, no body |

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
