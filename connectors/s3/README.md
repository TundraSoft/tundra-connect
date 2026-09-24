# S3

Typed, cross-runtime client for AWS S3 and S3-compatible object storage
(Cloudflare R2, MinIO, DigitalOcean Spaces, self-hosted gateways), signing
every request with
[AWS Signature Version 4](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv4.html).

## Overview

S3 provides `putObject`, `getObject`, `deleteObject`, `listObjects`, and
`headObject` — the object-storage interface shared across this repo's
storage connects. It uses RESTler for transport and Guardian for runtime
response validation. Every request is signed with SigV4 entirely via Web
Crypto (`crypto.subtle`) — no `node:crypto` — so signing works unmodified
on Deno, Bun, Node, Cloudflare Workers, and in the browser.

## Documentation

| Topic                         | Description                                |
| ----------------------------- | ------------------------------------------ |
| [API](docs/S3-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/S3-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/S3-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [Create an AWS account](https://aws.amazon.com/free/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible)
- [MinIO](https://min.io/) (S3-compatible, self-hosted)
- [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/) (S3-compatible)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/s3
```

**Bun:**

```sh
bunx jsr add @tundraconnect/s3
```

**Node.js:**

```sh
npx jsr add @tundraconnect/s3
```

## Quick Start

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
  key: 'hello.txt',
  body: 'Hello!',
});

const obj = await client.getObject({ bucket: 'my-bucket', key: 'hello.txt' });
console.log(await obj.body.text());
```

### Cloudflare R2 / MinIO (path-style addressing)

A custom `baseURL` automatically switches to path-style addressing (a
bucket subdomain won't resolve against most non-AWS endpoints):

```ts
import { S3 } from '@tundraconnect/s3';

const r2 = new S3({
  baseURL: 'https://<account-id>.r2.cloudflarestorage.com',
  auth: {
    type: 'CUSTOM',
    accessKeyId: '...',
    secretAccessKey: '...',
    region: 'auto',
  },
});
```

### DigitalOcean Spaces (virtual-hosted-style addressing)

Unlike R2/MinIO, Spaces addresses buckets by subdomain — the same
virtual-hosted-style AWS S3 itself uses — even though it also needs a
custom `baseURL`. That combination is exactly what the `forcePathStyle`
auto-detection heuristic above doesn't expect, so set it to `false`
explicitly. The signing `region` is the literal Spaces region code (e.g.
`nyc3`, `sfo3`, `ams3`, `sgp1`, `fra1`), not an AWS region:

```ts
import { S3 } from '@tundraconnect/s3';

const spaces = new S3({
  baseURL: 'https://nyc3.digitaloceanspaces.com',
  forcePathStyle: false,
  auth: {
    type: 'CUSTOM',
    accessKeyId: '...', // Spaces access key
    secretAccessKey: '...', // Spaces secret key
    region: 'nyc3',
  },
});

await spaces.putObject({
  bucket: 'my-space',
  key: 'hello.txt',
  body: 'Hello!',
});
```

This resolves requests against
`https://my-space.nyc3.digitaloceanspaces.com/hello.txt`. Reads can instead
be served through the Spaces CDN by pointing `baseURL` (and, for signed
requests, only the read path) at
`https://nyc3.cdn.digitaloceanspaces.com` — `putObject`/`deleteObject`/
`listObjects` still need the origin endpoint above, since the CDN mirror is
read-only.

## Large files

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

// Upload from a stream as a multipart upload — one 8 MiB part in memory
// at a time. Small bodies fall back to a single PUT automatically.
const file = await Deno.open('backup.tar');
await client.putObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
  body: file.readable,
});

// Download as a stream — nothing buffered.
const { body } = await client.getObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
});
await body.pipeTo((await Deno.create('restored.tar')).writable);
```

Works unchanged against DigitalOcean Spaces, Cloudflare R2 and MinIO. See
[API → Streaming](docs/S3-API.md#streaming).

## License

MIT
